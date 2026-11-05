import type {Action,Css} from './model.ts';
export interface Geometry {x:number;y:number;width:number;height:number;rotation:number}
export const motionAxes=['x','y','width','height','angle','offsetX','offsetY'] as const;
const anchors:Record<string,[number,number]>={'top left':[0,0],'top':[.5,0],'top right':[1,0],'left':[0,.5],'center':[.5,.5],'right':[1,.5],'bottom left':[0,1],'bottom':[.5,1],'bottom right':[1,1]};

/** Expressions have been evaluated by executeActions before reaching this pure reducer. */
export function movedGeometry(before:Geometry,action:Action,offset={x:0,y:0}):Geometry {
 const motion=action.motion??{},next={...before};
 const number=(key:typeof motionAxes[number]):number|undefined=>{const e=motion[key];return e?.kind==='literal'&&Number.isFinite(Number(e.value))?Number(e.value):undefined;};
 if(action.kind==='move'){
  for(const key of ['x','y'] as const){const n=number(key);if(n!==undefined)next[key]=n+(motion.relative?before[key]:0);}
 }else if(action.kind==='resize'){
  const [ax,ay]=anchors[motion.anchor??'top left']??[0,0];
  next.width=Math.max(0,number('width')??before.width);next.height=Math.max(0,number('height')??before.height);
  next.x+=(before.width-next.width)*ax;next.y+=(before.height-next.height)*ay;
 }else if(action.kind==='rotate'){
  const angle=(number('angle')??0)*(motion.clockwise===false?-1:1);
  next.rotation=angle+(motion.relative?before.rotation:0);
  const [ax,ay]=anchors[motion.anchor??'center']??[.5,.5];
  const dx=before.width*(.5-ax)-(number('offsetX')??0),dy=before.height*(.5-ay)-(number('offsetY')??0),r=(next.rotation-before.rotation)*Math.PI/180;
  next.x+=dx*Math.cos(r)-dy*Math.sin(r)-dx;next.y+=dx*Math.sin(r)+dy*Math.cos(r)-dy;
 }
 if(action.kind==='move'&&motion.bounds){const bound=(key:keyof NonNullable<typeof motion.bounds>)=>{const e=motion.bounds?.[key];return e?.kind==='literal'?Number(e.value):undefined;};const left=bound('left'),right=bound('right'),top=bound('top'),bottom=bound('bottom');if(left!==undefined)next.x=Math.max(next.x,left-offset.x);if(right!==undefined)next.x=Math.min(next.x,right-offset.x-next.width);if(top!==undefined)next.y=Math.max(next.y,top-offset.y);if(bottom!==undefined)next.y=Math.min(next.y,bottom-offset.y-next.height);}
 return next;
}
export function motionOffset(id:string,before:Geometry):{x:number;y:number}{const rect=document.getElementById(id)?.getBoundingClientRect();return rect?{x:rect.left+scrollX-before.x,y:rect.top+scrollY-before.y}:{x:0,y:0};}

export function geometryCss(g:Geometry,group=false):Css {
 return {left:`${g.x}px`,top:`${g.y}px`,width:`${group?0:g.width}px`,height:`${group?0:g.height}px`,transform:g.rotation?`rotate(${g.rotation}deg)`:"none",'transform-origin':`${g.width/2}px ${g.height/2}px`};
}
export function readGeometry(id:string,fallback?:Geometry):Geometry|undefined {
 const el=document.getElementById(id);if(!el)return fallback;
 const s=getComputedStyle(el),m=new DOMMatrix(s.transform==='none'?undefined:s.transform);
 return {x:parseFloat(s.left)||0,y:parseFloat(s.top)||0,width:fallback?.width??(parseFloat(s.width)||el.offsetWidth),height:fallback?.height??(parseFloat(s.height)||el.offsetHeight),rotation:Math.atan2(m.b,m.a)*180/Math.PI};
}
export function animateGeometry(id:string,before:Geometry,after:Geometry,action:Action,group=false):void {
 const el=document.getElementById(id),duration=action.motion?.duration??0,easing=action.motion?.easing??0;
 if(!el||!duration||!easing)return;
 const curves:Record<number,string>={1:'cubic-bezier(.445,.05,.55,.95)',2:'linear',3:'cubic-bezier(.55,.055,.675,.19)',4:'cubic-bezier(.215,.61,.355,1)',5:'cubic-bezier(.645,.045,.355,1)'};
 const css=(g:Geometry)=>{const s=geometryCss(g,group);return {left:s.left,top:s.top,width:s.width,height:s.height,transform:s.transform,transformOrigin:s['transform-origin']};};
 el.animate([css(before),css(after)],{duration,easing:curves[easing]??'linear'});
}
