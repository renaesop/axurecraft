import type {Action} from './model.ts';
/** Native classic menus open on entry and close their full descendant chain on exit. */
export function bindSubmenu(id:string,triggerId:string,run:(actions:Action[])=>void):()=>void {
 const menu=document.getElementById(id),trigger=document.getElementById(triggerId);if(!menu||!trigger)return ()=>{};
 const controller=new AbortController(),options={signal:controller.signal};
 trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls',id);trigger.setAttribute('aria-expanded','false');menu.setAttribute('role','menu');
 const hide=()=>{trigger.setAttribute('aria-expanded','false');const menus=[menu,...menu.querySelectorAll<HTMLElement>('[data-kind="MenuObject"]')];run(menus.map(el=>({kind:'hide',target:el.id})));};
 trigger.addEventListener('mouseenter',()=>{if(trigger.getAttribute('aria-disabled')==='true')return;trigger.setAttribute('aria-expanded','true');run([{kind:'show',target:id,transition:{show:0,hide:0,showDuration:0,hideDuration:0,bringToFront:true}}]);},options);
 trigger.addEventListener('mouseleave',event=>{const r=menu.getBoundingClientRect();if(event.clientX+3<r.left||event.clientX>r.right||event.clientY+3<r.top||event.clientY>r.bottom)hide();},options);
 menu.addEventListener('mouseleave',hide,options);
 return ()=>controller.abort();
}
