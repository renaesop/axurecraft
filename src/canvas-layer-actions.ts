import type {Page} from './model.ts';
import {canvasIndex,canvasMovable,editCanvas,type CanvasState} from './flow-canvas-model.ts';
import {assertLayerEditable} from './canvas-layers.ts';
import {selectionRoots} from './canvas-selection.ts';
export type LayerCommand='front'|'back'|'forward'|'backward';
export function setLayerFlag(page:Page,state:CanvasState,ids:string[],flag:'hidden'|'locked',enabled:boolean):CanvasState {
 const index=canvasIndex(editCanvas(page,state));
 if(!ids.length||ids.some(id=>!index.has(id)))throw new Error('Select existing objects');
 if(flag==='hidden')assertLayerEditable(ids,state.layers,index);
 const values=new Set(state.layers?.[flag]??[]);
 for(const id of ids){if(enabled)values.add(id);else values.delete(id);}
 const next={...state,layers:{...state.layers,[flag]:[...values]}};editCanvas(page,next);return next;
}
export function reorderLayers(page:Page,state:CanvasState,ids:string[],command:LayerCommand):CanvasState {
 if(!['front','back','forward','backward'].includes(command))throw new Error('Invalid layer command');
 const current=editCanvas(page,state),index=canvasIndex(current),roots=selectionRoots(ids,index);
 if(!roots.length)throw new Error('Select objects to reorder');
 assertLayerEditable(roots,state.layers,index);
 const orders=new Map((state.layers?.order??[]).map(o=>[o.parent,o]));
 for(const parent of new Set(roots.map(id=>index.get(id)!.parent))){
  if(parent!==undefined&&(index.get(parent)!.widget.kind!=='group'||!canvasMovable(parent,index)))throw new Error('Read-only layer parent');
  const list=(parent===undefined?current.widgets:index.get(parent)!.widget.children??[]).map(w=>w.id);
  const selected=new Set(roots.filter(id=>index.get(id)!.parent===parent));
  let ordered=list.slice();
  if(command==='front')ordered=[...list.filter(id=>!selected.has(id)),...list.filter(id=>selected.has(id))];
  else if(command==='back')ordered=[...list.filter(id=>selected.has(id)),...list.filter(id=>!selected.has(id))];
  else if(command==='forward'){for(let i=ordered.length-2;i>=0;i--)if(selected.has(ordered[i])&&!selected.has(ordered[i+1]))[ordered[i],ordered[i+1]]=[ordered[i+1],ordered[i]];}
  else for(let i=1;i<ordered.length;i++)if(selected.has(ordered[i])&&!selected.has(ordered[i-1]))[ordered[i],ordered[i-1]]=[ordered[i-1],ordered[i]];
  orders.set(parent,{...(parent!==undefined?{parent}:{}),ids:ordered});
 }
 const next={...state,layers:{...state.layers,order:[...orders.values()]}};editCanvas(page,next);return next;
}
