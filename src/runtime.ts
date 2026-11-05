import {pointerTargets} from './pointer.ts';
import {bindSubmenu} from './menu.ts';
import {openFlyout,closeFlyout,backdropStyle} from './popups.ts';
import {bindSyntheticEvents,syntheticEvents,eventValues,type EventValues} from './input-events.ts';
import {chooseAdaptiveView,type AdaptiveDefinition} from './adaptive.ts';
import {pageStyle} from './page-layout.ts';
import {compressionActions} from './compression.ts';
import {createVariables,reloadWithVariables} from './variables.ts';
import {animateTransition,frontIndex} from './transition.ts';
import {nextPanelState,schedulePanelEvent,createPanelRepeater} from './panel.ts';
import {currentImage,isImageUrl} from './images.ts';
import {treePlacements} from './tree.ts';
import {navigate} from './navigation.ts';
import {movedGeometry,motionOffset,geometryCss,animateGeometry,readGeometry,type Geometry} from './motion.ts';
import {createSelectionController} from './selection.ts';
import {executeActions} from './behavior-runtime.ts';
import {readWidgetValue,writeWidgetText,writeWidgetSelected} from './widget-dom.ts';
import type {Behavior,Action,ImageState,RepeaterData,RepeaterState,Widget} from './model.ts';
import {materializeRepeater,readRepeaterProperty,flattenWidgets,updateRepeaterState} from './repeater-model.ts';
import {widgetElement,contentElements} from './render-tree.ts';
import {createNode,patchContent} from './dom-content.ts';
import {describeWidgets,enabledChanges,initialDisabled,appearanceVariant,canSelectWidget,type WidgetStateDefinition} from './widget-state.ts';
const adaptive:AdaptiveDefinition|null=JSON.parse(document.getElementById('rp-adaptive')?.textContent??'null');
let activeView=adaptive?chooseAdaptiveView(adaptive,innerWidth,innerHeight):'',forcedView:string|undefined;
const backdrops=new Map<string,HTMLElement>();
const visibleOverrides:Record<string,boolean>={};
const variableDefinition=JSON.parse(document.getElementById('rp-variables')?.textContent??'{}');
const variables=createVariables(variableDefinition.definitions,location.hash,variableDefinition.pageName);
const behaviors:Record<string,Behavior[]>=JSON.parse(document.getElementById('rp-behaviors')?.textContent??'{}');
const repeaters:Record<string,RepeaterData>=JSON.parse(document.getElementById('rp-repeaters')?.textContent??'{}');
const repeaterStates:Record<string,RepeaterState>={};
let widgets:WidgetStateDefinition[]=JSON.parse(document.getElementById('rp-widgets')?.textContent??'[]');
const disabled:Record<string,boolean>={};
const selected:Record<string,boolean>={};
const assignedText:Record<string,string>={};
const imageOverrides:Record<string,Partial<Record<ImageState,string>>>={};
const pointerState:Record<string,{hovered?:boolean;pressed?:boolean}>={};
function applyImage(id:string):void {
 const widget=document.getElementById(id),definition=widgets.find(w=>w.id===id);if(!widget||!definition?.imageAssets)return;
 const adaptiveContent=definition.adaptive?.[activeView],variant=appearanceVariant(adaptiveContent?.variants,{disabled:disabled[id],selected:selected[id]}),imageContent=(variant==='normal'?undefined:adaptiveContent?.variants?.[variant]?.content)??adaptiveContent?.content;
 const base=imageContent?{...definition.imageAssets,normal:imageContent.find(c=>c.kind==='image')?.asset}:definition.imageAssets;
 const state={disabled:disabled[id],selected:selected[id],...pointerState[id]},asset=currentImage(base,imageOverrides[id],state);
 for(const el of widget.querySelectorAll('img.rp-image,svg.rp-framed-image'))if(el.closest('.rp-widget')===widget){const image=el.localName==='svg'?el.querySelector('image'):el;if(image){const attr=image.localName==='image'?'href':'src';if(asset)image.setAttribute(attr,asset);else image.removeAttribute(attr);}el.toggleAttribute('hidden',!asset);}
}
const expanded:Record<string,boolean>={};
const panelRepeats=createPanelRepeater();
const geometry:Record<string,Geometry>={};
function applyAppearance(id:string):void {
  const target=document.getElementById(id);if(!target)return;
  const definition=widgets.find(w=>w.id===id),paint=definition?.adaptive?.[activeView];
  const appearance=paint?{normal:{css:paint.css,content:paint.content},...Object.fromEntries(Object.entries(paint.variants??{}).map(([key,v])=>[key,{css:{...paint.css,...v.css},content:v.content??paint.content}]))}:definition?.appearance;
  if(appearance){
    const current=appearance[appearanceVariant(appearance,{disabled:disabled[id],selected:selected[id],...pointerState[id]})]??appearance.normal;
    const keys=new Set(Object.values(appearance).flatMap(value=>Object.keys(value.css)));
    for(const key of keys){
      if(['position','left','top','width','height','display'].includes(key)||geometry[id]&&['transform','transform-origin'].includes(key))continue;
      if(current.css[key]===undefined)target.style.removeProperty(key);else target.style.setProperty(key,current.css[key]);
    }
    const content=target.querySelector(':scope > .rp-content');
    if(content){patchContent(content,current.content.flatMap(contentElements));if(assignedText[id]!==undefined)writeWidgetText(id,assignedText[id]);}
  }
  applyImage(id);
  for(const input of target.querySelectorAll<HTMLInputElement>('input,textarea,select,button')){
    if(input.closest('.rp-widget')===target)input.disabled=!!disabled[id];
  }
}
function applyAdaptive():void {
 if(!adaptive)return;const layout=adaptive.layouts[activeView],page=document.querySelector<HTMLElement>('.rp-page');
 if(layout&&page){page.style.cssText='';for(const [key,value]of Object.entries(pageStyle(layout)))page.style.setProperty(key,value);document.body.style.background=layout.background;}
 for(const w of widgets){const paint=w.adaptive?.[activeView],el=document.getElementById(w.id);if(!paint||!el)continue;delete geometry[w.id];el.style.cssText='';for(const [key,value]of Object.entries(paint.css))el.style.setProperty(key,value);if(visibleOverrides[w.id]!==undefined)el.style.display=visibleOverrides[w.id]?'':'none';applyAppearance(w.id);}
}
function switchAdaptive(value?:string):void {
 if(!adaptive)return;forcedView=value&&value!=='auto'&&adaptive.views.some(v=>v.id===value)?value:undefined;const next=forcedView??chooseAdaptiveView(adaptive,innerWidth,innerHeight);if(next===activeView)return;activeView=next;applyAdaptive();for(const b of behaviors.$page??[])if(b.event==='adaptivechange')void run(b.actions);
}
function applyDisabled(changes:Record<string,boolean>,reapply=true):void {
  for(const [id,value]of Object.entries(changes)){
    disabled[id]=value;
    document.getElementById(id)?.setAttribute('aria-disabled',String(value));
    applyAppearance(id);
    if(reapply&&!value&&widgets.find(w=>w.id===id)?.hasDisabledAppearance)selection.style(id,!!selected[id]);
  }
}
const selection=createSelectionController({
  widgets:()=>widgets,disabled:id=>!!disabled[id],checked:id=>!!readWidgetValue(id,'selected'),paint:id=>!!selected[id],
  writeChecked:writeWidgetSelected,
  writePaint:(id,value)=>{
    selected[id]=value;
    if(!widgets.find(w=>w.id===id)?.selectionControl)writeWidgetSelected(id,value);
    applyAppearance(id);
  },
  fire:(id,value,depth)=>{
    for(const event of ['selectedchange',value?'select':'unselect']){
      if(disabled[id])return;
      for(const behavior of widgets.find(w=>w.id===id)?.behaviors??[])if(behavior.event===event)void run(behavior.actions,depth);
    }
  },
});
function initializeWidgets(list:WidgetStateDefinition[]):void {
  for(const w of list){selected[w.id]=!!w.selected;writeWidgetSelected(w.id,!!w.selected);}
  applyDisabled(initialDisabled(list),false);
}
function refreshRepeater(id:string):void {
  const target=document.getElementById(id),data=repeaters[id];if(!target||!data)return;
  const rows=materializeRepeater(id,data,repeaterStates[id]).flatMap(row=>row.widgets);
  target.replaceChildren(...rows.map(w=>createNode(widgetElement(w))));
  const rowDefinitions=describeWidgets(rows);
  widgets=widgets.flatMap(w=>w.id.startsWith(id+'-row')?[]:[w,...(w.id===id?rowDefinitions:[])]);
  for(const key of Object.keys(disabled))if(key.startsWith(id+'-row')){delete disabled[key];delete assignedText[key];delete selected[key];delete imageOverrides[key];delete pointerState[key];}
  for(const key of Object.keys(geometry))if(key.startsWith(id+'-row'))delete geometry[key];
  initializeWidgets(rowDefinitions);applyAdaptive();
  for(const w of flattenWidgets(rows))bind(w.id,w.behaviors,true);
}
async function applyActions(actions:Action[]):Promise<void>{
  for(const action of actions){
    const target=action.target?document.getElementById(action.target):null;
    switch(action.kind){
      case 'adaptive-view':switchAdaptive(String(action.value));break;
      case 'set-image':if(action.target&&typeof action.value==='string'&&isImageUrl(action.value)){imageOverrides[action.target]={...imageOverrides[action.target],[action.imageState??'normal']:action.value};applyImage(action.target);}break;
      case 'tree-toggle':if(action.target){
        const node=widgets.find(w=>w.id===action.target),tree=node?.tree;if(!tree)break;
        expanded[action.target]=!(expanded[action.target]??tree.expanded);
        document.getElementById(action.target)?.setAttribute('aria-expanded',String(expanded[action.target]));
        for(const p of treePlacements(widgets,expanded)){const el=document.getElementById(p.id);if(el){el.style.top=p.y+'px';el.style.height=p.height+'px';el.style.display=p.visible?'':'none';}}
        if(tree.toggleId)selection.select(tree.toggleId,expanded[action.target],0);
        if(tree.labelId)selection.select(tree.labelId,true,0);
      }break;
      case 'move':case 'resize':case 'rotate':if(target&&action.target){
        const definition=widgets.find(w=>w.id===action.target),before=geometry[action.target]??readGeometry(action.target,definition?.kind==='group'?definition.geometry:undefined);
        if(before){const after=movedGeometry(before,action,motionOffset(action.target,before));geometry[action.target]=after;animateGeometry(action.target,before,after,action,definition?.kind==='group');for(const [key,value]of Object.entries(geometryCss(after,definition?.kind==='group')))target.style.setProperty(key,value);}
      }break;
      case 'repeater-data':case 'repeater-sort':case 'repeater-page':if(action.target&&repeaters[action.target]){repeaterStates[action.target]=updateRepeaterState(repeaters[action.target],repeaterStates[action.target],action);if(action.repeaterAction?.operation!=='mark')refreshRepeater(action.target);}break;
      case 'focus':if(target){const control=target.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]')??target;control.focus();if(action.value&&'select'in control)(control as HTMLInputElement).select();}break;
      case 'link':if(typeof action.value==='string')navigate(action,action.includeVariables?variables.link(action.value):action.value);break;
      case 'back':history.back();break;
      case 'refresh':reloadWithVariables(variables,action.includeVariables!==false);break;
      case 'wait':await new Promise(resolve=>setTimeout(resolve,Number(action.value)||0));break;
      case 'hide':case 'show':case 'toggle':if(target){
        const wasVisible=visibleOverrides[target.id]??(getComputedStyle(target).display!=='none'),show=action.kind==='show'||action.kind==='toggle'&&!wasVisible,t=action.transition;
        if(action.compression&&show!==wasVisible)await applyActions(compressionActions(target.id,widgets,id=>geometry[id]??readGeometry(id,widgets.find(w=>w.id===id)?.kind==='group'?widgets.find(w=>w.id===id)?.geometry:undefined),action.compression,show));
        closeFlyout(target.id);backdrops.get(target.id)?.remove();backdrops.delete(target.id);
        if(show&&action.popup){const id=target.id,z=frontIndex();target.style.zIndex=String(z+1);if(action.popup.mode==='flyout')openFlyout(id,action.popup.source,()=>void run([{kind:'hide',target:id,transition:t}]));else{const backdrop=document.createElement('div');backdrop.className='rp-backdrop';for(const [key,value]of Object.entries(backdropStyle(action.popup.background??'rgba(0,0,0,.5)',z)))backdrop.style.setProperty(key,value);target.before(backdrop);backdrops.set(id,backdrop);backdrop.addEventListener('click',()=>{backdrop.remove();backdrops.delete(id);if(!wasVisible)void run([{kind:'hide',target:id,transition:t}]);});}}
        visibleOverrides[target.id]=show;
        if(show){target.style.display='';if(t?.bringToFront)target.style.zIndex=String(frontIndex());}
        animateTransition(target,show,show?t?.show??0:t?.hide??0,show?t?.showDuration??0:t?.hideDuration??0,()=>{if(!show)target.style.display='none';if(show!==wasVisible)for(const b of widgets.find(w=>w.id===target.id)?.behaviors??[])if(b.event===(show?'show':'hide'))void run(b.actions);});
      }break;
      case 'enable':if(action.target)applyDisabled(enabledChanges(widgets,action.target,!!action.value));break;
      case 'state':if(target){
        const definition=widgets.find(w=>w.id===action.target);
        if(!panelRepeats.prepare(action,next=>void applyActions([next])))break;
        const states=[...target.querySelectorAll<HTMLElement>(':scope > .rp-state')],current=states.find(s=>s.dataset.state===target.dataset.activeState)??states.find(s=>!s.hidden);
        const next=nextPanelState(states.map(s=>s.dataset.state!),current?.dataset.state,action.value,action.loop??true,action.expression?definition?.stateNames??{}:undefined);
        if(!next||next===current?.dataset.state){panelRepeats.cancel(target.id);if(action.showWhenSet&&next)await applyActions([{kind:'show',target:target.id,compression:action.compression}]);break;}
        const size=definition?.stateSizes?.[next],wasVisible=getComputedStyle(target).display!=='none';
        if(size&&action.compression&&wasVisible)await applyActions(compressionActions(target.id,widgets,id=>geometry[id]??readGeometry(id,widgets.find(w=>w.id===id)?.kind==='group'?widgets.find(w=>w.id===id)?.geometry:undefined),action.compression,size));
        target.dataset.activeState=next;
        if(size){target.style.height=size.height+'px';if(!definition?.percentWidth)target.style.width=size.width+'px';if(geometry[target.id])geometry[target.id]={...geometry[target.id],...size};}
        schedulePanelEvent(target.id,action.transition,()=>{for(const b of definition?.behaviors??[])if(b.event==='statechange')void run(b.actions);});
        for(const state of states){const show=state.dataset.state===next;if(!show&&state.hidden)continue;if(show)state.hidden=false;const t=action.transition;animateTransition(state,show,show?t?.show??0:t?.hide??0,show?t?.showDuration??0:t?.hideDuration??0,()=>{state.hidden=!show;});}
        if(action.showWhenSet)await applyActions([{kind:'show',target:target.id,compression:action.compression}]);

      }break;
    }
  }
}
function resolvedTargets(id:string):string[]{return id==='$page'||document.getElementById(id)?[id]:widgets.filter(w=>w.instance?.templateId===id).map(w=>w.id);}
function run(actions:Action[],depth=0,values:EventValues={}):Promise<void>{
  return executeActions(actions,{
    resolveTargets:resolvedTargets,readEvent:key=>values[key],readVariable:variables.read,writeVariable:variables.write,
    readWidget:(id,property)=>repeaters[id]?readRepeaterProperty(repeaters[id],repeaterStates[id],property)??readWidgetValue(id,property):readWidgetValue(resolvedTargets(id)[0]??id,property),writeText:(id,text)=>{assignedText[id]=text;writeWidgetText(id,text);},writeSelected:writeWidgetSelected,select:selection.select,
    selectionEventState:id=>!!selected[id],
    canSelect:id=>canSelectWidget(widgets.find(w=>w.id===id),!!disabled[id]),
    behaviors:id=>id==='$page'?behaviors.$page??[]:widgets.find(w=>w.id===id)?.behaviors??[],isDisabled:id=>!!disabled[id],
    apply:action=>applyActions([action]),
  },depth);
}
function bind(id:string,list:Behavior[],row=false):void {
  const menu=widgets.find(w=>w.id===id)?.menu;if(menu)bindSubmenu(id,menu.trigger,actions=>void run(actions));
  const el=id==='$page'?document.body:document.getElementById(id);if(!el)return;
  if(list.some(b=>(syntheticEvents as readonly string[]).includes(b.event)))bindSyntheticEvents(el,list.map(b=>b.event),(name,values)=>{for(const b of list)if(b.event===name)void run(b.actions,0,values);},()=>!!disabled[id]);
  if(widgets.find(w=>w.id===id)?.imageAssets||widgets.find(w=>w.id===id)?.propagateStyles||widgets.find(w=>w.id===id)?.appearance||widgets.find(w=>w.id===id)?.adaptive)for(const [name,key,value]of [['mouseenter','hovered',true],['mouseleave','hovered',false],['mousedown','pressed',true],['mouseup','pressed',false]] as const)el.addEventListener(name,()=>{for(const target of pointerTargets(widgets,id)){pointerState[target]={...pointerState[target],[key]:value,...(name==='mouseleave'?{pressed:false}:{})};applyAppearance(target);}});
  el.addEventListener('input',event=>{
    if((event.target as Element).closest('.rp-widget')!==el||disabled[id])return;
    const input=event.target as HTMLInputElement;
    if(['checkbox','radio'].includes(input.type))return;
    if(!(input instanceof HTMLSelectElement&&input.multiple))assignedText[id]=input.value;
    for(const b of list)if(b.event==='textchange')void run(b.actions);
  });
  el.addEventListener('click',event=>{
    const input=event.target as HTMLInputElement;
    if(input.closest('.rp-widget')!==el||input.tagName!=='INPUT'||!['checkbox','radio'].includes(input.type))return;
    selection.click(id,input.checked);
  });
  for(const behavior of list){
    if(behavior.event==='load'||row&&behavior.event==='itemload'){void run(behavior.actions);continue;}
    if(behavior.event==='click')el.setAttribute('data-click','');
    if(['textchange','selectedchange','select','unselect',...syntheticEvents].includes(behavior.event))continue;
    (id==='$page'&&['resize','scroll'].includes(behavior.event)?window:el).addEventListener(behavior.event==='selectionchange'?'change':behavior.event==='focus'?'focusin':behavior.event==='blur'?'focusout':behavior.event,event=>{if(disabled[id])return;if(behavior.event==='click'){const target=event.target as Element;if(target.closest('label.rp-selection')&&target.tagName!=='INPUT')return;event.stopPropagation();}void run(behavior.actions,0,eventValues(event));});
  }
}
initializeWidgets(widgets);
applyAdaptive();window.addEventListener('resize',()=>switchAdaptive(forcedView));
bind('$page',behaviors.$page??[]);
for(const w of widgets)bind(w.id,behaviors[w.id]??w.behaviors,w.rowInstance);

// Delegate inline links so appearance swaps and repeater refreshes keep their handlers.
for(const eventName of ['click','dblclick','mouseenter','mouseleave','mousedown','mouseup','focus','blur','keydown','keyup'])document.addEventListener(eventName,event=>{
 const target=event.target instanceof Element?event.target.closest<HTMLElement>('.rp-inline-link'):null;if(!target)return;
 if(['mouseenter','mouseleave','focus','blur'].includes(eventName)&&event.target!==target)return;
 const owner=target.closest<HTMLElement>('.rp-widget');if(!owner||disabled[owner.id])return;
 const list:Behavior[]=JSON.parse(target.dataset.rpLink??'[]');
 const name=eventName==='keydown'&&(event as KeyboardEvent).key==='Enter'?'click':eventName;
 const matches=list.filter(b=>b.event===name);if(!matches.length)return;
 event.stopPropagation();if(name==='click')event.preventDefault();for(const b of matches)void run(b.actions);
},true);
