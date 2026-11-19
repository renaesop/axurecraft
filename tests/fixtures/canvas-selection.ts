import {canvasResizeCase} from './canvas-resize.ts';
/** Original unequal-sized boxes, including a negative-coordinate nested member. */
export function canvasSelectionCase(){
 const page=canvasResizeCase(),template=page.widgets.find(w=>w.id==='isolated')!;
 page.widgets.push(...[[-80,20,40,30],[40,80,60,40],[200,140,80,50]].map(([x,y,width,height],i)=>({...structuredClone(template),id:'arrange-'+i,name:'排列 '+i,x,y,width,height})));
 const group=page.widgets.find(w=>w.id==='group')!;
 group.children!.push({...structuredClone(template),id:'nested-arrange',name:'嵌套排列',x:-30,y:20,width:70,height:35});
 return page;
}
