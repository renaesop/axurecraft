import {createVariables,reloadWithVariables} from './variables.ts';
import {animateTransition,frontIndex} from './transition.ts';
import {nextPanelState} from './panel.ts';
import {navigate} from './navigation.ts';
import {movedGeometry,geometryCss,animateGeometry,readGeometry,type Geometry} from './motion.ts';
import {createSelectionController} from './selection.ts';
import {executeActions} from './behavior-runtime.ts';
import {readWidgetValue,writeWidgetText,writeWidgetSelected} from './widget-dom.ts';
import type {Behavior,Action,RepeaterData,RepeaterState,Widget} from './model.ts';
import {materializeRepeater,readRepeaterProperty,flattenWidgets,updateRepeaterState} from './repeater-model.ts';
import {widgetElement,contentElements} from './render-tree.ts';
import {createNode,patchContent} from './dom-content.ts';
import {describeWidgets,enabledChanges,initialDisabled,appearanceVariant,canSelectWidget,type WidgetStateDefinition} from './widget-state.ts';
const variableDefinition=JSON.parse(document.getElementById('rp-variables')?.textContent??'{}');
const variables=createVariables(variableDefinition.definitions,location.hash,variableDefinition.pageName);
const behaviors:Record<string,Behavior[]>=JSON.parse(document.getElementById('rp-behaviors')?.textContent??'{}');
const repeaters:Record<string,RepeaterData>=JSON.parse(document.getElementById('rp-repeaters')?.textContent??'{}');
const repeaterStates:Record<string,RepeaterState>={};
let widgets:WidgetStateDefinition[]=JSON.parse(document.getElementById('rp-widgets')?.textContent??'[]');
const disabled:Record<string,boolean>={};
const selected:Record<string,boolean>={};
const assignedText:Record<string,string>={};
const geometry:Record<string,Geometry>={};
function applyAppearance(id:string):void {
  const target=document.getElementById(id);if(!target)return;
  const appearance=widgets.find(w=>w.id===id)?.appearance;
  if(appearance){
    const current=appearance[appearanceVariant(appearance,{disabled:disabled[id],selected:selected[id]})]??appearance.normal;
    const keys=new Set(Object.values(appearance).flatMap(value=>Object.keys(value.css)));
    for(const key of keys){
      if(['position','left','top','width','height','display'].includes(key)||geometry[id]&&['transform','transform-origin'].includes(key))continue;
      if(current.css[key]===undefined)target.style.removeProperty(key);else target.style.setProperty(key,current.css[key]);
    }
    const content=target.querySelector(':scope > .rp-content');
    if(content){patchContent(content,current.content.flatMap(contentElements));if(assignedText[id]!==undefined)writeWidgetText(id,assignedText[id]);}
  }
  for(const input of target.querySelectorAll<HTMLInputElement>('input,textarea,select,button')){
    if(input.closest('.rp-widget')===target)input.disabled=!!disabled[id];
  }
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
  for(const key of Object.keys(disabled))if(key.startsWith(id+'-row')){delete disabled[key];delete assignedText[key];delete selected[key];}
  for(const key of Object.keys(geometry))if(key.startsWith(id+'-row'))delete geometry[key];
  initializeWidgets(rowDefinitions);
  for(const w of flattenWidgets(rows))bind(w.id,w.behaviors,true);
}
async function applyActions(actions:Action[]):Promise<void>{
  for(const action of actions){
    const target=action.target?document.getElementById(action.target):null;
    switch(action.kind){
      case 'move':case 'resize':case 'rotate':if(target&&action.target){
        const definition=widgets.find(w=>w.id===action.target),before=geometry[action.target]??readGeometry(action.target,definition?.geometry);
        if(before){const after=movedGeometry(before,action);geometry[action.target]=after;animateGeometry(action.target,before,after,action,definition?.kind==='group');for(const [key,value]of Object.entries(geometryCss(after,definition?.kind==='group')))target.style.setProperty(key,value);}
      }break;
      case 'repeater-data':case 'repeater-sort':case 'repeater-page':if(action.target&&repeaters[action.target]){repeaterStates[action.target]=updateRepeaterState(repeaters[action.target],repeaterStates[action.target],action);if(action.repeaterAction?.operation!=='mark')refreshRepeater(action.target);}break;
      case 'focus':if(target){const control=target.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]')??target;control.focus();if(action.value&&'select'in control)(control as HTMLInputElement).select();}break;
      case 'link':if(typeof action.value==='string')navigate(action,action.includeVariables?variables.link(action.value):action.value);break;
      case 'back':history.back();break;
      case 'refresh':reloadWithVariables(variables,action.includeVariables!==false);break;
      case 'wait':await new Promise(resolve=>setTimeout(resolve,Number(action.value)||0));break;
      case 'hide':case 'show':case 'toggle':if(target){
        const show=action.kind==='show'||action.kind==='toggle'&&getComputedStyle(target).display==='none',t=action.transition;
        if(show){target.style.display='';if(t?.bringToFront)target.style.zIndex=String(frontIndex());}
        animateTransition(target,show,show?t?.show??0:t?.hide??0,show?t?.showDuration??0:t?.hideDuration??0,()=>{if(!show)target.style.display='none';});
      }break;
      case 'enable':if(action.target)applyDisabled(enabledChanges(widgets,action.target,!!action.value));break;
      case 'state':if(target){
        const states=[...target.querySelectorAll<HTMLElement>(':scope > .rp-state')],current=states.find(s=>!s.hidden);
        const next=nextPanelState(states.map(s=>s.dataset.state!),current?.dataset.state,action.value,action.loop??true);
        for(const state of states){const show=state.dataset.state===next;if(show===!state.hidden)continue;if(show)state.hidden=false;const t=action.transition;animateTransition(state,show,show?t?.show??0:t?.hide??0,show?t?.showDuration??0:t?.hideDuration??0,()=>{state.hidden=!show;});}
      }break;
    }
  }
}
function run(actions:Action[],depth=0):Promise<void>{
  return executeActions(actions,{
    readVariable:variables.read,writeVariable:variables.write,
    readWidget:(id,property)=>repeaters[id]?readRepeaterProperty(repeaters[id],repeaterStates[id],property)??readWidgetValue(id,property):readWidgetValue(id,property),writeText:(id,text)=>{assignedText[id]=text;writeWidgetText(id,text);},writeSelected:writeWidgetSelected,select:selection.select,
    selectionEventState:id=>!!selected[id],
    canSelect:id=>canSelectWidget(widgets.find(w=>w.id===id),!!disabled[id]),
    behaviors:id=>id==='$page'?behaviors.$page??[]:widgets.find(w=>w.id===id)?.behaviors??[],isDisabled:id=>!!disabled[id],
    apply:action=>applyActions([action]),
  },depth);
}
function bind(id:string,list:Behavior[],row=false):void {
  const el=id==='$page'?document.body:document.getElementById(id);if(!el)return;
  el.addEventListener('input',event=>{
    if((event.target as Element).closest('.rp-widget')!==el||disabled[id])return;
    const input=event.target as HTMLInputElement;
    if(['checkbox','radio'].includes(input.type))return;
    assignedText[id]=input.value;
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
    if(['textchange','selectedchange','select','unselect'].includes(behavior.event))continue;
    el.addEventListener(behavior.event==='selectionchange'?'change':behavior.event==='focus'?'focusin':behavior.event==='blur'?'focusout':behavior.event,event=>{if(disabled[id])return;if(behavior.event==='click'){const target=event.target as Element;if(target.closest('label.rp-selection')&&target.tagName!=='INPUT')return;event.stopPropagation();}void run(behavior.actions);});
  }
}
initializeWidgets(widgets);
bind('$page',behaviors.$page??[]);
for(const w of widgets)bind(w.id,behaviors[w.id]??w.behaviors,w.rowInstance);
