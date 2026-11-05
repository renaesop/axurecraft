import type {Action} from './model.ts';
import type {Geometry} from './motion.ts';
import type {WidgetStateDefinition} from './widget-state.ts';

/** Native push/pull crosses visible groups, but stops at panel-state and repeater-row boundaries. */
export function compressionActions(id:string,widgets:WidgetStateDefinition[],read:(id:string)=>Geometry|undefined,options:NonNullable<Action['compression']>,change:boolean|{width:number;height:number}):Action[] {
 const source=document.getElementById(id),before=read(id);if(!source||!before)return [];
 const index=new Map(widgets.map(w=>[w.id,w])),origin=index.get(id),vertical=options.vertical;
 let scope=source.parentElement,offsetX=0,offsetY=0;
 while(scope&&index.get(scope.id)?.kind==='group'&&getComputedStyle(scope).display!=='none'){
  const g=read(scope.id);offsetX+=g?.x??0;offsetY+=g?.y??0;scope=scope.parentElement;
 }
 if(!scope)return [];
 const start=(vertical?before.y+offsetY:before.x+offsetX),extent=vertical?before.height:before.width;
 const threshold=start+(typeof change==='boolean'?(change?0:extent):extent);
 const delta=typeof change==='boolean'?(change?extent:-extent):(vertical?change.height:change.width)-extent;
 const clampStart=vertical?before.x+offsetX:before.y+offsetY;
 const clampEnd=clampStart+(typeof change==='boolean'?(vertical?before.width:before.height):Math.max(vertical?before.width:before.height,vertical?change.width:change.height));
 if(!delta)return [];
 const visit=(parent:Element,x:number,y:number):{actions:Action[];all:boolean}=>{
  const actions:Action[]=[];let all=true;
  for(const el of parent.children){
   const w=index.get(el.id);if(!w)continue;
   if(w.id===id||w.fixed||w.instance?.repeaterId!==origin?.instance?.repeaterId||w.instance?.rowId!==origin?.instance?.rowId){all=false;continue;}
   const g=read(w.id);if(!g){all=false;continue;}
   if(w.kind==='group'){
    const nested=visit(el,x+g.x,y+g.y);
    if(!nested.all){actions.push(...nested.actions);all=false;continue;}
   }else{
    const marker=vertical?g.y+y:g.x+x,clamp=vertical?g.x+x:g.y+y,size=vertical?g.width:g.height;
    if(marker<threshold||clamp+size<=clampStart||clamp>=clampEnd){all=false;continue;}
   }
   actions.push({kind:'move',target:w.id,motion:{[vertical?'y':'x']:{kind:'literal',value:delta},relative:true,easing:options.easing,duration:options.duration}});
  }
  return {actions,all};
 };
 return visit(scope,0,0).actions;
}
