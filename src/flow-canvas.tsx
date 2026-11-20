import {layerLocked} from './canvas-layers.ts';
import {reorderLayers,setLayerFlag,type LayerCommand} from './canvas-layer-actions.ts';
import {canvasBase} from './canvas-structure.ts';
import {createCanvasObject,duplicateCanvasObjects,deleteCanvasObjects,type CanvasTool} from './canvas-objects.ts';
import {createElement, useMemo, useEffect, useRef, useState, type ReactNode} from 'react';
import {ReactFlow, Controls, Background, NodeResizer, Handle, Position, applyNodeChanges, type Node, type Edge, type NodeProps, type EdgeProps, type NodeChange} from '@xyflow/react';
import {selectAllCanvasObjects,arrangeSelection,translateSelection,selectionRoots,type CanvasArrange} from './canvas-selection.ts';
import {materializePage} from './repeater-model.ts';
import type {Page, Widget} from './model.ts';
import {widgetElement, type ElementNode} from './render-tree.ts';
import {reactAttribute,reactStyle} from './react-props.ts';
import {canvasIndex,canvasMovable,canvasResizable,resizeCanvasState,canvasTextEditable,editCanvas,saveCanvasState,restoreCanvasState,type CanvasState} from './flow-canvas-model.ts';

type CanvasNode=Node<{widget?:Widget; baseline?:Widget; resizable?:boolean; lock?:boolean; onResize?:(id:string,p:{x:number;y:number;width:number;height:number})=>void; onResizeStart?:()=>void; onResizeEnd?:()=>void},'widget'|'anchor'>;
type CanvasEdge=Edge<{widget:Widget;x:number;y:number},'native'>;
/** Render the shared structured tree with React, without HTML injection or prototype events. */
function element(node:ElementNode|string,key:number|string):ReactNode {
 if(typeof node==='string')return node;
 if(node.tag==='iframe')return <div key={key} role="img" aria-label={String(node.attrs.title??'内联框架')} style={{...reactStyle(node.css??{}),background:'#f4f6fa',border:'1px dashed #8490a0',padding:8}}>内联框架：{String(node.attrs.title??'预览占位')}</div>;
 const props:Record<string,unknown>={key,...Object.fromEntries(Object.entries(node.attrs).filter(([k])=>k!=='data-rp-link').map(([k,v])=>[node.tag==='option'&&k==='value'?'value':reactAttribute(k),v])),style:node.css?reactStyle(node.css):undefined};
 if(node.tag==='option')delete props.selected;
 if(node.tag==='select'&&node.attrs.multiple)props.defaultValue=node.children.flatMap(c=>typeof c!=='string'&&c.attrs.selected?[String(c.attrs.value??'')]:[]);
 if(node.tag==='textarea'){props.defaultValue=node.children.filter(c=>typeof c==='string').join('');return createElement(node.tag,props);}
 if(['input','br','img'].includes(node.tag))return createElement(node.tag,props);
 return createElement(node.tag,props,...node.children.map(element));
}
function WidgetPaint({widget,baseline}:{widget:Widget;baseline?:Widget}) {
 const tree=widgetElement({...widget,x:0,y:0,children:widget.kind==='group'?[]:widget.children});
 if(baseline&&!widget.connection&&(baseline.width!==widget.width||baseline.height!==widget.height)){
  for(const child of tree.children)if(typeof child!=='string'&&child.tag==='svg'){
   child.attrs.width=Number(child.attrs.width)*widget.width/baseline.width;
   child.attrs.height=Number(child.attrs.height)*widget.height/baseline.height;
   child.attrs.preserveAspectRatio='none';
  }
 }
 return <div style={{pointerEvents:'none'}}>{element(tree,widget.id)}</div>;
}
function CanvasWidget({id,data,selected}:NodeProps<CanvasNode>){return <>
 {data.resizable&&<NodeResizer isVisible={selected} minWidth={1} minHeight={1} keepAspectRatio={data.lock} onResizeStart={data.onResizeStart} onResize={(_e,p)=>data.onResize?.(id,p)} onResizeEnd={data.onResizeEnd}/>}
 {data.widget&&<WidgetPaint widget={data.widget} baseline={data.baseline}/>}
 <Handle type="source" position={Position.Top} id="out" style={{opacity:0,pointerEvents:'none'}}/>
 <Handle type="target" position={Position.Top} id="in" style={{opacity:0,pointerEvents:'none'}}/>
 </>;}
function NativeEdge({data}:EdgeProps<CanvasEdge>){if(!data)return null;const {widget,x,y}=data;
 return <foreignObject x={x} y={y} width={Math.max(1,widget.width)} height={Math.max(1,widget.height)} style={{overflow:'visible',pointerEvents:'none'}}><WidgetPaint widget={widget}/></foreignObject>;
}
const nodeTypes={widget:CanvasWidget,anchor:CanvasWidget},edgeTypes={native:NativeEdge};
function graph(page:Page):{nodes:CanvasNode[];edges:CanvasEdge[]} {
 const editableIndex=canvasIndex(page);page=materializePage(page);
 const nodes:CanvasNode[]=[],edges:CanvasEdge[]=[],index=canvasIndex(page),connectors:string[]=[];
 const paintOrder=new Map([...index.keys()].map((id,i)=>[id,i]));
 const hidden=(id:string)=>{let entry=index.get(id);while(entry){if(entry.widget.css.display==='none')return true;entry=entry.parent?index.get(entry.parent):undefined;}return false;};
 function visit(widgets:Widget[],parentId?:string){for(const w of widgets){const zIndex=paintOrder.get(w.id)!;
  if(w.connection){connectors.push(w.id);continue;}
  nodes.push({id:w.id,type:'widget',parentId,position:{x:w.x,y:w.y},width:Math.max(1,w.width),height:Math.max(1,w.height),data:{widget:w},draggable:canvasMovable(w.id,editableIndex),connectable:false,deletable:false,zIndex,hidden:hidden(w.id),style:{width:Math.max(1,w.width),height:Math.max(1,w.height)}});
  if(w.kind==='group')visit(w.children??[],w.id);
 }}
 visit(page.widgets);
 const visible=new Set(nodes.map(n=>n.id));let anchorPrefix='canvas-anchor:';while([...index.keys()].some(id=>id.startsWith(anchorPrefix)))anchorPrefix+=':';
 for(const id of connectors){const entry=index.get(id)!,w=entry.widget,c=w.connection!;
  const ends=(['start','end'] as const).map(side=>{
   if(c[side].target&&visible.has(c[side].target!))return c[side].target!;
   const aid=anchorPrefix+id+':'+side,p=c.geometry?.[side]??{x:w.x,y:w.y};
   nodes.push({id:aid,type:'anchor',position:{x:entry.origin.x+p.x,y:entry.origin.y+p.y},width:1,height:1,data:{},draggable:false,selectable:false,connectable:false,deletable:false,style:{width:1,height:1,opacity:0,pointerEvents:'none'}});return aid;
  });
  // Keep native paint order across nodes and edges; no auto layout / auto routing.
  const zIndex=paintOrder.get(id)!;
  edges.push({id,type:'native',source:ends[0],target:ends[1],sourceHandle:'out',targetHandle:'in',data:{widget:w,x:entry.absolute.x,y:entry.absolute.y},zIndex,selectable:false,deletable:false,reconnectable:false,hidden:hidden(w.id)});
 }
 return {nodes,edges};
}
export function FlowCanvas({page,sourceSha256}:{page:Page;sourceSha256:string}){

 const empty:CanvasState={moves:[],texts:[]};
 const [history,setHistory]=useState<CanvasState[]>([empty]),[cursor,setCursor]=useState(0);
 const state=history[cursor],moves=state.moves;
 const [message,setMessage]=useState(''),[revision,setRevision]=useState(0),[selected,setSelected]=useState<string[]>([]),[snap,setSnap]=useState(false),[lock,setLock]=useState(false);
 const clickSelection=useRef<string[]>([]);
 const [nodeMeta,setNodeMeta]=useState<CanvasNode[]>([]);
 const [dragBase,setDragBase]=useState<CanvasState|null>(null);
 const commit=(next:CanvasState,replace=false)=>{
  try{editCanvas(page,next);if(JSON.stringify(next)===JSON.stringify(state))return;
   if(replace){setHistory(h=>h.map((s,i)=>i===cursor?next:s));}
   else {setHistory([...history.slice(0,cursor+1),next]);setCursor(cursor+1);}
   setMessage('');
  }catch(e){setMessage(String(e));}
 };
 const edited=useMemo(()=>editCanvas(page,state),[page,state]),view=useMemo(()=>graph(edited),[edited]),index=canvasIndex(edited);
 useEffect(()=>{setSelected(ids=>ids.some(id=>!index.has(id))?ids.filter(id=>index.has(id)):ids);},[edited]);
 const base=canvasBase(page,state.objects),baseline=canvasIndex(base);
 const resize=(id:string,p:{width:number;height:number;x?:number;y?:number})=>{
  try{commit(resizeCanvasState(page,state,{id,width:p.width,height:p.height},p.x!==undefined&&p.y!==undefined?{x:p.x,y:p.y}:undefined),dragBase!==null&&state!==dragBase);}
  catch(e){setMessage(String(e));}
 };
 const batchMovable=!selected.length||selectionRoots(selected.filter(id=>index.has(id)),index).every(id=>canvasMovable(id,index)&&!layerLocked(id,state.layers,index));
 const previousById=new Map(nodeMeta.map(n=>[n.id,n]));
 const nodes=view.nodes.map(n=>{const previous=previousById.get(n.id);return {...n,draggable:n.draggable&&!layerLocked(n.id,state.layers,index)&&(!selected.includes(n.id)||batchMovable),data:{...n.data,baseline:baseline.get(n.id)?.widget,resizable:selected.length===1&&canvasResizable(n.id,index)&&!layerLocked(n.id,state.layers,index),lock,onResize:resize,onResizeStart:()=>setDragBase(state),onResizeEnd:()=>setDragBase(null)},measured:previous?.measured,selected:selected.includes(n.id),dragging:previous?.dragging};});
 const changes=(changes:NodeChange<CanvasNode>[])=>{
  setNodeMeta(applyNodeChanges(changes,nodes));
  const selectionChanges=changes.filter(c=>c.type==='select');
  if(selectionChanges.length)setSelected(previous=>{const ids=new Set(previous);for(const c of selectionChanges)if(c.type==='select'){if(c.selected)ids.add(c.id);else ids.delete(c.id);}return [...ids];});
  if(changes.some(c=>c.type==='dimensions'&&c.resizing!==undefined))return;
  const positions=changes.filter(c=>c.type==='position').filter(c=>c.position);
  if(!positions.length)return;
  const roots=new Set(selectionRoots(positions.map(c=>c.id),index));
  if([...roots].some(id=>layerLocked(id,state.layers,index))){setMessage('请先解锁对象或其父子项');return;}
  const next=new Map(moves.map(m=>[m.id,m]));for(const c of positions)if(c.type==='position'&&c.position&&roots.has(c.id))next.set(c.id,{id:c.id,...c.position});
  commit({...state,moves:[...next.values()]},dragBase!==null&&state!==dragBase);
 };
 const download=()=>{const blob=new Blob([JSON.stringify(saveCanvasState(page,sourceSha256,state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=page.id+'.canvas.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('画布已保存');};
 const objectAction=(action:'copy'|'delete'|CanvasTool)=>{try{
  if(action==='copy'){const result=duplicateCanvasObjects(page,state,selected,()=>'canvas-'+crypto.randomUUID());commit(result.state);setSelected(result.ids);}
  else if(action==='delete'){commit(deleteCanvasObjects(page,state,selected));setSelected([]);}
  else{const id='canvas-'+crypto.randomUUID();commit(createCanvasObject(page,state,id,action));setSelected([id]);}
 }catch(e){setMessage(String(e));}};
 const layerAction=(command:LayerCommand|'hide'|'show'|'lock'|'unlock')=>{try{
  commit(command==='hide'||command==='show'?setLayerFlag(page,state,selected,'hidden',command==='hide'):command==='lock'||command==='unlock'?setLayerFlag(page,state,selected,'locked',command==='lock'):reorderLayers(page,state,selected,command));
 }catch(e){setMessage(String(e));}};
 const active=selected.length===1?index.get(selected[0])?.widget:undefined;
 const choose=(id:string,add:boolean)=>setSelected(previous=>add?previous.includes(id)?previous.filter(x=>x!==id):[...previous,id]:[id]);
 const arrange=(mode:CanvasArrange)=>{try{commit(arrangeSelection(page,state,selected,mode));}catch(e){setMessage(String(e));}};
 const outline=(widgets:Widget[]):ReactNode=><ul>{widgets.map(w=><li key={w.id}><button data-object-id={w.id} aria-pressed={selected.includes(w.id)} onClick={e=>choose(w.id,e.shiftKey||e.metaKey||e.ctrlKey)}>{w.name||w.id}{state.layers?.locked?.includes(w.id)?' 🔒':''}{state.layers?.hidden?.includes(w.id)?'（隐藏）':''}</button>{w.children?.length?outline(w.children):null}</li>)}</ul>;
 return <div className="flow-editor" tabIndex={0} onPointerDownCapture={()=>{clickSelection.current=selected;}} onKeyDownCapture={e=>{
   const target=e.target as HTMLElement;
   // Preserve native text editing and controls; commands apply only to the canvas.
   if(target.closest('input,textarea,select,button,[contenteditable=true]')||!(target===e.currentTarget||target.closest('.flow-surface')))return;
   if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='a'){
    e.preventDefault();e.stopPropagation();setSelected(selectAllCanvasObjects(edited));return;
   }
   if(e.key==='Escape'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){
    e.preventDefault();e.stopPropagation();setSelected([]);return;
   }
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){
    e.preventDefault();e.stopPropagation();setCursor(c=>Math.max(0,Math.min(history.length-1,c+(e.shiftKey?1:-1))));return;
   }
   if((e.key==='Delete'||e.key==='Backspace')&&selected.length){e.preventDefault();e.stopPropagation();objectAction('delete');return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&selected.length){e.preventDefault();e.stopPropagation();objectAction('copy');return;}
   const direction:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   const delta=direction[e.key];
   if(!delta||e.metaKey||e.ctrlKey||e.altKey||!selected.length)return;
   e.preventDefault();e.stopPropagation();
   const step=e.shiftKey?10:1;
   try{commit(translateSelection(page,state,selected,delta[0]*step,delta[1]*step));}catch(error){setMessage(String(error));}
  }}>
  <div className="flow-toolbar"><strong>{page.name}</strong><button onClick={download}>保存画布</button><label>打开画布 <input aria-label="打开画布" type="file" accept=".json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const next=restoreCanvasState(await file.text(),page,sourceSha256);commit(next);setRevision(r=>r+1);setMessage('画布已恢复');}catch(error){setMessage(String(error));}}}/></label><button onClick={()=>{commit(empty);setRevision(r=>r+1);setMessage('已恢复原布局');}}>恢复原布局</button>
  <button disabled={cursor===0} onClick={()=>setCursor(cursor-1)}>撤销</button><button disabled={cursor===history.length-1} onClick={()=>setCursor(cursor+1)}>重做</button>
  <label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>网格吸附</label><span role="status">{message}</span></div>
  <div className="flow-workspace">
  <aside className="flow-outline" aria-label="对象目录">
   {([['text','新增文字'],['rectangle','新增矩形'],['ellipse','新增椭圆'],['decision','新增判断'],['button','新增按钮']] as [CanvasTool,string][]).map(([tool,label])=><button key={tool} onClick={()=>objectAction(tool)}>{label}</button>)}
   <button disabled={!selected.length} onClick={()=>objectAction('copy')}>复制对象</button><button disabled={!selected.length} onClick={()=>objectAction('delete')}>删除对象</button>
   {outline(edited.widgets)}</aside>
  <div className="flow-surface" style={{background:page.background}}>
   <ReactFlow key={revision} nodes={nodes} edges={view.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={changes} onNodeClick={(e,n)=>{const previous=clickSelection.current;if(e.shiftKey||e.metaKey||e.ctrlKey)setSelected(previous.includes(n.id)?previous.filter(id=>id!==n.id):[...previous,n.id]);else setSelected([n.id]);}} onNodeDragStart={()=>setDragBase(state)} onNodeDragStop={()=>setDragBase(null)} onSelectionDragStart={()=>setDragBase(state)} onSelectionDragStop={()=>setDragBase(null)} onPaneClick={()=>setSelected([])} multiSelectionKeyCode={['Shift','Meta','Control']} snapToGrid={snap} snapGrid={[10,10]} defaultViewport={{x:0,y:0,zoom:1}} minZoom={0.1} maxZoom={4} nodeDragThreshold={0} nodesConnectable={false} deleteKeyCode={null} elevateNodesOnSelect={false} elevateEdgesOnSelect={false} zIndexMode="manual" onError={(_code,message)=>setMessage(message)}><Background gap={10}/><Controls showInteractive={false}/></ReactFlow>
  </div>
  <aside className="flow-properties" aria-label="属性">
   {!!selected.length&&<div aria-label="图层操作">{([['front','置顶'],['back','置底'],['forward','上移一层'],['backward','下移一层'],['hide','隐藏对象'],['show','取消隐藏'],['lock','锁定对象'],['unlock','解锁对象']] as const).map(([command,label])=><button key={command} onClick={()=>layerAction(command)}>{label}</button>)}</div>}
   {selected.some(id=>layerLocked(id,state.layers,index))&&<p>对象或其父子项已锁定，请在目录中选择并解锁。</p>}
   {selected.length>1&&<><p>已选择 {selected.length} 个对象</p><p>按 Shift / Ctrl / Cmd 点击增减选择；Shift 拖动空白处框选。方向键批量移动。</p>
    {([['left','左对齐'],['center','水平居中'],['right','右对齐'],['top','顶对齐'],['middle','垂直居中'],['bottom','底对齐'],['horizontal','水平等距'],['vertical','垂直等距']] as [CanvasArrange,string][]).map(([mode,label])=><button key={mode} onClick={()=>arrange(mode)}>{label}</button>)}
   </>}
   {active?<><strong>{active.name||active.id}</strong>
   <p>坐标相对父容器</p>
   {(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={axis.toUpperCase()} type="number" disabled={!canvasMovable(active.id,index)||layerLocked(active.id,state.layers,index)} key={active.id+':'+active[axis]} defaultValue={active[axis]} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const n=e.target.valueAsNumber;e.target.value=String(active[axis]);if(!Number.isFinite(n))return;const next=new Map(moves.map(m=>[m.id,m]));next.set(active.id,{id:active.id,x:active.x,y:active.y,[axis]:n});commit({...state,moves:[...next.values()]});}}/></label>)}
   {(['width','height'] as const).map(axis=><label key={axis}>{axis==='width'?'W':'H'}<input aria-label={axis==='width'?'W':'H'} type="number" min={1} disabled={!canvasResizable(active.id,index)||layerLocked(active.id,state.layers,index)} key={active.id+':'+active[axis]} defaultValue={active[axis]} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{const n=e.target.valueAsNumber;e.target.value=String(active[axis]);if(!Number.isFinite(n)||n<1){setMessage('尺寸必须大于等于 1');return;}resize(active.id,{width:axis==='width'?n:lock?active.width*n/active.height:active.width,height:axis==='height'?n:lock?active.height*n/active.width:active.height});}}/></label>)}
   <label><input type="checkbox" checked={lock} onChange={e=>setLock(e.target.checked)}/>锁定宽高比</label>
   {!canvasResizable(active.id,index)&&<p>此对象暂不支持尺寸编辑</p>}
   {!canvasMovable(active.id,index)&&<p>此对象的位置为只读</p>}
   {active.content.flatMap((c,ci)=>c.kind==='text'?c.paragraphs.flatMap((p,pi)=>p.runs.map((run,ri)=><label key={ci+':'+pi+':'+ri}>文字 {ci+1}.{pi+1}.{ri+1}<textarea aria-label={'文字 '+(ci+1)+'.'+(pi+1)+'.'+(ri+1)} disabled={!canvasTextEditable(active.id,index)||layerLocked(active.id,state.layers,index)} value={run.text} onChange={e=>{const edit={id:active.id,content:ci,paragraph:pi,run:ri,text:e.target.value};commit({...state,texts:[...state.texts.filter(t=>!(t.id===edit.id&&t.content===ci&&t.paragraph===pi&&t.run===ri)),edit]});}}/></label>)):[])}
   </>:<p>选择画布对象或目录项后编辑。拖动对象移动，拖动空白处平移，滚轮缩放。</p>}
  </aside>
  </div>
 </div>;
}
