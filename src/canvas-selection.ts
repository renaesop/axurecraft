import type {Page} from './model.ts';
import {canvasIndex,canvasMovable,editCanvas,type CanvasEntry,type CanvasState} from './flow-canvas-model.ts';

export type CanvasArrange='left'|'center'|'right'|'top'|'middle'|'bottom'|'horizontal'|'vertical';
/** Ancestors carry their selected descendants, so no object moves twice. */
export function selectionRoots(ids:string[],index:Map<string,CanvasEntry>):string[]{
 const unique=[...new Set(ids)],selected=new Set(unique);
 for(const id of unique)if(!index.has(id))throw new Error('Unknown canvas selection: '+id);
 return unique.filter(id=>{let parent=index.get(id)!.parent;while(parent){if(selected.has(parent))return false;parent=index.get(parent)!.parent;}return true;});
}
function selection(page:Page,state:CanvasState,ids:string[]){
 const index=canvasIndex(editCanvas(page,state)),roots=selectionRoots(ids,index);
 if(!roots.length||roots.some(id=>!canvasMovable(id,index)))throw new Error('Selection contains read-only objects');
 return {index,roots};
}
export function translateSelection(page:Page,state:CanvasState,ids:string[],dx:number,dy:number):CanvasState {
 if(!Number.isFinite(dx)||!Number.isFinite(dy))throw new Error('Invalid selection translation');
 const {index,roots}=selection(page,state,ids),moves=new Map(state.moves.map(m=>[m.id,m]));
 for(const id of roots){const w=index.get(id)!.widget;moves.set(id,{id,x:w.x+dx,y:w.y+dy});}
 const result={...state,moves:[...moves.values()]};editCanvas(page,result);return result;
}
export function arrangeSelection(page:Page,state:CanvasState,ids:string[],mode:CanvasArrange):CanvasState {
 if(!['left','center','right','top','middle','bottom','horizontal','vertical'].includes(mode))throw new Error('Invalid arrangement');
 const {index,roots}=selection(page,state,ids),distribution=mode==='horizontal'||mode==='vertical';
 if(roots.length<(distribution?3:2))throw new Error('Select more objects to arrange');
 const entries=roots.map(id=>index.get(id)!);
 // Rotated bounds and rotated ancestor coordinates require a transform-aware model.
 for(const entry of entries){let e:CanvasEntry|undefined=entry;while(e){if(e.widget.css.transform)throw new Error('Rotated arrangement is not supported');e=e.parent?index.get(e.parent):undefined;}}
 const axis=['left','center','right','horizontal'].includes(mode)?'x':'y',size=axis==='x'?'width':'height';
 const min=Math.min(...entries.map(e=>e.absolute[axis])),max=Math.max(...entries.map(e=>e.absolute[axis]+e.widget[size]));
 const moves=new Map(state.moves.map(m=>[m.id,m]));
 const place=(e:CanvasEntry,absolute:number)=>{
  const w=e.widget;moves.set(w.id,{id:w.id,x:w.x,y:w.y,[axis]:absolute-e.origin[axis]});
 };
 if(distribution){
  const sorted=entries.slice().sort((a,b)=>a.absolute[axis]-b.absolute[axis]||a.widget.id.localeCompare(b.widget.id));
  const gap=(max-min-sorted.reduce((sum,e)=>sum+e.widget[size],0))/(sorted.length-1);
  let cursor=min;
  for(const e of sorted){place(e,cursor);cursor+=e.widget[size]+gap;}
 }else{
  for(const e of entries)place(e,mode==='left'||mode==='top'?min:mode==='right'||mode==='bottom'?max-e.widget[size]:(min+max-e.widget[size])/2);
 }
 const result={...state,moves:[...moves.values()]};editCanvas(page,result);return result;
}
