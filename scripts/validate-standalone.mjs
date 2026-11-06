import {cpSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
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
  writeFileSync(join(isolated,'source','custom-css-check.tsx'),`import type { ComponentProps } from 'react';
import { RpWidget } from './runtime';
type Style = ComponentProps<typeof RpWidget>['style'];
export const frame: Style = { '--rp-image-border-width': '2px', '--rp-cell-right-width': 1, color: 'red' };
// @ts-expect-error Custom-property support must not allow misspelled ordinary CSS.
export const typo: Style = { backgrounColor: 'red' };
`);
  run(['install','--ignore-scripts','--no-audit','--no-fund']);
  run(['run','build']);
  run(['run','typecheck']);
  cpSync(join(dirname(source),'source'),join(isolated,'vanilla'),{recursive:true});
  writeFileSync(join(isolated,'tsconfig.vanilla.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',strict:true,noEmit:true,allowImportingTsExtensions:true,skipLibCheck:true,lib:['ES2022','DOM','DOM.Iterable']},include:['vanilla/**/*.ts']}));
  run(['exec','--','tsc','--project','tsconfig.vanilla.json']);
  mkdirSync('output',{recursive:true});
  writeFileSync('output/standalone-validation.json',JSON.stringify({source:process.argv[2]??'output/demo/react',independentInstall:true,build:true,typecheck:true,vanillaSourceTypecheck:true,node:process.version},null,2)+'\n');
}finally{rmSync(isolated,{recursive:true,force:true});}
