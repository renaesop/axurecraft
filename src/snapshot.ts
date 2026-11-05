import {nextPanelState} from './panel.ts';
import {visibleDiagramBounds} from './groups.ts';
import type {Action,Widget,Scalar,UIExpression} from './model.ts';
import {instantiateMaster} from './master.ts';
import {flattenWidgets,materializeWidgets} from './repeater-model.ts';
import {axureBoolean,evaluateExpression} from './expression.ts';
import {movedGeometry,motionAxes} from './motion.ts';
export interface SnapshotOptions {width:number;height:number;background:string;fit:boolean;zoom:number;panX:number;panY:number;padding:{left:number;top:number;right:number;bottom:number};vertical:0|1|2;originX?:number;originY?:number}
/** Apply explicit snapshot preview actions to a private copy, never to the referenced page. */
export function applySnapshotActions(widgets:Widget[],actions:Action[],variables:Map<string,Scalar>,report:(detail:string)=>void):void {
 const all=flattenWidgets(widgets),byId=new Map(all.map(w=>[w.id,w])),states=new Map(all.filter(w=>w.states).map(w=>[w.id,w.states!.slice()]));
 const read=(id:string,property:string):Scalar|undefined=>{const w=byId.get(id);if(!w)return;switch(property){case 'visible':return w.css.display!=='none';case 'disabled':return !!w.disabled;case 'selected':return !!w.selected;case 'state':return w.states?.[0]?.name;case 'text':return w.content.map(c=>c.kind==='text'?c.paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n'):c.kind==='control'?c.value:'').join('');case 'x':case 'y':case 'width':case 'height':return w[property];}};
 const evaluate=(e:UIExpression)=>evaluateExpression(e,{readWidget:read,readVariable:name=>String(variables.get(name.toLowerCase())??'')});
 const execute=(list:Action[],depth=0):void=>{if(depth>32){report('Snapshot preview event recursion exceeds 32');return;}for(const a of list){
  if(a.kind==='branch'){const branch=a.branches?.find(b=>!b.condition||axureBoolean(evaluate(b.condition)));if(branch)execute(branch.actions,depth+1);continue;}
  if(a.kind==='set-variable'){const value=a.expression&&evaluate(a.expression);if(value!==undefined&&a.variable)variables.set(a.variable.toLowerCase(),value);continue;}
  const w=byId.get(a.target??'');if(!w){report('Snapshot preview target is missing: '+a.target);continue;}
  const value=a.expression?evaluate(a.expression):a.value;
  if(a.kind==='show')delete w.css.display;
  else if(a.kind==='hide')w.css.display='none';
  else if(a.kind==='toggle'){if(w.css.display==='none')delete w.css.display;else w.css.display='none';}
  else if(a.kind==='state'&&w.states?.length){
   const list=states.get(w.id)!,next=nextPanelState(list.map(s=>s.id),w.states[0].id,value,a.loop??true),active=list.find(s=>s.id===next);if(!active)continue;
   w.states=[active,...list.filter(s=>s!==active)];if(w.panel?.fitToContent){const bounds=visibleDiagramBounds(active.widgets);w.width=bounds.right;w.height=bounds.bottom;}
  }
  else if(a.kind==='fire-event'){for(const b of w.behaviors)if(b.event===value)execute(b.actions,depth+1);}
  else if(a.kind==='enable')w.disabled=!axureBoolean(value);
  else if(a.kind==='set-selected')w.selected=!!axureBoolean(value);
  else if(a.kind==='set-text')for(const c of w.content){if(c.kind==='control')c.value=String(value??'');if(c.kind==='text'){const p=c.paragraphs[0]??{css:{},runs:[]};c.paragraphs=[{css:p.css,runs:[{text:String(value??''),css:p.runs[0]?.css??{}}]}];}}
  else if(a.kind==='set-image'){for(const c of w.content)if(c.kind==='image')c.asset=value?String(value):null;}
  else if(['move','resize','rotate'].includes(a.kind)){
   const motion=structuredClone(a.motion??{});for(const key of motionAxes)if(motion[key]){const value=evaluate(motion[key]!);if(value!==undefined)motion[key]={kind:'literal',value};}
   const next=movedGeometry({...w,rotation:parseFloat(w.css.transform?.match(/rotate\(([-\d.]+)/)?.[1]??'0')},{...a,motion});Object.assign(w,{x:next.x,y:next.y,width:next.width,height:next.height});if(next.rotation)w.css.transform=`rotate(${next.rotation}deg)`;
  }else report('Snapshot preview action requires a runtime: '+a.kind);
 }};execute(actions);
}
/** An inert, clipped rendering of semantic widgets; it does not execute the source page. */
export function snapshotSurface(owner:Widget,source:Widget[],options:SnapshotOptions):Widget {
 const children=instantiateMaster(materializeWidgets(source),owner.id+'--snapshot--');
 for(const w of flattenWidgets(children)){
  w.behaviors=[];delete w.repeater;delete w.instance;delete w.adaptive;delete w.menu;
  if(w.panel?.fixed)w.panel={...w.panel,fixed:undefined};
  for(const content of [w.content,...Object.values(w.variants??{}).flatMap(v=>v.content?[v.content]:[])])for(const c of content){const text=c.kind==='text'?c:c.kind==='control'?c.richLabel:undefined;for(const p of text?.paragraphs??[])for(const r of p.runs)delete r.link;}
  w.content=w.content.filter(c=>c.kind!=='frame');
 }
 const p=options.padding,innerWidth=Math.max(0,owner.width-p.left-p.right),innerHeight=Math.max(0,owner.height-p.top-p.bottom),scale=options.fit?Math.max(0,Math.min(innerWidth/Math.max(1,options.width),innerHeight/Math.max(1,options.height))):Math.max(0,options.zoom);
 const x=options.fit?p.left+(innerWidth-options.width*scale)/2:p.left+options.panX,y=options.fit?p.top+(innerHeight-options.height*scale)*options.vertical/2:p.top+options.panY;
 const canvas:Widget={id:owner.id+'--snapshot-surface',name:'Snapshot of referenced page',type:'SnapshotSurface',kind:'shape',source:owner.source,x,y,width:options.width,height:options.height,content:[],behaviors:[],css:{background:options.background,transform:`scale(${scale})`,'transform-origin':'0 0','pointer-events':'none'},children};
 for(const w of children){w.x-=options.originX??0;w.y-=options.originY??0;}
 return {...owner,kind:'shape',css:{...owner.css,overflow:'hidden'},children:[canvas]};
}
