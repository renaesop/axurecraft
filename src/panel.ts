import type {Css,Widget} from './model.ts';
export interface PanelLayout {
 fixed?:{horizontal:'left'|'center'|'right';vertical:'top'|'center'|'bottom';marginX:number;marginY:number;keepInFront:boolean};
 percentWidth?:boolean;
 fitToContent?:boolean;
}
export function panelCss(w:Widget):Css {
 const p=w.panel;if(!p)return {};
 const css:Css={};
 if(p.percentWidth)css.width=p.fixed?'100vw':'max(100vw, var(--rp-page-width, 100%))';
 if(p.fixed){
  const f=p.fixed;css.position='fixed';
  css.left=f.horizontal==='left'?`${f.marginX}px`:f.horizontal==='center'?`calc(50vw - ${w.width/2-f.marginX}px)`:'auto';
  css.top=f.vertical==='top'?`${f.marginY}px`:f.vertical==='center'?`calc(50vh - ${w.height/2-f.marginY}px)`:'auto';
  if(f.horizontal==='right')css.right=`${f.marginX}px`;
  if(f.vertical==='bottom')css.bottom=`${f.marginY}px`;
  if(f.keepInFront)css['z-index']='1001';
 }
 return css;
}
/** Explicit state changes clamp at the endpoints unless looping was requested. */
export function nextPanelState(states:string[],current:string|undefined,value:unknown,loop=true):string|undefined {
 if(!states.length)return undefined;
 const index=Math.max(0,states.indexOf(current??states[0]));
 if(value==='next'||value==='previous'){
  const next=index+(value==='next'?1:-1);
  return states[loop?(next+states.length)%states.length:Math.max(0,Math.min(states.length-1,next))];
 }
 if(typeof value==='number')return states[Math.max(0,Math.min(states.length-1,Math.floor(value)-1))];
 return typeof value==='string'&&states.includes(value)?value:undefined;
}

const stateTimers=new Map<string,ReturnType<typeof setTimeout>>();
/** Native state-change events run after both incoming and outgoing transitions finish. */
export function schedulePanelEvent(id:string,transition:import('./model.ts').Action['transition'],fire:()=>void):void {
 clearTimeout(stateTimers.get(id));const duration=Math.max(transition?.show?transition.showDuration:0,transition?.hide?transition.hideDuration:0);
 if(!duration){stateTimers.delete(id);fire();return;}
 const timer=setTimeout(()=>{stateTimers.delete(id);fire();},duration);stateTimers.set(id,timer);
}
