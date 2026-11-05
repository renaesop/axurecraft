/** Native fade/slide/flip modes. Animation affects paint; semantic visibility remains explicit. */
const active=new WeakMap<Element,Animation>();
export function transitionFrames(element:HTMLElement,show:boolean,mode:number):Keyframe[] {
 const hidden=element.hidden,display=element.style.display;
 if(hidden)element.hidden=false;if(getComputedStyle(element).display==='none')element.style.display='block';
 const transform=getComputedStyle(element).transform,base=transform==='none'?'':transform;
 const width=element.offsetWidth,height=element.offsetHeight;
 const opacity=getComputedStyle(element).opacity;
 element.hidden=hidden;element.style.display=display;
 const delta:Record<number,string>={2:`translateX(${show?-width:width}px)`,3:`translateX(${show?width:-width}px)`,4:`translateY(${show?height:-height}px)`,5:`translateY(${show?-height:height}px)`,6:`perspective(800px) rotateY(${show?-90:90}deg)`,7:`perspective(800px) rotateY(${show?90:-90}deg)`,8:`perspective(800px) rotateX(${show?-90:90}deg)`,9:`perspective(800px) rotateX(${show?90:-90}deg)`};
 const end:Keyframe=mode===1?{opacity:0}:{transform:`${base} ${delta[mode]??''}`.trim()||'none'};
 const normal:Keyframe=mode===1?{opacity}:{transform:base||'none'};
 return show?[end,normal]:[normal,end];
}
/** A newer transition cancels the old completion, including pending hide callbacks. */
export function animateTransition(element:HTMLElement,show:boolean,mode:number,duration:number,complete:()=>void=()=>{}):void {
 active.get(element)?.cancel();active.delete(element);
 if(!mode||duration<=0){complete();return;}
 const animation=element.animate(transitionFrames(element,show,mode),{duration,easing:'linear'});
 active.set(element,animation);
 animation.finished.then(()=>{if(active.get(element)!==animation)return;active.delete(element);complete();},()=>{});
}
export function frontIndex():number {
 return Math.max(1000,...[...document.querySelectorAll<HTMLElement>('.rp-widget')].map(e=>Number(getComputedStyle(e).zIndex)||0))+1;
}
