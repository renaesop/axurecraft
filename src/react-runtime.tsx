import {createPortal} from 'react-dom';
import {openFlyout,closeFlyout,backdropStyle} from './popups.ts';
import {bindSyntheticEvents,syntheticEvents,eventValues,type EventValues} from './input-events.ts';
import {chooseAdaptiveView,type AdaptiveDefinition,type AdaptivePaint} from './adaptive.ts';
import {compressionActions} from './compression.ts';
import {pageStyle} from './page-layout.ts';
import {animateTransition,frontIndex} from './transition.ts';
import {nextPanelState,schedulePanelEvent} from './panel.ts';
import {currentImage,isImageUrl} from './images.ts';
import {treePlacements} from './tree.ts';
import {navigate} from './navigation.ts';
import {movedGeometry,motionOffset,geometryCss,animateGeometry,readGeometry,type Geometry} from './motion.ts';
import {createVariables,reloadWithVariables} from './variables.ts';
import {createSelectionController} from './selection.ts';
import {executeActions} from './behavior-runtime.ts';
import {readWidgetValue} from './widget-dom.ts';
import {materializeRepeater,readRepeaterProperty,flattenWidgets,updateRepeaterState,type MaterializedRow} from './repeater-model.ts';
import {contentElements,widgetStyle,type ElementNode} from './render-tree.ts';
import {reactStyle,reactAttribute} from './react-props.ts';
import {describeWidgets,enabledChanges,initialDisabled,appearanceVariant,canSelectWidget,type WidgetStateDefinition,type AppearanceVariant} from './widget-state.ts';
import { createElement, Children, cloneElement, isValidElement, Fragment, useMemo, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, type HTMLAttributes, type ComponentProps, type ReactElement } from 'react';
import type { Action, Behavior, RepeaterData, RepeaterState, Widget, WidgetContent, GlobalVariable } from './model.ts';

export interface PageDefinition {
  adaptive?:AdaptiveDefinition;
  id:string; alignment?:'left'|'center'; contentLeft?:number; name?:string; variables?:GlobalVariable[]; width:number; height:number; background:string; behaviors:Behavior[];
  repeaters:Record<string,RepeaterData>;
  widgets:WidgetStateDefinition[];
}
interface Override {images?:Partial<Record<import('./model.ts').ImageState,string>>;hovered?:boolean;pressed?:boolean;autoSize?:{width?:number;height:number};expanded?:boolean;repeater?:RepeaterState;visible?:boolean;state?:string;disabled?:boolean;text?:string;selected?:boolean;selectedPaint?:boolean;geometry?:Geometry;zIndex?:number;transition?:Action['transition']}
interface Runtime {paint:(id:string)=>AdaptivePaint|undefined;image:(id:string,fallback?:string|null)=>string|null|undefined;pointer:(id:string,key:'hovered'|'pressed',value:boolean)=>void;overrides:Record<string,Override>;run:(actions:Action[],values?:EventValues)=>Promise<void>;input:(id:string,property:'text'|'selected',value:string|boolean)=>void}
const Context=createContext<Runtime|null>(null);
const disabledOverrides=(widgets:WidgetStateDefinition[]):Record<string,Override>=>Object.fromEntries(Object.entries(initialDisabled(widgets)).map(([id,disabled])=>[id,{disabled,selected:widgets.find(w=>w.id===id)?.selected}]));
function useRuntime():Runtime {const value=useContext(Context);if(!value)throw new Error('Prototype widget requires PrototypePage');return value;}

/** React owns all visibility/state/disabled changes. No HTML injection or global DOM mutation. */
export function PrototypePage({definition,children}:{definition:PageDefinition;children:ReactNode}) {
  const variables=useMemo(()=>createVariables(definition.variables,typeof window==='undefined'?'':window.location.hash,definition.name),[definition]);
  const [backdrops,setBackdrops]=useState<Record<string,{color:string;zIndex:number;hide:boolean;transition?:Action['transition']}>>({});
  const [overrides,setOverrides]=useState<Record<string,Override>>(()=>disabledOverrides(definition.widgets));
  const [activeView,setActiveView]=useState(()=>definition.adaptive?chooseAdaptiveView(definition.adaptive,typeof window==='undefined'?0:innerWidth,typeof window==='undefined'?0:innerHeight):'');
  const forcedView=useRef<string|undefined>(undefined),viewRef=useRef(activeView);viewRef.current=activeView;
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
  const paint=(id:string)=>currentWidgets().find(w=>w.id===id)?.adaptive?.[viewRef.current];
  const switchAdaptive=(value?:string):void=>{const a=definition.adaptive;if(!a)return;forcedView.current=value&&value!=='auto'&&a.views.some(v=>v.id===value)?value:undefined;const next=forcedView.current??chooseAdaptiveView(a,innerWidth,innerHeight);if(next===viewRef.current)return;viewRef.current=next;setActiveView(next);updateOverrides(p=>Object.fromEntries(Object.entries(p).map(([id,o])=>[id,paint(id)?{...o,geometry:undefined,autoSize:undefined}:o])));for(const b of definition.behaviors)if(b.event==='adaptivechange')void run(b.actions);};
  useEffect(()=>{const resize=()=>switchAdaptive(forcedView.current);window.addEventListener('resize',resize);return ()=>window.removeEventListener('resize',resize);},[definition]);
  const controller=useRef<AbortController|null>(null);
  const applyActions=async(actions:Action[],signal=controller.current?.signal):Promise<void>=>{
    for(const action of actions){
      if(signal?.aborted)return;
      if(action.kind==='adaptive-view'){switchAdaptive(String(action.value));continue;}
      if(action.kind==='wait'){
        await new Promise<void>(resolve=>{
          const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
          const timer=setTimeout(finish,Number(action.value)||0);signal?.addEventListener('abort',finish,{once:true});
        });continue;
      }
      if(action.kind==='set-image'&&action.target&&typeof action.value==='string'&&isImageUrl(action.value)){const id=action.target,value=action.value;updateOverrides(p=>({...p,[id]:{...p[id],images:{...p[id]?.images,[action.imageState??'normal']:value}}}));continue;}
      if(action.kind==='tree-toggle'&&action.target){
        const nodes=currentWidgets(),node=nodes.find(w=>w.id===action.target),tree=node?.tree;if(!tree)continue;
        const id=action.target,expanded=!(latest.current[id]?.expanded??tree.expanded);
        updateOverrides(p=>{const next={...p,[id]:{...p[id],expanded}},states=Object.fromEntries(Object.entries(next).flatMap(([id,o])=>o.expanded===undefined?[]:[[id,o.expanded]]));
          for(const placement of treePlacements(nodes,states)){const base=nodes.find(n=>n.id===placement.id)?.geometry;if(base)next[placement.id]={...next[placement.id],visible:placement.visible,geometry:{...base,y:placement.y,height:placement.height}};}return next;});
        if(tree.toggleId)selection.select(tree.toggleId,expanded,0);if(tree.labelId)selection.select(tree.labelId,true,0);continue;
      }
      if(action.kind==='focus'&&action.target){const el=document.getElementById(action.target),control=el?.querySelector<HTMLElement>('input,textarea,select,button,[tabindex]')??el;control?.focus();if(action.value&&control&&'select'in control)(control as HTMLInputElement).select();continue;}
      if(action.kind==='link'){if(typeof action.value==='string')navigate(action,action.includeVariables?variables.link(action.value):action.value);continue;}
      if(action.kind==='back'){window.history.back();continue;}
      if(action.kind==='refresh'){reloadWithVariables(variables,action.includeVariables!==false);continue;}
      if(['move','resize','rotate'].includes(action.kind)&&action.target){
        const target=currentWidgets().find(w=>w.id===action.target),before=latest.current[action.target]?.geometry??readGeometry(action.target,target?.kind==='group'?target.geometry:undefined);
        if(before){const geometry=movedGeometry(before,action,motionOffset(action.target,before));animateGeometry(action.target,before,geometry,action,target?.kind==='group');updateOverrides(previous=>({...previous,[action.target!]:{...previous[action.target!],geometry}}));}
        continue;
      }
      if(['show','hide','toggle'].includes(action.kind)&&action.target){
        const id=action.target,element=document.getElementById(id),target=currentWidgets().find(w=>w.id===id);if(!element||!target)continue;
        const show=action.kind==='show'||action.kind==='toggle'&&!(latest.current[id]?.visible??target.visible),t=action.transition;
        if(action.compression&&show!==(latest.current[id]?.visible??target.visible))await applyActions(compressionActions(id,currentWidgets(),key=>latest.current[key]?.geometry??readGeometry(key,currentWidgets().find(w=>w.id===key)?.kind==='group'?currentWidgets().find(w=>w.id===key)?.geometry:undefined),action.compression,show),signal);
        const wasVisible=latest.current[id]?.visible??target.visible;closeFlyout(id);setBackdrops(p=>Object.fromEntries(Object.entries(p).filter(([key])=>key!==id)));
        if(show&&action.popup){const z=frontIndex();updateOverrides(p=>({...p,[id]:{...p[id],zIndex:z+1}}));if(action.popup.mode==='flyout')openFlyout(id,action.popup.source,()=>void run([{kind:'hide',target:id,transition:t}]));else setBackdrops(p=>({...p,[id]:{color:action.popup!.background??'rgba(0,0,0,.5)',zIndex:z,hide:!wasVisible,transition:t}}));}
        if(show)updateOverrides(p=>({...p,[id]:{...p[id],visible:true,zIndex:t?.bringToFront&&!action.popup?frontIndex():p[id]?.zIndex}}));
        animateTransition(element,show,show?t?.show??0:t?.hide??0,show?t?.showDuration??0:t?.hideDuration??0,()=>{if(!show)updateOverrides(p=>({...p,[id]:{...p[id],visible:false}}));if(show!==wasVisible)for(const b of target.behaviors)if(b.event===(show?'show':'hide'))void run(b.actions,signal);});continue;
      }
      if(action.kind==='enable'&&action.target){
        const widgets=currentWidgets();
        for(const [id,disabled]of Object.entries(enabledChanges(widgets,action.target,!!action.value))){
          updateOverrides(previous=>({...previous,[id]:{...previous[id],disabled}}));
          if(!disabled&&widgets.find(w=>w.id===id)?.hasDisabledAppearance)selection.style(id,latest.current[id]?.selectedPaint??latest.current[id]?.selected??false);
        }
        continue;
      }
      const previousPanelState=action.target?latest.current[action.target]?.state:undefined;
      updateOverrides(previous=>{
        if((action.kind==='repeater-data'||action.kind==='repeater-sort'||action.kind==='repeater-page')&&action.target){
          const data=definition.repeaters[action.target];if(!data)return previous;
          const reset=Object.fromEntries(Object.entries(previous).filter(([id])=>!id.startsWith(action.target+'-row')));
          const repeater=updateRepeaterState(data,previous[action.target]?.repeater,action);
          if(action.repeaterAction?.operation==='mark')return {...previous,[action.target]:{...previous[action.target],repeater}};
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
          next.state=nextPanelState(target.states,next.state,action.value,action.loop??true);next.transition=action.transition;
          const size=next.state&&target.stateSizes?.[next.state];if(size)next.autoSize={width:target.percentWidth?undefined:size.width,height:size.height};
        }
        return {...previous,[target.id]:next};
      });
      if(action.kind==='state'&&action.target){const target=currentWidgets().find(w=>w.id===action.target),next=latest.current[action.target]?.state;if(next&&next!==(previousPanelState??target?.states[0]))schedulePanelEvent(action.target,action.transition,()=>{for(const b of target?.behaviors??[])if(b.event==='statechange')void run(b.actions,signal);});}
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
  const run=(actions:Action[],signal=controller.current?.signal,depth=0,values:EventValues={}):Promise<void>=>executeActions(actions,{
    resolveTargets:id=>id==='$page'||document.getElementById(id)?[id]:currentWidgets().filter(w=>w.instance?.templateId===id).map(w=>w.id),readEvent:key=>values[key],readVariable:variables.read,writeVariable:variables.write,
    readWidget:(id,property)=>{
      if(!document.getElementById(id))id=currentWidgets().find(w=>w.instance?.templateId===id)?.id??id;
      const r=definition.repeaters[id],o=latest.current[id];
      if(property==='state'){const target=currentWidgets().find(w=>w.id===id);return target?.stateNames?.[o?.state??target?.states[0]];}
      if(r){const value=readRepeaterProperty(r,o?.repeater,property);if(value!==undefined)return value;}
      if(['text','selected','visible','disabled'].includes(property))return o?.[property as 'text'|'selected'|'visible'|'disabled']??readWidgetValue(id,property);
      return o?.geometry?.[property as keyof Geometry]??readWidgetValue(id,property);
    },
    writeText:(id,text)=>updateOverrides(previous=>({...previous,[id]:{...previous[id],text}})),
    writeSelected:(id,selected)=>updateOverrides(previous=>({...previous,[id]:{...previous[id],selected,selectedPaint:previous[id]?.disabled?(previous[id]?.selectedPaint??previous[id]?.selected??false):selected}})),
    behaviors:id=>id==='$page'?definition.behaviors:currentWidgets().find(w=>w.id===id)?.behaviors??[],
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
  useEffect(()=>{const cleanup:(()=>void)[]=[];for(const b of definition.behaviors){if(['load','adaptivechange',...syntheticEvents].includes(b.event))continue;const target=['resize','scroll'].includes(b.event)?window:document;const handler=(e:Event)=>void run(b.actions,undefined,0,eventValues(e));target.addEventListener(b.event,handler);cleanup.push(()=>target.removeEventListener(b.event,handler));}if(definition.behaviors.some(b=>(syntheticEvents as readonly string[]).includes(b.event)))cleanup.push(bindSyntheticEvents(document.body,definition.behaviors.map(b=>b.event),(name,values)=>{for(const b of definition.behaviors)if(b.event===name)void run(b.actions,undefined,0,values);},()=>false));return ()=>cleanup.forEach(f=>f());},[definition]);
  useLayoutEffect(()=>{
    const active=new AbortController();controller.current=active;
    for(const list of [definition.behaviors,...definition.widgets.filter(w=>!w.rowInstance).map(w=>w.behaviors)])for(const b of list)if(b.event==='load')void run(b.actions,active.signal);
    return ()=>{active.abort();for(const w of currentWidgets())closeFlyout(w.id);};
  },[definition]);
  return <Context.Provider value={{overrides,run:(actions,values)=>run(actions,undefined,0,values),input,paint,image:(id,fallback)=>{const adaptive=paint(id),base=adaptive?{normal:adaptive.content.find(c=>c.kind==='image')?.asset,...Object.fromEntries(Object.entries(adaptive.variants??{}).flatMap(([k,v])=>{const image=v.content?.find(c=>c.kind==='image');return image?[[k,image.asset]]:[];}))}:currentWidgets().find(w=>w.id===id)?.imageAssets;return currentImage(base,latest.current[id]?.images,latest.current[id]??{},fallback);},pointer:(id,key,value)=>updateOverrides(p=>({...p,[id]:{...p[id],[key]:value,...(key==='hovered'&&!value?{pressed:false}:{})}}))}}><main className="rp-page" style={{...reactStyle(pageStyle(definition.adaptive?.layouts[activeView]??definition)),background:definition.adaptive?.layouts[activeView]?.background??definition.background}}>{children}{Object.entries(backdrops).map(([id,b])=>{const parent=document.getElementById(id)?.parentElement;return parent?createPortal(<div className="rp-backdrop" style={reactStyle(backdropStyle(b.color,b.zIndex))} onClick={()=>{setBackdrops(p=>Object.fromEntries(Object.entries(p).filter(([key])=>key!==id)));if(b.hide)void run([{kind:'hide',target:id,transition:b.transition}]);}}/>,parent,id):null;})}</main></Context.Provider>;
}
const eventProps:Record<string,string>={click:'onClick',dblclick:'onDoubleClick',mouseenter:'onMouseEnter',mousemove:'onMouseMove',mouseleave:'onMouseLeave',mousedown:'onMouseDown',mouseup:'onMouseUp',keydown:'onKeyDown',keyup:'onKeyUp',contextmenu:'onContextMenu',selectionchange:'onChange',change:'onChange',focus:'onFocus',blur:'onBlur'};
export function RpWidget({id,type,name,style,disabledStyle,selectedStyle,behaviors,children,tree}:{id:string;type:string;name:string;style:CSSProperties;disabledStyle?:CSSProperties;selectedStyle?:CSSProperties;behaviors:Behavior[];children?:ReactNode;tree?:Widget['tree']}) {
  const runtime=useRuntime();const override=runtime.overrides[id],adaptive=runtime.paint(id);
  if(adaptive){style=reactStyle(adaptive.css);disabledStyle=adaptive.variants?.disabled?reactStyle(adaptive.variants.disabled.css):undefined;selectedStyle=adaptive.variants?.selected?reactStyle(adaptive.variants.selected.css):undefined;}
  const elementRef=useRef<HTMLDivElement>(null),live=useRef({runtime,override,behaviors});live.current={runtime,override,behaviors};
  useEffect(()=>{const el=elementRef.current;if(!el||!behaviors.some(b=>(syntheticEvents as readonly string[]).includes(b.event)))return;return bindSyntheticEvents(el,behaviors.map(b=>b.event),(name,values)=>{for(const b of live.current.behaviors)if(b.event===name)void live.current.runtime.run(b.actions,values);},()=>!!live.current.override?.disabled);},[id]);
  const events:Record<string,(event:{stopPropagation:()=>void;target:EventTarget})=>void>={};
  for(const [eventName,prop]of Object.entries(eventProps)){
    const list=behaviors.filter(b=>b.event===eventName);if(!list.length)continue;
    events[prop]=event=>{if(override?.disabled)return;if(eventName==='click'){const target=event.target as Element;if(target.closest('label.rp-selection')&&target.tagName!=='INPUT')return;event.stopPropagation();}for(const b of list)void runtime.run(b.actions,eventValues(event));};
  }
  if(type==='ImageBox')for(const [name,key,value]of [['onMouseEnter','hovered',true],['onMouseLeave','hovered',false],['onMouseDown','pressed',true],['onMouseUp','pressed',false]] as const){const prior=events[name];events[name]=event=>{runtime.pointer(id,key,value);prior?.(event);};}
  const variant=appearanceVariant({disabled:disabledStyle,selected:selectedStyle},override??{});
  const paint=variant==='disabled'?disabledStyle:variant==='selected'?selectedStyle:undefined;
  const computedStyle=paint?{...paint,position:style.position,left:style.left,top:style.top,width:style.width,height:style.height,display:style.display}:{...style};
  if(override?.zIndex!==undefined)computedStyle.zIndex=override.zIndex;
  if(override?.geometry)Object.assign(computedStyle,reactStyle(geometryCss(override.geometry,type==='Layer')));
  if(override?.autoSize){computedStyle.height=override.autoSize.height;if(Number.isFinite(override.autoSize.width))computedStyle.width=override.autoSize.width;}
  if(override?.visible!==undefined)computedStyle.display=override.visible?(style.display==='none'?undefined:style.display):'none';
  return <div ref={elementRef} className="rp-widget" id={id} data-kind={type} data-name={name} role={tree?tree.root?'tree':'treeitem':type==='Table'?'table':type==='TableCell'?'cell':undefined} aria-expanded={tree?.nodes.length&&!tree.root?override?.expanded??tree.expanded:undefined} aria-label={type==='Table'?name||'Table':undefined} aria-disabled={override?.disabled} aria-selected={override?.selected} data-click={events.onClick?'':undefined} style={computedStyle} {...events}>{children}</div>;
}
export function RpState({ownerId,id,name,initial,children,style}:{ownerId:string;id:string;name?:string;initial:boolean;children?:ReactNode;style?:CSSProperties}) {
  const {overrides}=useRuntime(),selected=overrides[ownerId]?.state,show=selected===undefined?initial:selected===id;
  const ref=useRef<HTMLDivElement>(null),previous=useRef(show),[visible,setVisible]=useState(show);
  useLayoutEffect(()=>{
    if(previous.current===show)return;previous.current=show;
    const element=ref.current;if(!element)return;const t=overrides[ownerId]?.transition;
    if(show)setVisible(true);
    animateTransition(element,show,show?t?.show??0:t?.hide??0,show?t?.showDuration??0:t?.hideDuration??0,()=>{if(!show)setVisible(false);});
  },[show]);
  return <div ref={ref} className="rp-state" style={style} data-state={id} data-state-name={name} hidden={!visible}>{children}</div>;
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
    if(target instanceof HTMLSelectElement&&target.multiple)return;
    if(!selected)runtime.input(ownerId,'text',target.value);
  };
  if(as==='textarea')return <textarea {...props as ComponentProps<'textarea'>} ref={el=>{ref.current=el;}} disabled={actualDisabled} onChange={onChange}/>;
  if(as==='select')return <select {...props as ComponentProps<'select'>} ref={el=>{ref.current=el;}} disabled={actualDisabled} onChange={onChange}/>;
  if(as==='button')return <button {...props as ComponentProps<'button'>} ref={el=>{ref.current=el;}} disabled={actualDisabled}/>;
  return <input {...props} ref={el=>{ref.current=el;}} disabled={actualDisabled} onChange={onChange} onClick={event=>{if(['checkbox','radio'].includes(event.currentTarget.type))runtime.input(ownerId,'selected',event.currentTarget.checked);}}/>;
}

/** Concrete generated text remains editable JSX; overrides preserve its first run style. */
export function RpImage({ownerId,as='img',src,href,...props}:{ownerId:string;as?:'img'|'image';src?:string;href?:string;[key:string]:unknown}) {
 const runtime=useRuntime(),asset=runtime.image(ownerId,src??href);
 return as==='img'?createElement('img',{...props,src:asset||undefined,hidden:!asset}):createElement('image',{...props,href:asset||undefined});
}
export function RpImageFrame({ownerId,asset,children,...props}:{ownerId:string;asset?:string|null;children?:ReactNode;[key:string]:unknown}){
 const runtime=useRuntime();return createElement('svg',{...props,hidden:!runtime.image(ownerId,asset)},children);
}
export function RpLink({ownerId,behaviors,children,...props}:HTMLAttributes<HTMLSpanElement>&{ownerId:string;behaviors:Behavior[]}) {
 const runtime=useRuntime(),events:Record<string,(event:{stopPropagation:()=>void;key?:string})=>void>={};
 for(const [name,prop]of Object.entries(eventProps))if(behaviors.some(b=>b.event===name))events[prop]=event=>{event.stopPropagation();if(runtime.overrides[ownerId]?.disabled)return;for(const b of behaviors)if(b.event===name)void runtime.run(b.actions,eventValues(event));};
 return <span {...props} {...events} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();events.onClick?.(event);}else events.onKeyDown?.(event);}}>{children}</span>;
}
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
  if(node.tag==='option')delete props.selected;
  if(node.tag==='select'&&node.attrs.multiple)props.defaultValue=node.children.flatMap(c=>typeof c!=='string'&&c.attrs.selected?[String(c.attrs.value??'')]:[]);
  if(node.tag==='option'&&node.attrs.value!==undefined){props.value=node.attrs.value;delete props.defaultValue;}
  if(node.css)props.style=reactStyle(node.css);
  const control=['input','textarea','select','button'].includes(node.tag);
  let children=node.children.map((c,i)=>renderContent(c,ownerId,i));
  if(node.tag==='textarea'){props.defaultValue=node.children.filter(c=>typeof c==='string').join('');children=[];}
  if(node.attrs.class==='rp-text'){props.ownerId=ownerId;return createElement(RpText,{...props,ownerId} as HTMLAttributes<HTMLDivElement>&{ownerId:string},...children);}
  if(node.tag==='image'||node.tag==='img'&&node.attrs.class==='rp-image')return createElement(RpImage,{...props,ownerId,as:node.tag as 'img'|'image'});
  if(node.attrs.class==='rp-framed-image'){const image=node.children.find((c):c is ElementNode=>typeof c!=='string'&&c.tag==='image');return createElement(RpImageFrame,{...props,ownerId,asset:typeof image?.attrs.href==='string'?image.attrs.href:undefined},...children);}
  if(node.attrs.class==='rp-inline-link'){delete props['data-rp-link'];return createElement(RpLink,{...props,ownerId,behaviors:JSON.parse(String(node.attrs['data-rp-link']??'[]'))} as ComponentProps<typeof RpLink>,...children);}
  if(control){props.ownerId=ownerId;props.as=node.tag;return createElement(RpControl,props as ControlProps,...children);}
  return createElement(node.tag,props,...children);
}
export function RpContent({content,variants,ownerId}:{content:WidgetContent[];variants?:Widget['variants'];ownerId:string}) {
  const {overrides,paint}=useRuntime(),adaptive=paint(ownerId);if(adaptive){content=adaptive.content;variants=adaptive.variants;}const variant=appearanceVariant(variants,overrides[ownerId]??{});
  const current=(variant==='normal'?undefined:variants?.[variant]?.content)??content;
  const result=current.flatMap(contentElements).map((node,i)=>renderContent(node,ownerId,i));
  return Object.values(variants??{}).some(v=>v.content)?<div className="rp-content" style={{display:'contents'}}>{result}</div>:<>{result}</>;
}
export function RpRepeater({ownerId,data,children}:{ownerId:string;data:RepeaterData;children:(row:MaterializedRow)=>ReactNode}) {
  const runtime=useRuntime(),state=runtime.overrides[ownerId]?.repeater;
  const rows=useMemo(()=>materializeRepeater(ownerId,data,state),[ownerId,data,state?.revision]);
  useEffect(()=>{for(const w of flattenWidgets(rows.flatMap(row=>row.widgets)))for(const b of w.behaviors)if(b.event==='load'||b.event==='itemload')void runtime.run(b.actions);},[rows]);
  return <>{rows.map(row=><Fragment key={`${state?.revision??0}:${row.key}`}>{children(row)}</Fragment>)}</>;
}
