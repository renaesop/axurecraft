import {execFileSync,spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
const base=process.env.ISSUE_BASE_SHA;
if(!/^[a-f0-9]{40}$/.test(base??''))throw new Error('ISSUE_BASE_SHA must identify the PR base commit');
execFileSync('git',['fetch','--no-tags','--depth=1','origin',base],{stdio:'inherit'});
const files=execFileSync('git',['diff','--name-only','-z',base,'HEAD','--','scripts'],{encoding:'utf8'}).split('\0').filter(p=>/^scripts\/validate-[\w-]+\.(ts|mjs)$/.test(p)&&p!=='scripts/validate-issue-pr.mjs');
const results=[];
for(const file of files){
  const command=file.endsWith('.ts')?'node_modules/.bin/tsx':'node';
  const result=spawnSync(command,[file],{stdio:'inherit',timeout:300000});
  results.push({file,passed:!result.error&&result.status===0});
  mkdirSync('output',{recursive:true});writeFileSync('output/issue-validation.json',JSON.stringify(results,null,2));
  if(result.error||result.status!==0)throw result.error??new Error(`${file} failed (${result.status??result.signal})`);
}
console.log({additionalValidationScripts:files});
