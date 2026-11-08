import type {CanvasPoint as Point, ConnectorGeometry, ConnectorInfo} from './model.ts';
const xy=(p:Point)=>`${Number(p.x.toFixed(5))} ${Number(p.y.toFixed(5))}`;
export function connectorPath(routing:ConnectorInfo['routing'],points:Point[],handles:Point[]=[]):string {
 let d=`M ${xy(points[0])}`;
 if(routing==='curve')d+=` C ${xy(handles[0])} ${xy(handles[1])} ${xy(points.at(-1)!)}`;
 else for(let i=1;i<points.length;i++){
  const previous=points[i-1],point=points[i],next=points[i+1];
  if(routing==='rounded'&&next){
   const before=Math.hypot(point.x-previous.x,point.y-previous.y),after=Math.hypot(next.x-point.x,next.y-point.y),radius=Math.min(5,before/2,after/2);
   const cross=(point.x-previous.x)*(next.y-point.y)-(point.y-previous.y)*(next.x-point.x);
   if(radius>0&&Math.abs(cross)>1e-8){const a={x:point.x+(previous.x-point.x)*radius/before,y:point.y+(previous.y-point.y)*radius/before},b={x:point.x+(next.x-point.x)*radius/after,y:point.y+(next.y-point.y)*radius/after};
    const clockwise=(point.x-previous.x)*(next.y-point.y)-(point.y-previous.y)*(next.x-point.x)>0;
    d+=` L ${xy(a)} A ${radius} ${radius} 0 0 ${clockwise?1:0} ${xy(b)}`;continue;}
  }
  d+=` L ${xy(point)}`;
 }
 return d;
}
export function translateGeometry(g:ConnectorGeometry,dx:number,dy:number):ConnectorGeometry {
 const point=(p:Point)=>({x:p.x+dx,y:p.y+dy});
 return {...g,start:point(g.start),end:point(g.end),points:g.points.map(point),...(g.controls?{controls:g.controls.map(point) as [Point,Point]}:{}),...(g.label?{label:point(g.label)}:{})};
}
export function pathMiddle(routing:ConnectorInfo['routing'],g:ConnectorGeometry):Point {
 const {start:a,end:b,controls:c}=g;
 if(routing==='curve'&&c)return {x:(a.x+3*c[0].x+3*c[1].x+b.x)/8,y:(a.y+3*c[0].y+3*c[1].y+b.y)/8};
 if(routing==='straight'){const round=(n:number)=>Math.sign(n)*Math.round(Math.abs(n));return {x:round((a.x+b.x)/2),y:round((a.y+b.y)/2)};}
 const ps=[a,...g.points,b],lengths=ps.slice(1).map((p,i)=>Math.hypot(p.x-ps[i].x,p.y-ps[i].y));
 let remaining=lengths.reduce((n,l)=>n+l,0)/2;
 for(let i=0;i<lengths.length;i++){const l=lengths[i];if(!l)continue;if(remaining<=l){const t=remaining/l;return {x:ps[i].x+(ps[i+1].x-ps[i].x)*t,y:ps[i].y+(ps[i+1].y-ps[i].y)*t};}remaining-=l;}
 return {...a};
}
/** Preserve interior bends, change only terminal legs; do not run auto-layout. */
export function reattachGeometry(routing:ConnectorInfo['routing'],old:ConnectorGeometry,start:Point,end:Point):ConnectorGeometry {
 const g=structuredClone(old),ps=g.points;
 const ds={x:start.x-old.start.x,y:start.y-old.start.y},de={x:end.x-old.end.x,y:end.y-old.end.y};
 if(ds.x===de.x&&ds.y===de.y)return translateGeometry(old,ds.x,ds.y);
 g.start={...start};g.end={...end};
 if(routing==='curve'&&g.controls){g.controls[0].x+=ds.x;g.controls[0].y+=ds.y;g.controls[1].x+=de.x;g.controls[1].y+=de.y;}
 if(routing==='rounded'||routing==='orthogonal'){
  const first=old.points[0]??old.end,last=old.points.at(-1)??old.start;
  const firstHorizontal=old.start.y===first.y,lastHorizontal=old.end.y===last.y;
  if(ps.length){
   if(firstHorizontal)ps[0].y=start.y;else ps[0].x=start.x;
   // A single bend cannot satisfy parallel terminal legs at different levels.
   if(ps.length===1&&firstHorizontal===lastHorizontal&&((firstHorizontal&&start.y!==end.y)||(!firstHorizontal&&start.x!==end.x)))ps.push({...ps[0]});
   if(lastHorizontal)ps.at(-1)!.y=end.y;else ps.at(-1)!.x=end.x;
  }else if(start.x!==end.x&&start.y!==end.y){
   if(firstHorizontal){const x=(start.x+end.x)/2;ps.push({x,y:start.y},{x,y:end.y});}
   else{const y=(start.y+end.y)/2;ps.push({x:start.x,y},{x:end.x,y});}
  }
 }
 g.label=pathMiddle(routing,g);return g;
}
