import {canvasBase,type CanvasObjects} from './canvas-structure.ts';
import type {Page, Widget, CanvasPoint as Point, ConnectorGeometry} from './model.ts';
import {connectorPath, reattachGeometry} from './connector-geometry.ts';

export interface CanvasMove extends Point { id:string }
export interface CanvasSize {id:string; width:number; height:number}
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
export function canvasResizable(id:string,index:Map<string,CanvasEntry>):boolean {
 const w=index.get(id)?.widget;if(!w||!canvasMovable(id,index))return false;
 const safe=(w:Widget):boolean=>{
  if(w.connection)return !!w.connection.geometry;
  if(canvasReadOnly(w)||w.css.transform||w.width<=0||w.height<=0||w.panel||w.table||w.tree||w.menu||w.kind==='unsupported')return false;
  if(w.children?.length&&w.kind!=='group')return false;
  return (w.children??[]).every(safe);
 };
 return safe(w);
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
export function moveCanvas(page:Page,moves:CanvasMove[],sizes:CanvasSize[]=[]):Page {
 const result=structuredClone(page),before=canvasIndex(page),after=canvasIndex(result),seen=new Set<string>();
 const sizeMap=new Map<string,CanvasSize>();
 for(const size of sizes){
  if(!size||!Number.isFinite(size.width)||!Number.isFinite(size.height)||size.width<1||size.height<1||sizeMap.has(size.id)||!canvasResizable(size.id,before))throw new Error('Invalid or read-only canvas size');
  sizeMap.set(size.id,size);
 }
 const scale=(w:Widget,sx:number,sy:number)=>{
  if(w.connection)return;
  w.width*=sx;w.height*=sy;
  for(const child of w.children??[]){if(child.connection)continue;child.x*=sx;child.y*=sy;scale(child,sx,sy);}
 };
 // Parent sizes apply first; explicit descendant sizes then override their inherited size.
 for(const [id,entry] of after){const size=sizeMap.get(id);if(size)scale(entry.widget,size.width/entry.widget.width,size.height/entry.widget.height);}
 for(const move of moves){
  if(!Number.isFinite(move.x)||!Number.isFinite(move.y)||seen.has(move.id)||!canvasMovable(move.id,before))throw new Error('Invalid or read-only canvas move: '+move.id);
  seen.add(move.id);Object.assign(after.get(move.id)!.widget,{x:move.x,y:move.y});
 }
 const current=canvasIndex(result);
 for(const e of current.values())if(![e.absolute.x,e.absolute.y,e.widget.width,e.widget.height].every(Number.isFinite))throw new Error('Canvas geometry overflow');
 for(const [id,old] of before){const c=old.widget.connection;if(!c)continue;
  const entry=current.get(id)!;
  const parentBefore=old.parent?before.get(old.parent):undefined,parentAfter=entry.parent?current.get(entry.parent):undefined;
  const sx=parentBefore&&parentAfter?parentAfter.widget.width/parentBefore.widget.width:1,sy=parentBefore&&parentAfter?parentAfter.widget.height/parentBefore.widget.height:1;
  const delta=(target?:string):Point=>{
   const a=target?before.get(target):undefined,b=target?current.get(target):undefined;
   return a&&b?{x:b.absolute.x-a.absolute.x-entry.origin.x+old.origin.x,y:b.absolute.y-a.absolute.y-entry.origin.y+old.origin.y}:{x:0,y:0};
  };
  if(!c.geometry){
   const ds=delta(c.start.target),de=delta(c.end.target);
   const resized=[c.start.target,c.end.target].some(t=>t&&before.get(t)&&current.get(t)&&(before.get(t)!.widget.width!==current.get(t)!.widget.width||before.get(t)!.widget.height!==current.get(t)!.widget.height));
   if(ds.x||ds.y||de.x||de.y||sx!==1||sy!==1||resized)throw new Error('Regenerate this project to edit connector geometry: '+id);
   continue;
  }
  const point=(p:Point)=>({x:p.x*sx,y:p.y*sy}),g=c.geometry;
  const scaled:ConnectorGeometry={...g,start:point(g.start),end:point(g.end),points:g.points.map(point),...(g.controls?{controls:g.controls.map(point) as [Point,Point]}:{}),...(g.label?{label:point(g.label)}:{})};
  const endpoint=(side:'start'|'end'):Point=>{
   const target=c[side].target,a=target?before.get(target):undefined,b=target?current.get(target):undefined;
   if(!a||!b)return scaled[side];
   if(a.absolute.x===b.absolute.x&&a.absolute.y===b.absolute.y&&old.origin.x===entry.origin.x&&old.origin.y===entry.origin.y&&a.widget.width===b.widget.width&&a.widget.height===b.widget.height)return g[side];
   const rx=a.widget.width?b.widget.width/a.widget.width:1,ry=a.widget.height?b.widget.height/a.widget.height:1;
   return {x:b.absolute.x+(old.origin.x+g[side].x-a.absolute.x)*rx-entry.origin.x,y:b.absolute.y+(old.origin.y+g[side].y-a.absolute.y)*ry-entry.origin.y};
  };
  const start=endpoint('start'),end=endpoint('end');
  const next=start.x===scaled.start.x&&start.y===scaled.start.y&&end.x===scaled.end.x&&end.y===scaled.end.y?scaled:reattachGeometry(c.routing,scaled,start,end);
  if([next.start,next.end,...next.points,...next.controls??[],...next.label?[next.label]:[]].some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('Canvas connector geometry overflow');
  if(JSON.stringify(next)!==JSON.stringify(g))paintConnector(entry.widget,next);
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

/** Individual authored runs retain their original styles, links and paragraphs. */
export interface CanvasTextEdit {id:string; content:number; paragraph:number; run:number; text:string}
export interface CanvasState {moves:CanvasMove[]; texts:CanvasTextEdit[]; sizes?:CanvasSize[]; objects?:CanvasObjects}
export function canvasTextEditable(id:string,index:Map<string,CanvasEntry>):boolean {
 let e=index.get(id);if(!e)return false;
 while(e){const w=e.widget;if(w.states||w.repeater||w.adaptive||w.variants||w.panel?.fixed)return false;e=e.parent?index.get(e.parent):undefined;}
 return true;
}
export function editCanvas(page:Page,state:CanvasState):Page {
 const result=moveCanvas(canvasBase(page,state.objects),state.moves,state.sizes),index=canvasIndex(result),seen=new Set<string>();
 for(const edit of state.texts){
  const key=JSON.stringify([edit.id,edit.content,edit.paragraph,edit.run]);
  if(typeof edit.text!=='string'||![edit.content,edit.paragraph,edit.run].every(n=>Number.isSafeInteger(n)&&n>=0)||seen.has(key)||!canvasTextEditable(edit.id,index))throw new Error('Invalid canvas text edit');
  const c=index.get(edit.id)!.widget.content[edit.content];
  const run=c?.kind==='text'?c.paragraphs[edit.paragraph]?.runs[edit.run]:undefined;
  if(!run)throw new Error('Invalid canvas text target');
  seen.add(key);run.text=edit.text;
 }
 return result;
}
export function saveCanvasState(page:Page,sourceSha256:string,state:CanvasState) {
 editCanvas(page,state);
 return {schema:'axurecraft-canvas@4',sourceSha256,pageId:page.id,baseline:JSON.stringify(page),moves:structuredClone(state.moves),texts:structuredClone(state.texts),sizes:structuredClone(state.sizes??[]),...(state.objects?{objects:structuredClone(state.objects)}:{})};
}
export function restoreCanvasState(json:string,page:Page,sourceSha256:string):CanvasState {
 const d=JSON.parse(json);
 if(d?.schema==='axurecraft-canvas@1')return {moves:restoreCanvas(json,page,sourceSha256),texts:[]};
 if(!['axurecraft-canvas@2','axurecraft-canvas@3','axurecraft-canvas@4'].includes(d?.schema)||!Array.isArray(d.texts))throw new Error('Invalid canvas document');
 if(d.sourceSha256!==sourceSha256||d.pageId!==page.id||d.baseline!==JSON.stringify(page))throw new Error('Canvas baseline conflict');
 const objects=d.schema==='axurecraft-canvas@4'?d.objects as CanvasObjects|undefined:undefined,base=canvasBase(page,objects);
 const moves=restoreCanvas(JSON.stringify({...d,schema:'axurecraft-canvas@1',baseline:JSON.stringify(base)}),base,sourceSha256);
 const texts=d.texts.map((e:unknown)=>{
  if(!e||typeof e!=='object')throw new Error('Invalid canvas text edit');
  const t=e as CanvasTextEdit;
  return {id:t.id,content:t.content,paragraph:t.paragraph,run:t.run,text:t.text};
 });
 if(['axurecraft-canvas@3','axurecraft-canvas@4'].includes(d.schema)&&!Array.isArray(d.sizes))throw new Error('Invalid canvas sizes');
 const sizes=(['axurecraft-canvas@3','axurecraft-canvas@4'].includes(d.schema)?d.sizes:undefined) as CanvasSize[]|undefined;
 const state={moves,texts,...(sizes?.length?{sizes}: {}),...(objects?{objects}:{})};editCanvas(page,state);return state;
}

/** Update a size transaction relative to the current view, including explicit child overrides. */
export function resizeCanvasState(page:Page,state:CanvasState,size:CanvasSize,position?:Point):CanvasState {
 const index=canvasIndex(editCanvas(page,state)),entry=index.get(size.id);
 if(!entry||!canvasResizable(size.id,index))throw new Error('Read-only canvas size');
 const sx=size.width/entry.widget.width,sy=size.height/entry.widget.height;
 const descendants=new Set<string>();
 const visit=(w:Widget)=>{for(const child of w.children??[]){descendants.add(child.id);visit(child);}};visit(entry.widget);
 const moves=state.moves.map(m=>descendants.has(m.id)?{...m,x:m.x*sx,y:m.y*sy}:{...m});
 if(position){const i=moves.findIndex(m=>m.id===size.id),move={id:size.id,...position};if(i<0)moves.push(move);else moves[i]=move;}
 const sizes=(state.sizes??[]).filter(s=>s.id!==size.id).map(s=>descendants.has(s.id)?{...s,width:s.width*sx,height:s.height*sy}:{...s});
 sizes.push(size);
 const next={...state,moves,sizes};editCanvas(page,next);return next;
}
