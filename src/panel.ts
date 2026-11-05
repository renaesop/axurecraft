import type {Action,Css,Widget} from './model.ts';
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
export function nextPanelState(states:string[],current:string|undefined,value:unknown,loop=true,names?:Record<string,string>):string|undefined {
 if(!states.length)return undefined;
 if(names){const id=states.find(id=>names[id]===String(value));if(id)return id;const n=Number(value);return Number.isInteger(n)&&n>0&&n<=states.length?states[n-1]:undefined;}
 const index=Math.max(0,states.indexOf(current??states[0]));
 if(value==='next'||value==='previous'){
  const next=index+(value==='next'?1:-1);
  return states[loop?(next+states.length)%states.length:Math.max(0,Math.min(states.length-1,next))];
 }
 if(typeof value==='number')return Number.isInteger(value)&&value>0&&value<=states.length?states[value-1]:undefined;
 return typeof value==='string'&&states.includes(value)?value:undefined;
}

const stateTimers=new Map<string,ReturnType<typeof setTimeout>>();
/** Native state-change events run after both incoming and outgoing transitions finish. */
export function schedulePanelEvent(id:string,transition:import('./model.ts').Action['transition'],fire:()=>void):void {
 clearTimeout(stateTimers.get(id));const duration=Math.max(transition?.show?transition.showDuration:0,transition?.hide?transition.hideDuration:0);
 if(!duration){stateTimers.delete(id);fire();return;}
 const timer=setTimeout(()=>{stateTimers.delete(id);fire();},duration);stateTimers.set(id,timer);
}

/** One repeat sequence per panel; any explicit state assignment cancels its predecessor. */
export function createPanelRepeater(){
 const timers=new Map<string,ReturnType<typeof setTimeout>>();
 const cancel=(id:string)=>{clearTimeout(timers.get(id));timers.delete(id);};
 return {cancel,clear:()=>{for(const id of timers.keys())cancel(id);},prepare:(action:Action,replay:(next:Action)=>void):boolean=>{
  if(!action.target)return false;const id=action.target;cancel(id);
  if(action.repeat&&(action.value==='next'||action.value==='previous')){
   const t=action.transition,delay=Math.max(1,action.repeat.interval,t?.show?t.showDuration:0,t?.hide?t.hideDuration:0);
   const timer=setTimeout(()=>{if(timers.get(id)!==timer)return;timers.delete(id);replay({...action,repeat:{...action.repeat!,skipFirst:false}});},delay);timers.set(id,timer);
  }
  return action.value!=='current'&&!action.repeat?.skipFirst;
 }};
}
