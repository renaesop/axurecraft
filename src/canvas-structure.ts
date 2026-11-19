import type {Page,Widget} from './model.ts';
import {parseSemanticProject} from './semantic.ts';
import {canvasIndex,canvasMovable} from './flow-canvas-model.ts';
export interface CanvasObjects {added:{parent?:string;widget:Widget}[];removed:string[]}
export function staticCanvasObject(w:Widget):boolean {
 return !w.states&&!w.repeater&&!w.adaptive&&!w.variants&&!w.panel&&!w.tree&&!w.menu&&w.kind!=='unsupported'&&
  (w.children??[]).every(staticCanvasObject);
}
/** Apply structural edits before position/text/size edits. Original IDs cannot be recycled. */
export function canvasBase(page:Page,objects?:CanvasObjects):Page {
 if(objects===undefined)return page;
 if(!objects||typeof objects!=='object'||!Array.isArray(objects.added)||!Array.isArray(objects.removed))throw new Error('Invalid canvas objects');
 const result=structuredClone(page),ids=new Set(canvasIndex(page).keys());
 for(const addition of objects.added){
  if(!addition||!addition.widget||(addition.parent!==undefined&&typeof addition.parent!=='string'))throw new Error('Invalid canvas addition');
  parseSemanticProject(JSON.stringify({schema:'axure-semantic',schemaVersion:2,sourceSha256:'0'.repeat(64),pages:[{...page,widgets:[addition.widget]}],issues:[],stats:{}}));
  if(!staticCanvasObject(addition.widget))throw new Error('Dynamic object creation is not supported');
  const entries=canvasIndex({...page,widgets:[addition.widget]});
  for(const id of entries.keys()){if(ids.has(id))throw new Error('Duplicate canvas ID: '+id);ids.add(id);}
  const index=canvasIndex(result),parent=addition.parent?index.get(addition.parent)?.widget:undefined;
  if(addition.parent&&(!parent||parent.kind!=='group'||!canvasMovable(parent.id,index)))throw new Error('Invalid addition parent');
  (parent?(parent.children??=[]):result.widgets).push(structuredClone(addition.widget));
 }
 const index=canvasIndex(result),removed=new Set<string>();
 for(const id of objects.removed){
  const entry=index.get(id);
  if(typeof id!=='string'||removed.has(id)||!entry||!staticCanvasObject(entry.widget))throw new Error('Invalid canvas deletion');
  if(!entry.widget.connection&&!canvasMovable(id,index))throw new Error('Read-only canvas deletion');
  removed.add(id);
 }
 const prune=(widgets:Widget[]):Widget[]=>widgets.filter(w=>!removed.has(w.id)).map(w=>({...w,...(w.children?{children:prune(w.children)}:{})}));
 result.widgets=prune(result.widgets);
 const remaining=canvasIndex(result);
 for(const e of remaining.values())if(e.widget.connection)for(const end of [e.widget.connection.start,e.widget.connection.end]){
  if(end.target&&index.has(end.target)&&!remaining.has(end.target))throw new Error('Deletion leaves a connector reference');
 }
 // Inspect all target references, including nested expressions and rich-text links.
 const refs=(v:unknown):void=>{
  if(!v||typeof v!=='object')return;
  for(const [key,value] of Object.entries(v)){
   if(['target','trigger','source'].includes(key)&&typeof value==='string'&&index.has(value)&&!remaining.has(value))throw new Error('Deletion leaves a behavior reference');
   refs(value);
  }
 };
 refs(result);
 return result;
}
