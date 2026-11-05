import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {parseSemanticProject} from './semantic.ts';
import {emitProject} from './emit.ts';
import type {Widget} from './model.ts';
const [input,destination,assetRoot]=process.argv.slice(2);
if(!input||!destination){console.error('Usage: npm run generate -- PROJECT.json OUTPUT_DIRECTORY [ASSET_ROOT]');process.exit(1);}
const project=parseSemanticProject(readFileSync(resolve(input),'utf8'));
const root=resolve(assetRoot??dirname(resolve(input)));
const names=new Set<string>();
function collect(widgets:Widget[]):void {
  for(const w of widgets){
    for(const c of [w.content,...Object.values(w.variants??{}).map(v=>v.content??[])].flat())if(c.kind==='image')names.add(c.asset);
    for(const row of w.repeater?.rows??[]){
      for(const cell of Object.values(row.cells))if(cell.kind==='image'&&cell.asset)names.add(cell.asset);

    }
    if(w.repeater){collect(w.repeater.template);for(const binding of w.repeater.bindings)if(binding.property==='image'&&binding.expression.kind==='literal')names.add(binding.expression.value);}
    collect(w.children??[]);for(const state of w.states??[])collect(state.widgets);
  }
}
for(const page of project.pages)collect(page.widgets);
const assets=new Map([...names].map(name=>[name,readFileSync(resolve(root,name))]));
await emitProject(project,assets,destination,input);
console.log(JSON.stringify({output:resolve(destination),schema:project.schema,pages:project.pages.length,assets:assets.size},null,2));
