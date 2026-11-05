import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {basename,dirname,resolve} from 'node:path';
import {parseProject} from '../src/graph.ts';
import {convertRp9} from '../src/convert.ts';
import type {Widget} from '../src/model.ts';

const [output,...files]=process.argv.slice(2);
if(!output||!files.length)throw new Error('Usage: npm run audit:controls -- output/report.json source.rp [source.rplib ...]');
const documents=files.map(file=>{
 try{
  const bytes=readFileSync(file),native=parseProject(bytes),{project}=convertRp9(bytes);
  const types:Record<string,{native:number;converted:number;kinds:string[];issues:Record<string,number>}>={};
  const type=(name:string)=>types[name]??={native:0,converted:0,kinds:[],issues:{}};
  for(const g of native.graphs)for(const w of g.objects.values())if(w.className?.startsWith('Axure:DiagramObject:'))type(w.className.split(':').at(-1)!).native++;
  const visit=(widgets:Widget[])=>{for(const w of widgets){const t=type(w.type);t.converted++;if(!t.kinds.includes(w.kind))t.kinds.push(w.kind);for(const issue of project.issues.filter(i=>i.widget===w.id))t.issues[issue.feature]=(t.issues[issue.feature]??0)+1;visit(w.children??[]);visit(w.repeater?.template??[]);for(const state of w.states??[])visit(state.widgets);}};
  for(const page of project.pages)visit(page.widgets);
  return {file:basename(file),sha256:native.sha256,types,issues:project.issues,stats:project.stats};
 }catch(error){return {file:basename(file),error:String(error)};}
});
const report={scope:'Native class inventory and canonical conversion coverage. Counts include inactive states and repeater templates once; no visual or behavioral equivalence is inferred.',documents};
mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(documents.map(d=>({file:d.file,types:Object.keys(d.types??{}).length,issues:d.issues?.length,error:d.error})));
