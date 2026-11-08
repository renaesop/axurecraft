import type {Page, Widget, CanvasPoint as Point, ConnectorGeometry} from './model.ts';
import {connectorPath, reattachGeometry} from './connector-geometry.ts';

export interface CanvasMove extends Point { id:string }
export interface CanvasDocument {
 schema:'axurecraft-canvas@1'; sourceSha256:string; pageId:string;
 /** Exact immutable baseline prevents applying edits to a different conversion. */
 baseline:string;
 moves:CanvasMove[];
}
export interface CanvasEntry {widget:Widget; parent?:string; origin:Point; absolute:Point}
export function canvasIndex(page:Page):Map<string,CanvasEntry> {
 const result=new Map<string,CanvasEntry>();
 function visit(widgets:Widget[],origin:Point,parent?:string){for(const widget of widgets){
  if(result.has(widget.id))throw new Error('Duplicate canvas ID: '+widget.id);
  const absolute={x:origin.x+widget.x,y:origin.y+widget.y};result.set(widget.id,{widget,parent,origin,absolute});
  visit(widget.children??[],absolute,widget.id);
 }}
 visit(page.widgets,{x:0,y:0});return result;
}
export function canvasReadOnly(w:Widget):boolean {
 return !!(w.connection||w.states||w.repeater||w.adaptive||w.variants||w.panel?.fixed||w.css.transform&&w.kind==='group');
}
export function canvasMovable(id:string,index:Map<string,CanvasEntry>):boolean {
 let entry=index.get(id);if(!entry||canvasReadOnly(entry.widget))return false;
 while(entry.parent){entry=index.get(entry.parent)!;if(entry.widget.kind!=='group'||canvasReadOnly(entry.widget))return false;}
 return true;
}
function paintConnector(w:Widget,g:ConnectorGeometry):void {
 const old=w.connection!.geometry!,all=[g.start,...g.points,g.end,...g.controls??[]];
 const x=Math.min(...all.map(p=>p.x)),y=Math.min(...all.map(p=>p.y)),width=Math.max(...all.map(p=>p.x))-x,height=Math.max(...all.map(p=>p.y))-y;
 const local=(p:Point)=>({x:p.x-x,y:p.y-y});
 for(const c of w.content){
  if(c.kind==='vector'){
   const startHole=c.paths[0]?.markerHoles?.find(h=>Math.hypot(h.x-(old.start.x-w.x),h.y-(old.start.y-w.y))<.001);
   const endHole=c.paths[0]?.markerHoles?.find(h=>Math.hypot(h.x-(old.end.x-w.x),h.y-(old.end.y-w.y))<.001);
   c.width=Math.max(1,width);c.height=Math.max(1,height);
   if(c.paths[0]){c.paths[0].data=connectorPath(w.connection!.routing,[g.start,...g.points,g.end].map(local),g.controls?.map(local));
    if(c.paths[0].markerHoles)c.paths[0].markerHoles=[...(startHole?[{...local(g.start),radius:startHole.radius}]:[]),...(endHole?[{...local(g.end),radius:endHole.radius}]:[])];}
  }else if(c.kind==='text'&&g.label&&old.label){
   // Preserve the native text panel's offset and rich text, not just its center.
   const left=parseFloat(c.css.left??'0'),top=parseFloat(c.css.top??'0');
   c.css.left=`${left+w.x-old.label.x+g.label.x-x}px`;c.css.top=`${top+w.y-old.label.y+g.label.y-y}px`;
  }
 }
 Object.assign(w,{x,y,width,height});w.connection!.geometry=g;
}
/** Moves are always evaluated from the baseline, avoiding cumulative rerouting drift. */
export function moveCanvas(page:Page,moves:CanvasMove[]):Page {
 const result=structuredClone(page),before=canvasIndex(page),after=canvasIndex(result),seen=new Set<string>();
 for(const move of moves){
  if(!Number.isFinite(move.x)||!Number.isFinite(move.y)||seen.has(move.id)||!canvasMovable(move.id,before))throw new Error('Invalid or read-only canvas move: '+move.id);
  seen.add(move.id);Object.assign(after.get(move.id)!.widget,{x:move.x,y:move.y});
 }
 const current=canvasIndex(result);
 for(const [id,old] of before){const c=old.widget.connection;if(!c)continue;
  const entry=current.get(id)!,delta=(target?:string):Point=>{
   const a=target?before.get(target):undefined,b=target?current.get(target):undefined;
   return a&&b?{x:b.absolute.x-a.absolute.x-entry.origin.x+old.origin.x,y:b.absolute.y-a.absolute.y-entry.origin.y+old.origin.y}:{x:0,y:0};
  };
  const ds=delta(c.start.target),de=delta(c.end.target);
  if(!ds.x&&!ds.y&&!de.x&&!de.y)continue;
  if(!c.geometry)throw new Error('Regenerate this project to edit connector geometry: '+id);
  const g=c.geometry;
  paintConnector(entry.widget,reattachGeometry(c.routing,g,{x:g.start.x+ds.x,y:g.start.y+ds.y},{x:g.end.x+de.x,y:g.end.y+de.y}));
 }
 return result;
}
export function saveCanvas(page:Page,sourceSha256:string,moves:CanvasMove[]):CanvasDocument {
 moveCanvas(page,moves);
 return {schema:'axurecraft-canvas@1',sourceSha256,pageId:page.id,baseline:JSON.stringify(page),moves:structuredClone(moves)};
}
export function restoreCanvas(json:string,page:Page,sourceSha256:string):CanvasMove[] {
 const doc:unknown=JSON.parse(json);
 if(!doc||typeof doc!=='object')throw new Error('Invalid canvas document');
 const d=doc as Record<string,unknown>;
 if(d.schema!=='axurecraft-canvas@1'||d.sourceSha256!==sourceSha256||d.pageId!==page.id||d.baseline!==JSON.stringify(page))throw new Error('Canvas baseline conflict: use the original project and page');
 if(!Array.isArray(d.moves)||d.moves.length>canvasIndex(page).size)throw new Error('Invalid moves');
 const moves=d.moves.map((v:unknown):CanvasMove=>{
  if(!v||typeof v!=='object')throw new Error('Invalid move');const m=v as Record<string,unknown>;
  if(typeof m.id!=='string'||typeof m.x!=='number'||typeof m.y!=='number'||!Number.isFinite(m.x)||!Number.isFinite(m.y))throw new Error('Invalid move');
  return {id:m.id,x:m.x,y:m.y};
 });
 moveCanvas(page,moves);return moves;
}
