import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {launchAgentPlist} from '../scripts/install-issue-worker.mjs';
const worker=resolve('scripts/issue-worker.mjs');
function scenario(mode:string){
 const root=mkdtempSync(join(tmpdir(),'axurecraft-worker-test-')),seed=join(root,'seed'),remote=join(root,'remote.git'),bin=join(root,'bin'),state=join(root,'state');
 const git=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 mkdirSync(seed);mkdirSync(bin);mkdirSync(join(seed,'src'));mkdirSync(join(seed,'tests'));
 const pkg={name:'worker-fixture',version:'1.0.0',type:'module',scripts:{'test:ci':'node --experimental-strip-types --test tests/*.test.ts'}};
 writeFileSync(join(seed,'package.json'),JSON.stringify(pkg));writeFileSync(join(seed,'package-lock.json'),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':{name:pkg.name,version:pkg.version}}}));
 writeFileSync(join(seed,'src/clamp.ts'),'export const clamp=(n:number)=>n;');
 writeFileSync(join(seed,'tests/positive.test.ts'),"import assert from 'node:assert/strict';import {clamp} from '../src/clamp.ts';assert.equal(clamp(4),4);");
 git(seed,'init','--initial-branch=main');git(seed,'add','.');git(seed,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture');git(root,'clone','--bare',seed,remote);
 const issue={number:7,title:'Clamp negative numbers',body:'clamp(-1) should be 0',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',labels:[],url:'https://example.invalid/issues/7'};
 const config={mode,root,remote,issue};writeFileSync(join(bin,'config.json'),JSON.stringify(config));
 const prelude=`#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),c=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8')),a=process.argv.slice(2);\n`;
 writeFileSync(join(bin,'gh'),prelude+`
if(a[0]==='issue'&&a[1]==='list')console.log(JSON.stringify([c.issue]));
else if(a[0]==='issue'&&a[1]==='view')console.log(JSON.stringify({...c.issue,state:'OPEN',comments:[]}));
else if(a[0]==='pr'&&a[1]==='list')console.log(fs.existsSync(c.root+'/pr.json')?fs.readFileSync(c.root+'/pr.json','utf8'):'[]');
else if(a[0]==='repo'&&a[1]==='clone'){const r=cp.spawnSync('git',['clone','--quiet',c.remote,a[3]],{stdio:'inherit'});process.exit(r.status);}
else if(a[0]==='pr'&&a[1]==='create'){
 if(!a.includes('--draft'))throw Error('must be draft');
 const head=cp.execFileSync('git',['--git-dir='+c.remote,'rev-parse','refs/heads/automation/issue-7'],{encoding:'utf8'}).trim();
 const files=cp.execFileSync('git',['--git-dir='+c.remote,'diff-tree','--no-commit-id','--name-only','-r',head],{encoding:'utf8'});
 if(!files.includes('src/clamp.ts')||!files.includes('tests/negative.test.ts'))throw Error('missing code or regression');
 fs.writeFileSync(c.root+'/pr.json',JSON.stringify([{headRefName:'automation/issue-7',state:'OPEN'}]));
 fs.writeFileSync(c.root+'/pr.md',fs.readFileSync(a[a.indexOf('--body-file')+1]));console.log('https://example.invalid/pull/1');
}else throw Error('Unexpected gh call '+a.join(' '));
`,{mode:0o755});
 writeFileSync(join(bin,'codex'),prelude+`
if(a[0]==='sandbox'){const n=a.indexOf('--'),r=cp.spawnSync(a[n+1],a.slice(n+2),{stdio:'inherit'});process.exit(r.status);}
if(a[0]!=='exec')throw Error('Unexpected codex call');
fs.appendFileSync(c.root+'/agent-calls','run\\n');
let result={status:'fixed',summary:'Clamp negative values',validation:'Regression added',reason:''};
if(c.mode==='blocked')result={...result,status:'blocked',reason:'RP reproduction is missing'};
else{
 fs.writeFileSync('src/clamp.ts','export const clamp=(n:number)=>Math.max(0,n);');
 fs.writeFileSync('tests/negative.test.ts',"import assert from 'node:assert/strict';import {clamp} from '../src/clamp.ts';assert.equal(clamp(-1),"+(c.mode==='failed'?'99':'0')+");");
 if(c.mode==='scope')fs.writeFileSync('package.json',JSON.stringify({changed:true}));
}
fs.writeFileSync(a[a.indexOf('--output-last-message')+1],JSON.stringify(result));
`,{mode:0o755});
 const invoke=()=>spawnSync(process.execPath,[worker],{env:{...process.env,PATH:bin+':'+process.env.PATH,AXURECRAFT_WORKER_STATE:state},encoding:'utf8',timeout:60000});
 return {root,state,invoke,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('scheduled worker publishes implementation and regression only after checks, then skips its existing draft',()=>{
 const s=scenario('fixed');try{const r=s.invoke();assert.equal(r.status,0,r.stderr);assert.ok(existsSync(join(s.root,'pr.json')));assert.ok(readFileSync(join(s.root,'pr.md'),'utf8').includes('Fixes #7'));const again=s.invoke();assert.equal(again.status,0,again.stderr);assert.equal(readFileSync(join(s.root,'agent-calls'),'utf8'),'run\n');assert.ok(!existsSync(join(s.state,'lock')));}finally{s.cleanup();}
});
test('scheduled worker publishes no PR when verification fails, scope expands, or reproduction is blocked',()=>{
 for(const mode of ['failed','scope','blocked']){const s=scenario(mode);try{const r=s.invoke();assert.equal(r.status,mode==='blocked'?0:1,r.stdout+r.stderr);assert.ok(!existsSync(join(s.root,'pr.json')));const state=JSON.parse(readFileSync(join(s.state,'state.json'),'utf8'));assert.equal(state[7].status,mode==='blocked'?'blocked':'failed');assert.ok(!existsSync(join(s.state,'lock')));}finally{s.cleanup();}}
});
test('launchd configuration uses literal paths, a two-hour interval and no immediate issue mutation',()=>{
 const p=launchAgentPlist({node:'/path with spaces/node',script:'/code & tools/issue-worker.mjs',root:'/state',path:'/usr/bin:/bin'});
 assert.ok(p.includes('<integer>7200</integer>'));assert.ok(p.includes('<key>RunAtLoad</key><false/>'));assert.ok(p.includes('/code &amp; tools/issue-worker.mjs'));assert.ok(!p.includes('/bin/sh'));
});
