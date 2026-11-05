import type {Scalar} from './model.ts';
export type EventValues=Record<string,Scalar>;
export function keyValue(key:string,shift=false,control=false,alt=false,macControl=false):string {return JSON.stringify([key.length===1?key.toUpperCase():key,shift,control,alt,macControl]);}
export function nativeKeyValue(keys:number,character:number):string {
 const code=keys&65535,names:Record<number,string>={2:'Backspace',3:'Tab',6:'Enter',13:'Escape',18:' ',19:'PageUp',20:'PageDown',21:'End',22:'Home',23:'ArrowLeft',24:'ArrowUp',25:'ArrowRight',26:'ArrowDown',31:'Insert',32:'Delete'};
 const key=names[code]??(code>=44&&code<=69?String.fromCharCode(code-44+65):code>=34&&code<=43?String(code-34):code>=90&&code<=113?'F'+(code-89):character?String.fromCharCode(character):undefined);
 if(!key)throw new Error(`Unsupported key code ${code}`);
 if(keys&1048576)throw new Error('Space modifier requires a held-key context');
 return keyValue(key,!!(keys&65536),!!(keys&131072),!!(keys&262144),!!(keys&524288));
}
export function eventValues(event:Event|{target:EventTarget}|{key?:string;shiftKey?:boolean;ctrlKey?:boolean;altKey?:boolean;metaKey?:boolean}):EventValues {
 if(!('key'in event)||!event.key)return {};
 const mac=typeof navigator!=='undefined'&&/Mac/.test(navigator.platform);
 return {key:keyValue(event.key,!!event.shiftKey,mac?!!event.metaKey:!!event.ctrlKey,!!event.altKey,mac?!!event.ctrlKey:false)};
}
export const syntheticEvents=['dragstart','drag','dragdrop','swipeleft','swiperight','swipeup','swipedown','longclick','scrollup','scrolldown'] as const;
/** Pointer tracking uses the native swipe thresholds: >30 px and <1000 ms; diagonal swipes may fire both axes. */
export function bindSyntheticEvents(element:HTMLElement,names:string[],fire:(name:string,values:EventValues)=>void,disabled:()=>boolean):()=>void {
 const controller=new AbortController(),signal=controller.signal;let active:AbortController|undefined,longTimer:ReturnType<typeof setTimeout>|undefined,suppress=false;
 const gestures=names.some(n=>['dragstart','drag','dragdrop','swipeleft','swiperight','swipeup','swipedown'].includes(n));
 if(gestures||names.includes('longclick'))element.addEventListener('pointerdown',event=>{
  if(disabled()||event.button!==0||active)return;event.stopPropagation();
  const x=event.pageX,y=event.pageY,time=performance.now();let lastX=x,lastY=y,dragged=false;
  active=new AbortController();const dragSignal=active.signal;
  if(names.includes('longclick'))longTimer=setTimeout(()=>{if(!dragged&&!disabled()){fire('longclick',{});suppress=true;}},750);
  const values=(e:PointerEvent):EventValues=>({dragx:e.pageX-lastX,dragy:e.pageY-lastY,totaldragx:e.pageX-x,totaldragy:e.pageY-y,dragtime:performance.now()-time,mousex:e.pageX,mousey:e.pageY});
  window.addEventListener('pointermove',e=>{if(e.pointerId!==event.pointerId||disabled())return;if(e.pageX===lastX&&e.pageY===lastY)return;clearTimeout(longTimer);const v=values(e);if(!dragged){dragged=true;if(gestures)fire('dragstart',v);}if(gestures)fire('drag',v);lastX=e.pageX;lastY=e.pageY;},{signal:dragSignal});
  const finish=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;clearTimeout(longTimer);active?.abort();active=undefined;if(e.type==='pointercancel'||!dragged||disabled())return;suppress=true;const v=values(e);fire('dragdrop',v);if(Number(v.dragtime)<1000){if(Number(v.totaldragx)<-30)fire('swipeleft',v);if(Number(v.totaldragx)>30)fire('swiperight',v);if(Number(v.totaldragy)<-30)fire('swipeup',v);if(Number(v.totaldragy)>30)fire('swipedown',v);}};
  window.addEventListener('pointerup',finish,{signal:dragSignal});window.addEventListener('pointercancel',finish,{signal:dragSignal});
 },{signal});
 element.addEventListener('click',event=>{if(suppress){suppress=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal});
 let last=element.scrollTop;const scroll=(event:Event)=>{const target=event.target===document?document.scrollingElement:event.target;if(!(target instanceof Element))return;const next=target.scrollTop;if(next!==last&&!disabled())fire(next>last?'scrolldown':'scrollup',{});last=next;};
 (element===document.body?document:element).addEventListener('scroll',scroll,{capture:true,signal});
 return ()=>{clearTimeout(longTimer);active?.abort();controller.abort();};
}
