import type {Page,Widget} from './model.ts';
import type {CanvasEntry} from './flow-canvas-model.ts';
export interface CanvasLayers {order?:{parent?:string;ids:string[]}[];hidden?:string[];locked?:string[]}
export function layerLocked(id:string,layers:CanvasLayers|undefined,index:Map<string,CanvasEntry>):boolean {
 if(!layers?.locked?.length)return false;
 const locks=new Set(layers.locked);let e=index.get(id);
 while(e){if(locks.has(e.widget.id))return true;e=e.parent?index.get(e.parent):undefined;}
 const visit=(w:Widget):boolean=>locks.has(w.id)||(w.children??[]).some(visit);
 const w=index.get(id)?.widget;return !!w&&visit(w);
}
export function assertLayerEditable(ids:string[],layers:CanvasLayers|undefined,index:Map<string,CanvasEntry>):void {
 if(ids.some(id=>layerLocked(id,layers,index)))throw new Error('Unlock the object or its locked parent/children first');
}
function siblings(page:Page,index:Map<string,CanvasEntry>,parent?:string):Widget[] {
 if(parent===undefined)return page.widgets;
 const w=index.get(parent)?.widget;if(!w||w.kind!=='group')throw new Error('Invalid layer parent');
 return w.children??[];
}
export function applyCanvasLayers(page:Page,layers:CanvasLayers|undefined,index:Map<string,CanvasEntry>):Page {
 if(layers===undefined)return page;
 if(!layers||typeof layers!=='object')throw new Error('Invalid canvas layers');
 for(const key of ['hidden','locked'] as const){
  const ids=layers[key];if(ids===undefined)continue;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!index.has(id)))throw new Error('Invalid layer IDs');
 }
 if(layers.order!==undefined&&!Array.isArray(layers.order))throw new Error('Invalid layer order');
 const seen=new Set<string|undefined>();
 for(const order of layers.order??[]){
  if(!order||seen.has(order.parent)||!Array.isArray(order.ids))throw new Error('Invalid layer order');
  seen.add(order.parent);const list=siblings(page,index,order.parent),byId=new Map(list.map(w=>[w.id,w]));
  if(order.ids.length!==list.length||new Set(order.ids).size!==list.length||order.ids.some(id=>!byId.has(id)))throw new Error('Layer order must be a sibling permutation');
  const ordered=order.ids.map(id=>byId.get(id)!);
  if(order.parent===undefined)page.widgets=ordered;else index.get(order.parent)!.widget.children=ordered;
 }
 for(const id of layers.hidden??[])index.get(id)!.widget.css.display='none';
 return page;
}
/** Maintain explicit sibling permutations after object creation/deletion. */
export function reconcileLayers(page:Page,layers:CanvasLayers|undefined,index:Map<string,CanvasEntry>):CanvasLayers|undefined {
 if(!layers)return undefined;
 return {
  ...(layers.locked?{locked:layers.locked.filter(id=>index.has(id))}:{}),
  ...(layers.hidden?{hidden:layers.hidden.filter(id=>index.has(id))}:{}),
  ...(layers.order?{order:layers.order.filter(o=>o.parent===undefined||index.get(o.parent)?.widget.kind==='group').map(o=>{
   const ids=siblings(page,index,o.parent).map(w=>w.id),kept=o.ids.filter(id=>ids.includes(id));
   return {...o,ids:[...kept,...ids.filter(id=>!kept.includes(id))]};
  })}:{})
 };
}
