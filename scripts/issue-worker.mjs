import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,rmSync,openSync,closeSync,lstatSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {branchFor,fingerprint,chooseIssue,checkChanges,issuePrompt,prBody} from './issue-policy.mjs';

const args=process.argv.slice(2),dry=args.includes('--dry-run');
const repository='renaesop/axurecraft';
const root=resolve(process.env.AXURECRAFT_WORKER_STATE??join(homedir(),'.local/state/axurecraft-issue-worker'));
const stateFile=join(root,'state.json'),lock=join(root,'lock'),logRoot=join(root,'runs');
mkdirSync(logRoot,{recursive:true});
function run(command,argv,{cwd,log,input,env,timeout=120000}={}){
  const fd=log?openSync(log,'a',0o600):undefined;
  try{
    const result=spawnSync(command,argv,{cwd,env:env??process.env,input,encoding:'utf8',timeout,killSignal:'SIGKILL',maxBuffer:32*1024*1024,stdio:fd===undefined?'pipe':['pipe',fd,fd]});
    if(result.error)throw result.error;
    if(result.status!==0)throw new Error(`${command} ${argv[0]} failed (${result.status??result.signal})${log?`; see ${log}`:': '+(result.stderr??'').slice(0,1000)}`);
    return result.stdout??'';
  }finally{if(fd!==undefined)closeSync(fd);}
}
const gh=argv=>run('gh',argv);
const git=(cwd,argv)=>run('git',argv,{cwd}).trim();
const json=argv=>JSON.parse(gh(argv));
const save=state=>{writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(stateFile+'.tmp',stateFile);};
function main(){
let locked=false,issue,state={},runDir;
try{
  try{mkdirSync(lock);locked=true;writeFileSync(join(lock,'pid'),String(process.pid));}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const pid=Number(readFileSync(join(lock,'pid'),'utf8'));
    try{process.kill(pid,0);console.log('Another issue worker is running');return;}
    catch(e){if(e.code!=='ESRCH')throw e;rmSync(lock,{recursive:true});mkdirSync(lock);locked=true;writeFileSync(join(lock,'pid'),String(process.pid));}
  }
  if(existsSync(stateFile))state=JSON.parse(readFileSync(stateFile,'utf8'));
  const issues=json(['issue','list','--repo',repository,'--state','open','--limit','1000','--json','number,title,body,createdAt,updatedAt,url,labels']);
  const prs=json(['pr','list','--repo',repository,'--state','all','--limit','1000','--json','number,headRefName,state,url']);
  issue=chooseIssue(issues,prs,state);
  if(!issue){console.log(JSON.stringify({status:'idle',openIssues:issues.length,repository}));return;}
  if(dry){console.log(JSON.stringify({status:'selected',issue:issue.number,title:issue.title,branch:branchFor(issue.number)}));return;}
  runDir=join(logRoot,new Date().toISOString().replaceAll(':','-')+'-issue-'+issue.number);mkdirSync(runDir);
  const workspace=join(runDir,'repo');
  const detail=json(['issue','view',String(issue.number),'--repo',repository,'--json','number,title,body,url,comments']);
  // Pass issue text through JSON/stdin only, never interpolate it into shell code.
  writeFileSync(join(runDir,'issue.json'),JSON.stringify(detail,null,2),{mode:0o600});
  run('gh',['repo','clone',repository,workspace,'--','--depth=1'],{log:join(runDir,'setup.log')});
  const base=git(workspace,['branch','--show-current']),head=git(workspace,['rev-parse','HEAD']);
  const branch=branchFor(issue.number);
  if(git(workspace,['ls-remote','--heads','origin',branch]))throw new Error(`Remote branch ${branch} exists; inspect it instead of overwriting`);
  git(workspace,['switch','-c',branch]);
  // Install only the unchanged default-branch dependencies, without lifecycle hooks.
  run('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:workspace,log:join(runDir,'setup.log'),timeout:300000});
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const profile=['-c','permissions.axurecraft-worker={extends=":workspace",filesystem={"~/.codex"="deny","~/.config/gh"="deny","~/.ssh"="deny","~/.aws"="deny","~/.happy"="deny"},network={enabled=false}}'];
  const sandbox=argv=>run('codex',['sandbox','-P','axurecraft-worker',...profile,'-C',workspace,'--',...argv],{cwd:workspace,env,log:join(runDir,'verification.log'),timeout:300000});
  sandbox(['npm','run','test:ci']);
  const schema={type:'object',properties:{status:{type:'string',enum:['fixed','blocked']},summary:{type:'string'},validation:{type:'string'},reason:{type:'string'}},required:['status','summary','validation','reason'],additionalProperties:false};
  const schemaFile=join(runDir,'result.schema.json'),resultFile=join(runDir,'result.json');
  writeFileSync(schemaFile,JSON.stringify(schema));
  run('codex',['exec','--ignore-user-config','--ignore-rules','--ephemeral',...profile,'-c','default_permissions="axurecraft-worker"','-c','approval_policy="never"','-c','features.multi_agent=false','-c','web_search="disabled"','-C',workspace,'--output-schema',schemaFile,'--output-last-message',resultFile,'-'],{cwd:workspace,env,input:issuePrompt(detail),log:join(runDir,'agent.log'),timeout:45*60*1000});
  const result=JSON.parse(readFileSync(resultFile,'utf8'));
  if(!['fixed','blocked'].includes(result.status)||!['summary','validation','reason'].every(k=>typeof result[k]==='string'))throw new Error('Invalid worker result');
  if(result.status==='blocked'){
    state[issue.number]={fingerprint:fingerprint(issue),status:'blocked',at:new Date().toISOString(),reason:result.reason,runDir};save(state);
    console.log(JSON.stringify({status:'blocked',issue:issue.number,reason:result.reason,runDir}));return;
  }
  if(git(workspace,['rev-parse','HEAD'])!==head)throw new Error('Worker unexpectedly changed HEAD');
  const files=run('git',['status','--porcelain=v1','-z','--untracked-files=all'],{cwd:workspace}).split('\0').filter(Boolean).map(entry=>({path:entry.slice(3),status:entry.slice(0,2).trim()==='??'?'A':entry.slice(0,2).trim()}));
  const changes=files.map(f=>{const s=lstatSync(join(workspace,f.path));return {...f,mode:s.isSymbolicLink()?'120000':s.isFile()?s.mode&0o111?'100755':'100644':'040000'};});
  checkChanges(changes);
  // Only known, fixed commands execute here. Agent-reported command strings are not executed.
  sandbox(['npm','run','test:ci']);
  git(workspace,['diff','--check']);
  const changedScripts=changes.map(c=>c.path).filter(p=>/^scripts\/validate-[\w-]+\.(ts|mjs)$/.test(p));
  const current=json(['issue','view',String(issue.number),'--repo',repository,'--json','state,updatedAt']);
  if(current.state!=='OPEN'||current.updatedAt!==issue.updatedAt)throw new Error('Issue changed during implementation; retry against its latest contents');
  git(workspace,['add','--',...changes.map(c=>c.path)]);
  git(workspace,['-c','user.name=AxureCraft issue worker','-c','user.email=issue-worker@users.noreply.github.com','commit','-m',`Fix issue #${issue.number} with regression coverage`]);
  run('git',['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','origin',`HEAD:refs/heads/${branch}`],{cwd:workspace,log:join(runDir,'publish.log')});
  const bodyFile=join(runDir,'pr.md');writeFileSync(bodyFile,prBody(issue,result,changedScripts));
  const url=gh(['pr','create','--repo',repository,'--draft','--base',base,'--head',branch,'--title',`Fix #${issue.number}: ${issue.title}`.slice(0,240),'--body-file',bodyFile]).trim();
  state[issue.number]={fingerprint:fingerprint(issue),status:'pr',at:new Date().toISOString(),url,runDir};save(state);
  console.log(JSON.stringify({status:'pr',issue:issue.number,url,runDir}));
}catch(error){
  if(issue&&!dry){state[issue.number]={fingerprint:fingerprint(issue),status:'failed',at:new Date().toISOString(),reason:error.message,runDir};save(state);}
  console.error(error.message);process.exitCode=1;
}finally{if(locked)rmSync(lock,{recursive:true,force:true});}
}
main();
