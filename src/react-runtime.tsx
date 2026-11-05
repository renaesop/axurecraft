import {pageStyle} from './page-layout.ts';
import {createVariables,reloadWithVariables} from './variables.ts';
import {createSelectionController} from './selection.ts';
import {executeActions} from './behavior-runtime.ts';
import {readWidgetValue} from './widget-dom.ts';
import {materializeRepeater,flattenWidgets,updateRepeaterState,type MaterializedRow} from './repeater-model.ts';
import {contentElements,widgetStyle,type ElementNode} from './render-tree.ts';
import {reactStyle,reactAttribute} from './react-props.ts';
import {describeWidgets,enabledChanges,initialDisabled,appearanceVariant,canSelectWidget,type WidgetStateDefinition,type AppearanceVariant} from './widget-state.ts';
import { createElement, Children, cloneElement, isValidElement, Fragment, useMemo, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, type HTMLAttributes, type ComponentProps, type ReactElement } from 'react';
import type { Action, Behavior, RepeaterData, RepeaterState, Widget, WidgetContent, GlobalVariable } from './model.ts';

export interface PageDefinition {
  id:string; alignment?:'left'|'center'; contentLeft?:number; name?:string; variables?:GlobalVariable[]; width:number; height:number; background:string; behaviors:Behavior[];
  repeaters:Record<string,RepeaterData>;
  widgets:WidgetStateDefinition[];
}
interface Override {repeater?:RepeaterState;visible?:boolean;state?:string;disabled?:boolean;text?:string;selected?:boolean;selectedPaint?:boolean}
interface Runtime {overrides:Record<string,Override>;run:(actions:Action[])=>Promise<void>;input:(id:string,property:'text'|'selected',value:string|boolean)=>void}
const Context=createContext<Runtime|null>(null);
const disabledOverrides=(widgets:WidgetStateDefinition[]):Record<string,Override>=>Object.fromEntries(Object.entries(initialDisabled(widgets)).map(([id,disabled])=>[id,{disabled,selected:widgets.find(w=>w.id===id)?.selected}]));
function useRuntime():Runtime {const value=useContext(Context);if(!value)throw new Error('Prototype widget requires PrototypePage');return value;}

/** React owns all visibility/state/disabled changes. No HTML injection or global DOM mutation. */
export function PrototypePage({definition,children}:{definition:PageDefinition;children:ReactNode}) {
  const variables=useMemo(()=>createVariables(definition.variables,typeof window==='undefined'?'':window.location.hash,definition.name),[definition]);
  const [overrides,setOverrides]=useState<Record<string,Override>>(()=>disabledOverrides(definition.widgets));
  const latest=useRef(overrides);
  const updateOverrides=(update:(previous:Record<string,Override>)=>Record<string,Override>):void=>{
    latest.current=update(latest.current);setOverrides(latest.current);
  };
  // Preserve document order, including each repeater's rows at its own position.
  // Native radio/selection-group event ordering follows the DOM, not an appended row list.
  const currentWidgets=():WidgetStateDefinition[]=>definition.widgets.flatMap(w=>{
    if(w.rowInstance)return [];
    const data=definition.repeaters[w.id];
    return [w,...(data?describeWidgets(materializeRepeater(w.id,data,latest.current[w.id]?.repeater).flatMap(row=>row.widgets)):[])];
  });
  const controller=useRef<AbortController|null>(null);
  const applyActions=async(actions:Action[],signal=controller.current?.signal):Promise<void>=>{
    for(const action of actions){
      if(signal?.aborted)return;
      if(action.kind==='wait'){
        await new Promise<void>(resolve=>{
          const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
          const timer=setTimeout(finish,Number(action.value)||0);signal?.addEventListener('abort',finish,{once:true});
        });continue;
      }
      if(action.kind==='link'){if(typeof action.value==='string')window.location.href=action.includeVariables?variables.link(action.value):action.value;continue;}
      if(action.kind==='back'){window.history.back();continue;}
      if(action.kind==='refresh'){reloadWithVariables(variables,action.includeVariables!==false);continue;}
      if(action.kind==='enable'&&action.target){
        const widgets=currentWidgets();
        for(const [id,disabled]of Object.entries(enabledChanges(widgets,action.target,!!action.value))){
          updateOverrides(previous=>({...previous,[id]:{...previous[id],disabled}}));
          if(!disabled&&widgets.find(w=>w.id===id)?.hasDisabledAppearance)selection.style(id,latest.current[id]?.selectedPaint??latest.current[id]?.selected??false);
        }
        continue;
      }
      updateOverrides(previous=>{
        if((action.kind==='repeater-sort'||action.kind==='repeater-page')&&action.target){
          const data=definition.repeaters[action.target];if(!data)return previous;
          const reset=Object.fromEntries(Object.entries(previous).filter(([id])=>!id.startsWith(action.target+'-row')));
          const repeater=updateRepeaterState(data,previous[action.target]?.repeater,action);
          const rows=materializeRepeater(action.target,data,repeater).flatMap(row=>row.widgets);
          return {...reset,...disabledOverrides(describeWidgets(rows)),[action.target]:{...previous[action.target],repeater}};
        }
        let widgets=definition.widgets;
        // Materialized row metadata must follow the current page/sort state.
        if(!widgets.some(w=>w.id===action.target)){
          widgets=[...definition.widgets.filter(w=>!w.rowInstance),...Object.entries(definition.repeaters).flatMap(([id,data])=>describeWidgets(materializeRepeater(id,data,previous[id]?.repeater).flatMap(row=>row.widgets)))];
        }
        const target=widgets.find(w=>w.id===action.target);
        if(!target)return previous;
        const next={...previous[target.id]};
        if(action.kind==='show')next.visible=true;
        if(action.kind==='hide')next.visible=false;
        if(action.kind==='toggle')next.visible=!(next.visible??target.visible);
        if(action.kind==='state'){
          const states=target.states;const index=states.indexOf(next.state??states[0]);
          if(action.value==='next')next.state=states[(index+1)%states.length];
          else if(action.value==='previous')next.state=states[(index+states.length-1)%states.length];
          else if(typeof action.value==='string'&&states.includes(action.value))next.state=action.value;
        }
        return {...previous,[target.id]:next};
      });
    }
  };
  const selection=createSelectionController({
    widgets:currentWidgets,disabled:id=>!!latest.current[id]?.disabled,
    checked:id=>latest.current[id]?.selected??!!readWidgetValue(id,'selected'),
    paint:id=>latest.current[id]?.selectedPaint??latest.current[id]?.selected??false,
    writeChecked:(id,selected)=>updateOverrides(previous=>({...previous,[id]:{
      ...previous[id],selected,selectedPaint:previous[id]?.selectedPaint??previous[id]?.selected??false,
    }})),
    writePaint:(id,selectedPaint)=>updateOverrides(previous=>({...previous,[id]:{
      ...previous[id],selectedPaint,...(currentWidgets().find(w=>w.id===id)?.selectionControl?{}:{selected:selectedPaint}),
    }})),
    fire:(id,value,depth)=>{
      for(const event of ['selectedchange',value?'select':'unselect']){
        if(latest.current[id]?.disabled)return;
        for(const behavior of currentWidgets().find(w=>w.id===id)?.behaviors??[])if(behavior.event===event)void run(behavior.actions,controller.current?.signal,depth);
      }
    },
  });
  const run=(actions:Action[],signal=controller.current?.signal,depth=0):Promise<void>=>executeActions(actions,{
    readVariable:variables.read,writeVariable:variables.write,
    readWidget:(id,property)=>latest.current[id]?.[property==='text'?'text':'selected']??readWidgetValue(id,property),
    writeText:(id,text)=>updateOverrides(previous=>({...previous,[id]:{...previous[id],text}})),
    writeSelected:(id,selected)=>updateOverrides(previous=>({...previous,[id]:{...previous[id],selected,selectedPaint:previous[id]?.disabled?(previous[id]?.selectedPaint??previous[id]?.selected??false):selected}})),
    behaviors:id=>currentWidgets().find(w=>w.id===id)?.behaviors??[],
    isDisabled:id=>!!latest.current[id]?.disabled,
    select:selection.select,
    selectionEventState:id=>latest.current[id]?.selectedPaint??latest.current[id]?.selected??false,
    canSelect:id=>canSelectWidget(currentWidgets().find(w=>w.id===id),!!latest.current[id]?.disabled),
    apply:action=>applyActions([action],signal),cancelled:()=>!!signal?.aborted,
  },depth);
  const input=(id:string,property:'text'|'selected',value:string|boolean):void=>{
    if(latest.current[id]?.disabled)return;
    if(property==='selected'){selection.click(id,!!value);return;}
    updateOverrides(previous=>({...previous,[id]:{...previous[id],text:String(value)}}));
    for(const b of currentWidgets().find(w=>w.id===id)?.behaviors??[])if(b.event==='textchange')void run(b.actions);
  };
  useLayoutEffect(()=>{
    const active=new AbortController();controller.current=active;
    for(const list of [definition.behaviors,...definition.widgets.filter(w=>!w.rowInstance).map(w=>w.behaviors)])for(const b of list)if(b.event==='load')void run(b.actions,active.signal);
    return ()=>{active.abort();};
  },[definition]);
  return <Context.Provider value={{overrides,run,input}}><main className="rp-page" style={{...reactStyle(pageStyle(definition)),background:definition.background}}>{children}</main></Context.Provider>;
}
const eventProps:Record<string,string>={click:'onClick',dblclick:'onDoubleClick',mouseenter:'onMouseEnter',mouseleave:'onMouseLeave',change:'onChange',focus:'onFocus',blur:'onBlur'};
export function RpWidget({id,type,name,style,disabledStyle,selectedStyle,behaviors,children}:{id:string;type:string;name:string;style:CSSProperties;disabledStyle?:CSSProperties;selectedStyle?:CSSProperties;behaviors:Behavior[];children?:ReactNode}) {
  const runtime=useRuntime();const override=runtime.overrides[id];
  const events:Record<string,(event:{stopPropagation:()=>void;target:EventTarget})=>void>={};
  for(const [eventName,prop]of Object.entries(eventProps)){
    const list=behaviors.filter(b=>b.event===eventName);if(!list.length)continue;
    events[prop]=event=>{if(override?.disabled)return;if(eventName==='click'){const target=event.target as Element;if(target.closest('label.rp-selection')&&target.tagName!=='INPUT')return;event.stopPropagation();}for(const b of list)void runtime.run(b.actions);};
  }
  const variant=appearanceVariant({disabled:disabledStyle,selected:selectedStyle},override??{});
  const paint=variant==='disabled'?disabledStyle:variant==='selected'?selectedStyle:undefined;
  const computedStyle=paint?{...paint,position:style.position,left:style.left,top:style.top,width:style.width,height:style.height,display:style.display}:{...style};
  if(override?.visible!==undefined)computedStyle.display=override.visible?(style.display==='none'?undefined:style.display):'none';
  return <div className="rp-widget" id={id} data-kind={type} data-name={name} aria-disabled={override?.disabled} aria-selected={override?.selected} data-click={events.onClick?'':undefined} style={computedStyle} {...events}>{children}</div>;
}
export function RpState({ownerId,id,initial,children,style}:{ownerId:string;id:string;initial:boolean;children?:ReactNode;style?:CSSProperties}) {
  const {overrides}=useRuntime();const selected=overrides[ownerId]?.state;
  return <div className="rp-state" style={style} data-state={id} hidden={selected===undefined?!initial:selected!==id}>{children}</div>;
}
type ControlProps=Omit<ComponentProps<'input'>,'children'> & {ownerId:string;as?:'input'|'textarea'|'select'|'button';children?:ReactNode};
export function RpControl({ownerId,as='input',disabled,...props}:ControlProps) {
  const runtime=useRuntime(),override=runtime.overrides[ownerId];
  const ref=useRef<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|HTMLButtonElement|null>(null);
  const actualDisabled=override?.disabled??disabled;
  // Update this component's own uncontrolled element; preserve focus and identity.
  useLayoutEffect(()=>{if(ref.current&&override?.text!==undefined)ref.current.value=override.text;},[override?.text]);
  useLayoutEffect(()=>{if(ref.current instanceof HTMLInputElement&&override?.selected!==undefined)ref.current.checked=override.selected;},[override?.selected]);
  const onChange=(event:{target:EventTarget}):void=>{
    const target=event.target as HTMLInputElement;
    const selected=['checkbox','radio'].includes(target.type);
    if(!selected)runtime.input(ownerId,'text',target.value);
  };
  if(as==='textarea')return <textarea {...props as ComponentProps<'textarea'>} ref={el=>{ref.current=el;}} disabled={actualDisabled} onChange={onChange}/>;
  if(as==='select')return <select {...props as ComponentProps<'select'>} ref={el=>{ref.current=el;}} disabled={actualDisabled} onChange={onChange}/>;
  if(as==='button')return <button {...props as ComponentProps<'button'>} ref={el=>{ref.current=el;}} disabled={actualDisabled}/>;
  return <input {...props} ref={el=>{ref.current=el;}} disabled={actualDisabled} onChange={onChange} onClick={event=>{if(['checkbox','radio'].includes(event.currentTarget.type))runtime.input(ownerId,'selected',event.currentTarget.checked);}}/>;
}

/** Concrete generated text remains editable JSX; overrides preserve its first run style. */
export function RpText({ownerId,children,...props}:HTMLAttributes<HTMLDivElement>&{ownerId:string}) {
  const {overrides}=useRuntime(),value=overrides[ownerId]?.text;
  let content=children;
  if(value!==undefined){
    const paragraph=Children.toArray(children).find(isValidElement) as ReactElement<{children?:ReactNode}>|undefined;
    const span=paragraph?Children.toArray(paragraph.props.children).find(isValidElement) as ReactElement<{children?:ReactNode}>|undefined:undefined;
    const run=span&&span.type!=='br'?cloneElement(span,{},value):<span>{value}</span>;
    content=paragraph?cloneElement(paragraph,{},run):<p>{run}</p>;
  }
  return <div {...props}>{content}</div>;
}

export const widgetCss=(widget:Widget):CSSProperties=>reactStyle(widgetStyle(widget));
export const widgetDisabledCss=(widget:Widget):CSSProperties|undefined=>widget.variants?.disabled?reactStyle(widget.variants.disabled.css):undefined;
export const widgetSelectedCss=(widget:Widget):CSSProperties|undefined=>widget.variants?.selected?reactStyle(widget.variants.selected.css):undefined;
export function RpAppearance({ownerId,variants,children}:{ownerId:string;variants:Exclude<AppearanceVariant,'normal'>[];children:(variant:AppearanceVariant)=>ReactNode}) {
  const {overrides}=useRuntime();
  const available={disabled:variants.includes('disabled'),selected:variants.includes('selected')};
  return <div className="rp-content" style={{display:'contents'}}>{children(appearanceVariant(available,overrides[ownerId]??{}))}</div>;
}
function renderContent(node:ElementNode|string,ownerId:string,key:number):ReactNode {
  if(typeof node==='string')return node;
  const props:Record<string,unknown>={key};for(const [name,value]of Object.entries(node.attrs))if(value!==undefined)props[reactAttribute(name)]=value;
  if(node.css)props.style=reactStyle(node.css);
  const control=['input','textarea','select','button'].includes(node.tag);
  let children=node.children.map((c,i)=>renderContent(c,ownerId,i));
  if(node.tag==='textarea'){props.defaultValue=node.children.filter(c=>typeof c==='string').join('');children=[];}
  if(node.attrs.class==='rp-text'){props.ownerId=ownerId;return createElement(RpText,{...props,ownerId} as HTMLAttributes<HTMLDivElement>&{ownerId:string},...children);}
  if(control){props.ownerId=ownerId;props.as=node.tag;return createElement(RpControl,props as ControlProps,...children);}
  return createElement(node.tag,props,...children);
}
export function RpContent({content,variants,ownerId}:{content:WidgetContent[];variants?:Widget['variants'];ownerId:string}) {
  const {overrides}=useRuntime(),variant=appearanceVariant(variants,overrides[ownerId]??{});
  const current=(variant==='normal'?undefined:variants?.[variant]?.content)??content;
  const result=current.flatMap(contentElements).map((node,i)=>renderContent(node,ownerId,i));
  return Object.values(variants??{}).some(v=>v.content)?<div className="rp-content" style={{display:'contents'}}>{result}</div>:<>{result}</>;
}
export function RpRepeater({ownerId,data,children}:{ownerId:string;data:RepeaterData;children:(row:MaterializedRow)=>ReactNode}) {
  const runtime=useRuntime(),state=runtime.overrides[ownerId]?.repeater;
  const rows=useMemo(()=>materializeRepeater(ownerId,data,state),[ownerId,data,state]);
  useEffect(()=>{for(const w of flattenWidgets(rows.flatMap(row=>row.widgets)))for(const b of w.behaviors)if(b.event==='load'||b.event==='itemload')void runtime.run(b.actions);},[rows]);
  return <>{rows.map(row=><Fragment key={`${state?.revision??0}:${row.key}`}>{children(row)}</Fragment>)}</>;
}
