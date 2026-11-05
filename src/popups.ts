export interface Point {x:number;y:number}
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function convexHull(points:Point[]):Point[] {
 const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),half=(list:Point[])=>{const out:Point[]=[];for(const p of list){while(out.length>1&&cross(out.at(-2)!,out.at(-1)!,p)<=0)out.pop();out.push(p);}return out;};
 return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
export function insideHull(p:Point,hull:Point[]):boolean {return hull.length>=3&&hull.every((a,i)=>cross(a,hull[(i+1)%hull.length],p)>=-0.01);}
const flyouts=new Map<string,AbortController>();
export function closeFlyout(id:string):void {flyouts.get(id)?.abort();flyouts.delete(id);}
export function openFlyout(id:string,sourceId:string|undefined,hide:()=>void):void {
 closeFlyout(id);const controller=new AbortController();flyouts.set(id,controller);
 document.addEventListener('pointermove',event=>{
  const target=document.getElementById(id);if(!target||getComputedStyle(target).display==='none'){closeFlyout(id);return;}
  const rects=[target,sourceId?document.getElementById(sourceId):null].filter((el):el is HTMLElement=>!!el).map(el=>el.getBoundingClientRect());
  const hull=convexHull(rects.flatMap(r=>[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}]));
  if(!insideHull({x:event.clientX,y:event.clientY},hull)){closeFlyout(id);hide();}
 },{signal:controller.signal});
}
export function backdropColor(argb:number):string {const value=argb>>>0;return `rgba(${value>>>16&255},${value>>>8&255},${value&255},${(value>>>24)/255})`;}
export const backdropStyle=(color:string,zIndex:number)=>({position:'fixed',left:'0',top:'0',width:'100vw',height:'100vh',background:color,'z-index':String(zIndex)}) as const;
