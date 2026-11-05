import {cpSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

// Exercise the actual consumer workflow without resolving the repository's deps.
const source=resolve(process.argv[2]??'output/demo/react');
const isolated=mkdtempSync(join(tmpdir(),'axurecraft-standalone-'));
const run=args=>{
  const result=spawnSync('npm',args,{cwd:isolated,stdio:'inherit',env:{...process.env,NODE_PATH:''}});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`npm ${args.join(' ')} failed (${result.status??result.signal})`);
};
try{
  cpSync(source,isolated,{recursive:true,filter:path=>basename(path)!=='node_modules'});
  run(['install','--ignore-scripts','--no-audit','--no-fund']);
  run(['run','build']);
  run(['run','typecheck']);
  mkdirSync('output',{recursive:true});
  writeFileSync('output/standalone-validation.json',JSON.stringify({source:process.argv[2]??'output/demo/react',independentInstall:true,build:true,typecheck:true,node:process.version},null,2)+'\n');
}finally{rmSync(isolated,{recursive:true,force:true});}
