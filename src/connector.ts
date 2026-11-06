import {field,items,number,object,str,type Graph,type Value} from './graph.ts';
import {paint,linePattern,marker} from './vector.ts';
import type {ConnectorInfo,VectorGraphic,VectorGradient,VectorMarker} from './model.ts';
import {connectorPoint} from './connector-point.ts';
import {resolveStyle} from './styles.ts';
type Point={x:number;y:number};
const xy=(p:Point)=>`${Number(p.x.toFixed(5))} ${Number(p.y.toFixed(5))}`;
const at=(value:Value|undefined):Point=>({x:number(field(value,'X'),NaN),y:number(field(value,'Y'),NaN)});
const valid=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const routing:ConnectorInfo['routing'][]=['rounded','orthogonal','straight','curve'];
/** Connector references are local GUID-table IDs; ports are GUIDs, not object records. */
export function connectorInfo(g:Graph,w:Value,prefix=''):ConnectorInfo {
 const endpoint=(side:'start'|'end'):ConnectorInfo['start']=>{
  const target=g.guids[number(field(w.body,side+'-diagram-object'),-1)-1];
  const port=g.guids[number(field(w.body,side+'-connector-id'),-1)-1]??str(field(w.body,side+'-connector-name'));
  const present=(value:string|undefined)=>!!value&&value!=='00000000000000000000000000000000';
  return {...(present(target)?{target:prefix+'w-'+target}:{}),...(present(port)?{port}:{})};
 };
 const type=routing[number(field(w.body,'connector-type'),2)];if(!type)throw new Error('Unknown connector routing type');
 return {routing:type,start:endpoint('start'),end:endpoint('end')};
}
/** Connectors use absolute segment/control-point coordinates, unlike VectorShape's normalized paths. */
export function parseConnector(g:Graph,w:Value,props:Map<number,Value>,id:string,targetStyle=(target:Value)=>resolveStyle(g,target)):{x:number;y:number;width:number;height:number;graphic:VectorGraphic;labelPoint:Point}|undefined {
 const type=number(field(w.body,'connector-type'),2);if(!routing[type])return;
 const info=connectorInfo(g,w);
 const endpoint=(side:'start'|'end',stored:Point):Point=>{
  const target=object(g,field(w.body,side+'-diagram-object')),port=info[side].port;
  return target&&port?connectorPoint(g,target,port,targetStyle(target))??stored:stored;
 };
 const start=endpoint('start',at(props.get(101))),end=endpoint('end',{x:number(field(w.body,'end-point-x'),NaN),y:number(field(w.body,'end-point-y'),NaN)});
 if(!valid(start)||!valid(end))return;
 const points:Point[]=[start],control=items(field(w.body,'control-points'))[0];
 let handles:Point[]=[];
 if(type===3){handles=[at(field(control,'LowerHandle')),at(field(control,'HigherHandle'))];if(!handles.every(valid))return;}
 else if(type===0||type===1){
  const segments=items(field(w.body,'segments')).map(ref=>object(g,ref));
  if(segments.some(s=>!s||!Number.isFinite(number(field(s.body,'to-x'),NaN))||!Number.isFinite(number(field(s.body,'to-y'),NaN))))return;
  // GetSegmentPoints uses intermediate ToPoints only. The last ToPoint is an
  // endpoint cache, not another bend; appending the raw EndPoint creates a spur.
  for(const segment of segments.slice(0,-1)){const point={x:number(field(segment?.body,'to-x'),NaN),y:number(field(segment?.body,'to-y'),NaN)};if(!valid(point))return;points.push(point);}
  if(points.length>1){
   const horizontal=(segment:Value|undefined)=>number(field(segment?.body,'from-y'),NaN)===number(field(segment?.body,'to-y'),NaN);
   const first=segments[0],last=segments.at(-1);
   // Reattach the terminal legs without rerouting the authored middle bends.
   if(field(first?.body,'from-x')){if(horizontal(first))points[1].y=start.y;else points[1].x=start.x;}
   if(field(last?.body,'from-x')){if(horizontal(last))points.at(-1)!.y=end.y;else points.at(-1)!.x=end.x;}
  }else if(start.x!==end.x&&start.y!==end.y){
   // A formerly straight orthogonal leg may become offset after reattachment.
   const first=segments[0],horizontal=first&&field(first.body,'from-y')?number(field(first.body,'from-y'))===number(field(first.body,'to-y')):[1,4].includes(number(field(w.body,'start-point-direction'),4));
   if(horizontal){const x=(start.x+end.x)/2;points.push({x,y:start.y},{x,y:end.y});}
   else{const y=(start.y+end.y)/2;points.push({x:start.x,y},{x:end.x,y});}
  }
 }
 if(points.at(-1)!.x!==end.x||points.at(-1)!.y!==end.y)points.push(end);
 const bounds=[...points,...handles],x=Math.min(...bounds.map(p=>p.x)),y=Math.min(...bounds.map(p=>p.y)),width=Math.max(...bounds.map(p=>p.x))-x,height=Math.max(...bounds.map(p=>p.y))-y;
 const local=(p:Point)=>({x:p.x-x,y:p.y-y});
 // RP9 Connector.GetMiddlePoint uses the unrounded segment chain, not its
 // bounding box. Curves use the saved AxBezierPoint.PathPoint.
 let center:Point;
 if(type===3){
  const saved=at(field(control,'PathPoint'));
  center=valid(saved)?saved:{x:(start.x+3*handles[0].x+3*handles[1].x+end.x)/8,y:(start.y+3*handles[0].y+3*handles[1].y+end.y)/8};
 }else if(type===2){
  const round=(n:number)=>Math.sign(n)*Math.round(Math.abs(n));
  center={x:round((start.x+end.x)/2),y:round((start.y+end.y)/2)};
 }else{
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining=lengths.reduce((sum,n)=>sum+n,0)/2;
  center=start;
  for(let i=0;i<lengths.length;i++){
   const length=lengths[i];if(length===0)continue;
   if(remaining<=length){const a=points[i],b=points[i+1],t=remaining/length;center={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};break;}
   remaining-=length;
  }
 }
 let d=`M ${xy(local(start))}`;
 if(type===3)d+=` C ${xy(local(handles[0]))} ${xy(local(handles[1]))} ${xy(local(end))}`;
 else for(let i=1;i<points.length;i++){
  const previous=points[i-1],point=points[i],next=points[i+1];
  if(type===0&&next){
   const before=Math.hypot(point.x-previous.x,point.y-previous.y),after=Math.hypot(next.x-point.x,next.y-point.y),radius=Math.min(5,before/2,after/2);
   const cross=(point.x-previous.x)*(next.y-point.y)-(point.y-previous.y)*(next.x-point.x);
   if(radius>0&&Math.abs(cross)>1e-8){const a={x:point.x+(previous.x-point.x)*radius/before,y:point.y+(previous.y-point.y)*radius/before},b={x:point.x+(next.x-point.x)*radius/after,y:point.y+(next.y-point.y)*radius/after};
    const clockwise=(point.x-previous.x)*(next.y-point.y)-(point.y-previous.y)*(next.x-point.x)>0;
    d+=` L ${xy(local(a))} A ${radius} ${radius} 0 0 ${clockwise?1:0} ${xy(local(b))}`;continue;}
  }
  d+=` L ${xy(local(point))}`;
 }
 const stroke=paint(props.get(8),id+'-stroke'),pattern=number(props.get(16),1),strokeWidth=pattern===9?0:Math.max(0,number(props.get(15),1));
 const ends=props.get(17),startKind=number(field(ends,'Start'),1),endKind=number(field(ends,'End'),1);
 const a=strokeWidth?marker(startKind,id+'-start',stroke.value,strokeWidth):undefined,b=strokeWidth?marker(endKind,id+'-end',stroke.value,strokeWidth):undefined;
 // Keep the saved path and marker centers intact. Clip only the hollow interior,
 // so the shaft cannot show through it, even on translucent/image backgrounds.
 const radius=2.5-strokeWidth/2,holes=strokeWidth&&radius>0?[...(startKind===19?[{...local(start),radius}]:[]),...(endKind===19?[{...local(end),radius}]:[])]:[];
 return {x,y,width,height,labelPoint:local(center),graphic:{kind:'vector',width:Math.max(1,width),height:Math.max(1,height),preserveAspectRatio:'none',paths:[{data:d,fill:'none',fillOpacity:1,stroke:stroke.value,strokeWidth,strokeOpacity:stroke.opacity,dashArray:linePattern(pattern,strokeWidth),markerStart:a?.id,markerEnd:b?.id,...(holes.length?{markerHoles:holes}:{})}],gradients:[stroke.gradient].filter((v):v is VectorGradient=>!!v),markers:[a,b].filter((v):v is VectorMarker=>!!v)}};
}
