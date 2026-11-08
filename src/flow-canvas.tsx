import {createElement, useMemo, useState, type ReactNode} from 'react';
import {ReactFlow, Controls, Handle, Position, applyNodeChanges, type Node, type Edge, type NodeProps, type EdgeProps, type NodeChange} from '@xyflow/react';
import {materializePage} from './repeater-model.ts';
import type {Page, Widget} from './model.ts';
import {widgetElement, type ElementNode} from './render-tree.ts';
import {reactAttribute,reactStyle} from './react-props.ts';
import {canvasIndex,canvasMovable,moveCanvas,saveCanvas,restoreCanvas,type CanvasMove} from './flow-canvas-model.ts';

type CanvasNode=Node<{widget?:Widget},'widget'|'anchor'>;
type CanvasEdge=Edge<{widget:Widget;x:number;y:number},'native'>;
/** Render the shared structured tree with React, without HTML injection or prototype events. */
function element(node:ElementNode|string,key:number|string):ReactNode {
 if(typeof node==='string')return node;
 if(node.tag==='iframe')return <div key={key} role="img" aria-label={String(node.attrs.title??'内联框架')} style={{...reactStyle(node.css??{}),background:'#f4f6fa',border:'1px dashed #8490a0',padding:8}}>内联框架：{String(node.attrs.title??'预览占位')}</div>;
 const props:Record<string,unknown>={key,...Object.fromEntries(Object.entries(node.attrs).filter(([k])=>k!=='data-rp-link').map(([k,v])=>[reactAttribute(k),v])),style:node.css?reactStyle(node.css):undefined};
 if(node.tag==='option')delete props.selected;
 if(node.tag==='textarea'){props.defaultValue=node.children.filter(c=>typeof c==='string').join('');return createElement(node.tag,props);}
 if(['input','br','img'].includes(node.tag))return createElement(node.tag,props);
 return createElement(node.tag,props,...node.children.map(element));
}
function WidgetPaint({widget}:{widget:Widget}) {
 const tree=widgetElement({...widget,x:0,y:0,children:widget.kind==='group'?[]:widget.children});
 return <div style={{pointerEvents:'none'}}>{element(tree,widget.id)}</div>;
}
function CanvasWidget({data}:NodeProps<CanvasNode>){return <>
 {data.widget&&<WidgetPaint widget={data.widget}/>}
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
 const [moves,setMoves]=useState<CanvasMove[]>([]),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
 const [nodeMeta,setNodeMeta]=useState<CanvasNode[]>([]);
 const edited=useMemo(()=>moveCanvas(page,moves),[page,moves]),view=useMemo(()=>graph(edited),[edited]);
 const previousById=new Map(nodeMeta.map(n=>[n.id,n]));
 const nodes=view.nodes.map(n=>{const previous=previousById.get(n.id);return {...n,measured:previous?.measured,selected:previous?.selected,dragging:previous?.dragging};});
 const changes=(changes:NodeChange<CanvasNode>[])=>{
  setNodeMeta(applyNodeChanges(changes,nodes));
  const positions=changes.filter(c=>c.type==='position'&&c.position);
  if(!positions.length)return;
  const next=new Map(moves.map(m=>[m.id,m]));for(const c of positions)if(c.type==='position'&&c.position)next.set(c.id,{id:c.id,...c.position});const result=[...next.values()];
  try{moveCanvas(page,result);setMoves(result);}catch(e){setMessage(String(e));}
 };
 const download=()=>{const blob=new Blob([JSON.stringify(saveCanvas(page,sourceSha256,moves),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=page.id+'.canvas.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('画布已保存');};
 return <div className="flow-editor">
  <div className="flow-toolbar"><strong>{page.name}</strong><button onClick={download}>保存画布</button><label>打开画布 <input aria-label="打开画布" type="file" accept=".json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{setMoves(restoreCanvas(await file.text(),page,sourceSha256));setRevision(r=>r+1);setMessage('画布已恢复');}catch(error){setMessage(String(error));}}}/></label><button onClick={()=>{setMoves([]);setRevision(r=>r+1);setMessage('已恢复原布局');}}>恢复原布局</button><span role="status">{message}</span></div>
  <div className="flow-surface" style={{background:page.background}}>
   <ReactFlow key={revision} nodes={nodes} edges={view.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={changes} defaultViewport={{x:0,y:0,zoom:1}} minZoom={0.1} maxZoom={4} nodeDragThreshold={0} nodesConnectable={false} deleteKeyCode={null} elevateNodesOnSelect={false} elevateEdgesOnSelect={false} zIndexMode="manual" onError={(_code,message)=>setMessage(message)}><Controls showInteractive={false}/></ReactFlow>
  </div>
 </div>;
}
