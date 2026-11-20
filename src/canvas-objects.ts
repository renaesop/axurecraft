import {assertLayerEditable,reconcileLayers} from './canvas-layers.ts';
import type {Page,Widget} from './model.ts';
import {canvasIndex,canvasMovable,canvasResizable,moveCanvas,editCanvas,type CanvasState} from './flow-canvas-model.ts';
import {canvasBase,staticCanvasObject} from './canvas-structure.ts';
import {selectionRoots} from './canvas-selection.ts';
export type CanvasTool='text'|'rectangle'|'ellipse'|'decision'|'button';
export function createCanvasObject(page:Page,state:CanvasState,id:string,tool:CanvasTool):CanvasState {
 if(!/^[\w-]+$/.test(id)||!['text','rectangle','ellipse','decision','button'].includes(tool))throw new Error('Invalid canvas object');
 const widget:Widget={id,name:{text:'文字',rectangle:'矩形',ellipse:'椭圆',decision:'判断',button:'按钮'}[tool],type:tool==='button'?'Button':'Shape',kind:tool==='button'?'control':'shape',
  x:80,y:80,width:140,height:tool==='decision'?100:60,css:tool==='text'?{}:{background:'#edf4ff',border:'1px solid #345','border-radius':tool==='ellipse'?'50%':'4px'},content:[],
  behaviors:[],source:{record:-1,objectId:-1,guid:id,className:'CanvasCreated'}};
 if(tool==='button')widget.content=[{kind:'control',control:'button',label:'按钮',value:'按钮',placeholder:'',disabled:false,readOnly:false}];
 else widget.content=[{kind:'text',css:{},paragraphs:[{css:{'text-align':'center'},runs:[{text:widget.name,css:{}}]}]}];
 if(tool==='decision'){
  widget.css={};widget.content.unshift({kind:'vector',width:140,height:100,preserveAspectRatio:'none',gradients:[],markers:[],paths:[{data:'M 70 0 L 140 50 L 70 100 L 0 50 Z',fill:'#edf4ff',fillOpacity:1,stroke:'#345',strokeWidth:1}]});
 }
 const objects=state.objects??{added:[],removed:[]};
 const next={...state,objects:{...objects,added:[...objects.added,{widget}]}};
 const base=canvasBase(page,next.objects);if(state.layers)Object.assign(next,{layers:reconcileLayers(base,state.layers,canvasIndex(base))});
 editCanvas(page,next);return next;
}
export function duplicateCanvasObjects(page:Page,state:CanvasState,ids:string[],fresh:()=>string):{state:CanvasState;ids:string[]} {
 const current=editCanvas(page,{...state,...(state.layers?{layers:{...state.layers,hidden:[]}}:{})}),index=canvasIndex(current),roots=selectionRoots(ids,index);
 assertLayerEditable(roots,state.layers,index);
 if(!roots.length||roots.some(id=>!canvasMovable(id,index)||!staticCanvasObject(index.get(id)!.widget)))throw new Error('Unsupported canvas copy');
 const copies=roots.map(id=>({parent:index.get(id)!.parent,widget:structuredClone(index.get(id)!.widget)})),map=new Map<string,string>(),used=new Set(canvasIndex(canvasBase(page,state.objects)).keys());
 const allocate=(value:unknown):void=>{
  if(!value||typeof value!=='object')return;
  for(const [key,v] of Object.entries(value)){if(key==='id'&&typeof v==='string'&&!map.has(v)){const id=fresh();if(!/^[\w-]+$/.test(id)||used.has(id))throw new Error('Duplicate copy ID');used.add(id);map.set(v,id);}else allocate(v);}
 };
 copies.forEach(c=>allocate(c.widget));
 for(const c of copies)for(const {widget:w} of canvasIndex({...page,widgets:[c.widget]}).values())if(w.connection){
  for(const end of [w.connection.start,w.connection.end])if(end.target&&!map.has(end.target))throw new Error('Copy of external connector references is not supported');
 }
 const remap=(value:unknown,key=''):unknown=>{
  if(typeof value==='string'){if(['id','target','markerStart','markerEnd','anchor','source'].includes(key)&&map.has(value))return map.get(value);if(key==='text'||key==='value'||key==='name')return value;return value.replace(/url\(#([^)]*)\)/g,(all,id)=>map.has(id)?'url(#'+map.get(id)+')':all);}
  if(Array.isArray(value))return value.map(v=>remap(v,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='source'&&v&&typeof v==='object'&&'guid' in v?v:remap(v,k)]));
  return value;
 };
 for(const c of copies)c.widget=remap(c.widget) as Widget;
 const temporary=structuredClone(current);
 for(const c of copies){const parent=c.parent?canvasIndex(temporary).get(c.parent)!.widget:undefined;(parent?(parent.children??=[]):temporary.widgets).push(c.widget);}
 const relocated=canvasIndex(moveCanvas(temporary,copies.map(c=>({id:c.widget.id,x:c.widget.x+20,y:c.widget.y+20}))));
 for(const c of copies)c.widget=relocated.get(c.widget.id)!.widget;
 const objects=state.objects??{added:[],removed:[]};
 const moves=[...state.moves,...copies.map(c=>({id:c.widget.id,x:c.widget.x,y:c.widget.y}))];
 const sizes=[...state.sizes??[],...copies.filter(c=>canvasResizable(c.widget.id,relocated)).map(c=>({id:c.widget.id,width:c.widget.width,height:c.widget.height}))];
 const next={...state,moves,sizes,objects:{...objects,added:[...objects.added,...JSON.parse(JSON.stringify(copies))]}};
 const base=canvasBase(page,next.objects);if(state.layers){
  const layers=reconcileLayers(base,state.layers,canvasIndex(base))!;
  if(layers.hidden)layers.hidden.push(...(state.layers.hidden??[]).filter(id=>map.has(id)).map(id=>map.get(id)!));
  Object.assign(next,{layers});
 }
 editCanvas(page,next);return {state:next,ids:copies.map(c=>c.widget.id)};
}
export function deleteCanvasObjects(page:Page,state:CanvasState,ids:string[]):CanvasState {
 const index=canvasIndex(editCanvas(page,state)),roots=selectionRoots(ids,index),deleted=new Set<string>();
 if(!roots.length)throw new Error('Select objects to delete');
 const collect=(w:Widget)=>{deleted.add(w.id);for(const child of w.children??[])collect(child);};
 for(const id of roots){const w=index.get(id)!.widget;if(!staticCanvasObject(w)||(!w.connection&&!canvasMovable(id,index)))throw new Error('Read-only canvas deletion');collect(w);}
 for(const {widget:w} of index.values())if(w.connection&&[w.connection.start.target,w.connection.end.target].some(id=>id&&deleted.has(id)))collect(w);
 assertLayerEditable([...deleted],state.layers,index);
 const objects=state.objects??{added:[],removed:[]};
 // Remove descendants through their root; do not record table cells as independent deletions.
 const removed=selectionRoots([...deleted],index);
 const next={...state,moves:state.moves.filter(e=>!deleted.has(e.id)),texts:state.texts.filter(e=>!deleted.has(e.id)),sizes:(state.sizes??[]).filter(e=>!deleted.has(e.id)),objects:{...objects,removed:[...new Set([...objects.removed,...removed])]}};
 const base=canvasBase(page,next.objects);if(state.layers)Object.assign(next,{layers:reconcileLayers(base,state.layers,canvasIndex(base))});
 editCanvas(page,next);return next;
}
