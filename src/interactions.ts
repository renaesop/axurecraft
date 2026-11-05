import {backdropColor} from './popups.ts';
import {readRepeaterAction} from './native-repeater-actions.ts';
import {datasetColumns,nativeColumnId,type NativeContext} from './native-reference.ts';
import { nativeExpressions } from './native-expression.ts';
import {readLinkTarget} from './native-link.ts';
import { bool, field, items, number, object, prop, str, type Graph, type Value } from './graph.ts';
import type { Action, Behavior, ConversionIssue, ConditionalBranch, GlobalVariable } from './model.ts';

// RP9 event numbers and action fields are taken from the serialized object graph.
const events: Record<number, string> = { 16: 'click', 17: 'dblclick', 18: 'mouseenter', 19:'mousemove', 20: 'mouseleave',21:'mousedown',22:'mouseup',32:'keydown',33:'keyup',51:'selectionchange',323:'contextmenu',256:'swipeleft',257:'swiperight',258:'swipeup',259:'swipedown',272:'dragstart',273:'drag',274:'dragdrop',321:'resize',322:'scroll',324:'scrolldown',325:'scrollup',337:'longclick',338:'adaptivechange',276:'show',277:'hide',275:'move',278:'statechange',279:'rotate', 48: 'focus', 49: 'blur', 50: 'textchange', 52: 'selectedchange', 53: 'select', 54: 'unselect', 288: 'load', 320: 'load', 289: 'itemload' };
const zeroGuid = '00000000000000000000000000000000';

export function readBehaviors(g: Graph, owner: Value, pageByGuid: Map<string, string>, issues: ConversionIssue[], rowBindings=false, variables: GlobalVariable[] = [], asset?:((v:Value|undefined)=>string|undefined),context:NativeContext={}): Behavior[] {
  const map = prop(g, owner, 'InteractionMap') ?? prop(g, owner, 'interactionmap');
  if (!map) return [];
  const report = (feature: string, detail: string): void => {
    issues.push({ widget: owner.id === undefined ? undefined : `w-${g.guids[owner.id - 1]}`, feature, detail });
  };
  const expressions = nativeExpressions(g, owner, variables,undefined,context);
  const nodeTable = field(map.body, 'node-table');
  const target = (node: Value): Value | undefined => object(g, nodeTable?.entries?.find(([key]) => number(key, -1) === node.id)?.[1]);
  const children = (node: Value | undefined): Value[] => items(field(node?.body, 'children')).map(v => object(g, v)).filter((v): v is Value => !!v);
  const literal = (node: Value | undefined): string | undefined => {
    if (node?.tag === 8) return node.text;
    const value = object(g, node);
    if (!value || items(field(value.body, 'scope')).length || field(value.body, 'scope')?.entries?.length) return undefined;
    return field(value.body, 'value')?.tag === 8 ? str(field(value.body, 'value')) : undefined;
  };
  const decode = (action: Value,skipNormalImage=false): Action[] => {
    if (bool(field(action.body, 'Disabled'))) return [];
    const name = action.className ?? 'unknown action';
    const fail = (detail: string): Action[] => { report('interaction-action', `${name}: ${detail}`); return []; };
    try{const repeated=readRepeaterAction(g,owner,action,variables,asset,context);if(repeated)return repeated;}catch(error){return fail(String(error));}
    if(name==='Axure:InteractionSetImageAction'){
      try{
        const paths=items(field(action.body,'ImagePaths')),infos=items(field(action.body,'ImageStatesInfos'));if(paths.length!==infos.length)throw new Error('Image parameters differ');
        return paths.flatMap((path,i)=>{const target=expressions.target(object(g,path)),info=object(g,infos[i]);const result:Action[]=[];
          for(const [native,imageState]of [['Normal','normal'],['Selected','selected'],['Disabled','disabled'],['MouseOver','hover'],['MouseDown','pressed']] as const){
            if(skipNormalImage&&imageState==='normal')continue;
            const state=prop(g,info,native);if(!state)continue;
            if(bool(field(state.body,'is-static-image'))){const image=field(state.body,'static-image');if(!str(field(image,'Hash'))&&!field(image,'Stream'))continue;const value=asset?.(image);if(!value)throw new Error('Set image resource is missing');result.push({kind:'set-image',target,value,imageState});}
            else result.push({kind:'set-image',target,imageState,expression:expressions.compile(prop(g,state,'image-literal'),target)});
          }return result;
        });
      }catch(error){return fail(String(error));}
    }
    if(name==='Axure:InteractionSetFocusOnWidgetAction'){
      try{return items(field(action.body,'panelobjectpaths')).map(path=>({kind:'focus',target:expressions.target(object(g,path)),value:bool(field(action.body,'SelectTextOnFocus'))}));}catch(error){return fail(String(error));}
    }
    if(name==='Axure:InteractionRaiseEventAction'){
      try{
        const paths=items(field(action.body,'Paths')),infos=items(field(action.body,'Infos'));
        if(paths.length!==infos.length)throw new Error('Fire event parameters differ');
        return infos.flatMap((ref,i)=>{const info=object(g,ref),target=bool(field(info?.body,'IsPage'))?'$page':expressions.target(object(g,paths[i]));
          if(items(field(info?.body,'RaisedEventIds')).length)throw new Error('Custom master event identity is unresolved');
          return items(field(info?.body,'FireEventTypes')).map(value=>{const event=events[number(value)];if(!event)throw new Error('Unknown fired event '+number(value));return {kind:'fire-event' as const,target,value:event};});
        });
      }catch(error){return fail(String(error));}
    }
    if (name === 'Axure:InteractionLinkWindowAction') {
      try{
        const result=readLinkTarget(g,owner,prop(g,action,'target'),pageByGuid,variables);
        const navigation=({1:'current',2:'new',3:'popup',4:'parent'} as const)[number(field(action.body,'link-type'),1) as 1|2|3|4];
        if(!navigation)return fail('Unknown window navigation mode');
        result.navigation=navigation;
        if(navigation==='popup'){
          const popup=prop(g,action,'popup'),features:string[]=['popup'];
          for(const [native,html]of [['PopupLeft','left'],['PopupTop','top'],['PopupWidth','width'],['PopupHeight','height']] as const){
            const value=field(popup?.body,native);let n=number(value,NaN);
            if(!Number.isFinite(n)){const raw=literal(value);if(raw!==undefined)n=Number(raw);}
            if(Number.isFinite(n))features.push(`${html}=${n}`);
          }
          for(const [native,html]of [['PopupShowStatus','status'],['PopupShowToolbar','toolbar'],['PopupShowLocation','location'],['PopupShowMenubar','menubar'],['PopupIsResizable','resizable'],['PopupShowScrollbars','scrollbars']] as const)if(field(popup?.body,native))features.push(`${html}=${bool(field(popup?.body,native))?'yes':'no'}`);
          result.windowFeatures=features.join(',');
        }
        return [result];
      }catch(error){return fail(String(error));}
    }
    if(name==='Axure:InteractionLinkFrameAction'){
      try{
        return (field(action.body,'framepathstotargets')?.entries??[]).map(([path,target])=>({...readLinkTarget(g,owner,object(g,target),pageByGuid,variables),target:expressions.target(object(g,path)),navigation:number(field(action.body,'link-type'))===6?'parent-frame' as const:'frame' as const}));
      }catch(error){return fail(String(error));}
    }
    if (name === 'Axure:InteractionWaitAction') {
      const duration = number(field(action.body, 'wait_time'), -1);
      return duration >= 0 ? [{ kind: 'wait', value: duration }] : fail('invalid wait duration');
    }
    if (name === 'Axure:InterationActionSetFunction') {
      try { return expressions.actions(prop(g, action, 'action')); }
      catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    }
    if(['Axure:InteractionMoveWidgetAction','Axure:InteractionRotateWidgetAction','Axure:InteractionSetWidgetSizeAction'].includes(name)){
      const kind=name.includes('Rotate')?'rotate':name.includes('Size')?'resize':'move';
      const paths=items(field(action.body,kind==='rotate'?'Paths':'WidgetPaths'));
      const infos=items(field(action.body,kind==='rotate'?'Infos':kind==='resize'?'SetSizeInfos':'MoveInfos'));
      if(paths.length!==infos.length)return fail('Motion target and parameter counts differ');
      try{return paths.map((path,index)=>{
        const target=expressions.target(object(g,path)),info=object(g,infos[index]);
        const mode=number(field(info?.body,kind==='rotate'?'RotateType':'MoveType'));
        if(kind==='move'&&![0,1,2,3,4].includes(mode))throw new Error(`Move mode ${mode} needs drag context`);
        const motion:NonNullable<Action['motion']>={relative:mode===1,duration:number(field(info?.body,kind==='resize'?'duration':'Duration')),easing:number(field(info?.body,kind==='resize'?'easing':'Easing')),anchor:str(field(info?.body,kind==='resize'?'anchor':'Anchor'))||undefined};
        if(kind==='rotate')motion.clockwise=bool(field(info?.body,'Clockwise'),true);
        const fields=kind==='move'?{x:'XValue',y:'YValue'}:kind==='resize'?{width:'width',height:'height'}:{angle:'Degree',offsetX:'OffsetX',offsetY:'OffsetY'};
        for(const [key,fieldName]of Object.entries(fields))if(field(info?.body,fieldName))motion[key as 'x'|'y'|'width'|'height'|'angle'|'offsetX'|'offsetY']=expressions.compile(prop(g,info,fieldName),target);
        if(kind==='move'&&[2,3,4].includes(mode)){motion.relative=true;motion.x=mode===4?{kind:'literal',value:0}:{kind:'event',property:'dragx'};motion.y=mode===3?{kind:'literal',value:0}:{kind:'event',property:'dragy'};}
        const boundary=prop(g,info,'BoundaryCondition');
        const bounds=(node:Value|undefined):void=>{if(!node)return;const op=number(field(node.body,'operation'));if(op===1){bounds(prop(g,node,'left-expr'));bounds(prop(g,node,'right-expr'));return;}const left=prop(g,node,'left-expr'),direction=str(field(left?.body,'boundaryDirection'));if(!['left','right','top','bottom'].includes(direction)||!([7,8].includes(op)))throw new Error('Unsupported motion boundary comparison');motion.bounds={...motion.bounds,[direction]:expressions.compile(prop(g,node,'right-expr'),target)};};
        if(boundary)bounds(boundary);
        return {kind,target,motion};
      });}catch(error){return fail(String(error));}
    }
    if(name==='Axure:InteractionSetAdaptiveView')return [{kind:'adaptive-view',value:bool(field(action.body,'set_adaptive_view_to_auto'))?'auto':g.guids[number(field(action.body,'set_adaptive_view_id'))-1]}];
    const spec = name === 'Axure:InteractionFadeWidgetAction' ? ['WidgetPaths', 'FadeInfos']
      : name === 'Axure:InteractionSetPanelStateAction' ? ['PanelPaths', 'SetStateInfos']
        : name === 'Axure:InteractionEnableDisableWidgetsAction' ? ['WidgetPaths', 'EnableDisableInfos']
          : name === 'Axure:InteractionAddSortToRepeaterAction' ? ['RepeaterPaths','AddSortInfos']
            : name === 'Axure:InteractionSetRepeaterToPageAction' ? ['RepeaterPaths','SetPageInfos'] : undefined;
    if (!spec) return fail('action is not implemented');
    const paths = items(field(action.body, spec[0])).length ? items(field(action.body, spec[0])) : items(field(action.body, 'panelobjectpaths'));
    const infos = items(field(action.body, spec[1]));
    if (!paths.length || paths.length !== infos.length) return fail('target and parameter list lengths do not match');
    const out: Action[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = object(g, paths[i]);
      let targetId: string;
      try { targetId = expressions.target(path); }
      catch (error) { fail(error instanceof Error ? error.message : String(error)); continue; }
      const info = object(g, infos[i]);
      if (!info) { fail('parameters could not be resolved'); continue; }
      if(spec[1]==='AddSortInfos'){
        const sortType=number(field(info.body,'sort-type'),-1);let columnId=number(field(info.body,'column-id'),-1);
        const reference=context.references?.get(targetId.slice(2)),data=reference&&prop(reference.graph,reference.widget,'Data');
        if(reference&&data){try{columnId=nativeColumnId(g,columnId,datasetColumns(reference.graph,data));}catch(error){fail(String(error));continue;}}
        if(![1,2,3].includes(sortType)||columnId<0){fail('unsupported sort type or unresolved column');continue;}
        out.push({kind:'repeater-sort',target:targetId,sort:{columnId,ascending:bool(field(info.body,'ascending')),toggle:bool(field(info.body,'toggle')),label:str(field(info.body,'label')),type:sortType===1?'number':sortType===3?'text-case':'text'}});
      }else if(spec[1]==='SetPageInfos'){
        const mode=number(field(info.body,'set-page-type'),-1);
        let value:string|number|undefined;
        if(mode===1)value='previous';else if(mode===2)value='next';else if(mode===3)value='last';
        else if(mode===0){const raw=literal(field(info.body,'page-value'));if(raw!==undefined&&/^\s*\d+\s*$/.test(raw))value=Number(raw);}
        if(value===undefined&&mode===0){try{out.push({kind:'repeater-page',target:targetId,expression:expressions.compile(prop(g,info,'page-value'),targetId)});}catch(error){fail(String(error));}continue;}
        if(value===undefined){fail('unknown repeater page mode');continue;}
        out.push({kind:'repeater-page',target:targetId,value});
      }else if (spec[1] === 'FadeInfos') {
        const kind = number(field(info.body, 'fade-action-type'), -1);
        if (![0, 1, 2].includes(kind) || ![0,1,2,3,4].includes(number(field(info.body, 'show-type')))) { fail('unsupported visibility mode'); continue; }
        out.push({ kind: kind === 0 ? 'hide' : kind === 1 ? 'show' : 'toggle', target: targetId,...([2,3].includes(number(field(info.body,'show-type')))?{popup:{mode:number(field(info.body,'show-type'))===2?'lightbox' as const:'flyout' as const,source:`w-${g.guids[owner.id!-1]}`,background:backdropColor(number(field(info.body,'page-background')))}}:{}),...(number(field(info.body,'show-type'))===4?{compression:{vertical:bool(field(info.body,'vertical')),easing:number(field(info.body,'compress-easing')),duration:number(field(info.body,'compress-duration'))}}:{}),transition:{show:number(field(info.body,'easing')),hide:number(field(info.body,'EasingHide')),showDuration:number(field(info.body,'duration')),hideDuration:number(field(info.body,'DurationHide')),bringToFront:bool(field(info.body,'BringToFront'))||number(field(info.body,'show-type'))===1} });
      } else if (spec[1] === 'EnableDisableInfos') {
        const enabled = field(info.body, 'enable');
        if (enabled?.tag !== 25) { fail('expected RP9 boolean enable value'); continue; }
        out.push({ kind: 'enable', target: targetId, value: bool(enabled) });
      } else {
        const mode = number(field(info.body, 'set-state-type'), -1);
        if (bool(field(info.body, 'repeat')) || bool(field(info.body, 'compress'))) { fail('repeated/compressed state changes are unsupported'); continue; }
        let value: string | undefined;
        if (mode === 0) value = g.guids[number(field(info.body, 'diagram-id'), -1) - 1];
        else if (mode === 1 || mode === 2) value = mode === 1 ? 'next' : 'previous';
        else if (mode === 4) continue;
        if (!value || value === zeroGuid) { fail(`unsupported or unresolved panel state mode ${mode}`); continue; }
        if (bool(field(info.body, 'show-when-set'))) out.push({ kind: 'show', target: targetId });
        out.push({ kind: 'state', target: targetId, value,loop:bool(field(info.body,'loop')),transition:{show:number(field(info.body,'enter-easing')),hide:number(field(info.body,'exit-easing')),showDuration:number(field(info.body,'enter-duration')),hideDuration:number(field(info.body,'exit-duration'))} });
      }
    }
    return out;
  };
  const result: Behavior[] = [];
  for (const eventNode of children(prop(g, map, 'tree'))) {
    const event = target(eventNode);
    if (!event || bool(field(event.body, 'Disabled'))) continue;
    const eventType = number(field(event.body, 'event-type'), -1);
    const eventName = events[eventType];
    if (!eventName) { report('interaction-event', `Unsupported event type ${eventType}`); continue; }
    const actions: Action[] = [];
    const groups: Value[][] = [];
    for (const caseNode of children(eventNode)) {
      const kase = target(caseNode);
      if (!kase || bool(field(kase.body, 'Disabled'))) continue;
      if (!groups.length || bool(field(kase.body, 'IsNewIfGroup'))) groups.push([]);
      groups.at(-1)!.push(caseNode);
    }
    for (const group of groups) {
      const conditionalGroup=group.some(node=>{const c=field(target(node)?.body,'Condition');return !!c&&g.guids[number(c,-1)-1]!==zeroGuid;});
      const branches: ConditionalBranch[] = [];
      let invalid = false;
      for (const caseNode of group) {
        const kase = target(caseNode)!;
        const branch: ConditionalBranch = { actions: [] };
        const condition = field(kase.body, 'Condition');
        if (condition && g.guids[number(condition, -1) - 1] !== zeroGuid) {
          try { branch.condition = expressions.compile(object(g, condition)); }
          catch (error) { report('interaction-condition', `${error instanceof Error ? error.message : error}; dependent case group omitted`); invalid = true; }
        }
        for (const actionNode of children(caseNode)) {
          const action = target(actionNode);
          if (!action) { report('interaction-action', 'Action tree reference could not be resolved'); continue; }
          // Static row load bindings are compiled by repeaterRows. Dynamic text
          // assignments remain runtime actions and must not be silently skipped.
          if (rowBindings && !conditionalGroup && [288, 289].includes(eventType)) {
            if (action.className === 'Axure:InteractionSetImageAction'){branch.actions.push(...decode(action,true));continue;}
            if (action.className === 'Axure:InterationActionSetFunction') {
              try {
                const compileLoad=(node:Value|undefined,depth=0):Action[]=>{
                  if(!node||depth>64)throw new Error('Invalid load expression');
                  if(node.className==='Axure:Expr:Block')return items(field(node.body,'subexpressions')).flatMap(ref=>compileLoad(object(g,ref),depth+1));
                  const name=str(field(node.body,'function-name'));
                  if(name==='SetWidgetImage')return []; // The image binding compiler reports unsupported forms.
                  const value=object(g,items(field(node.body,'args'))[1]);
                  const text=str(field(value?.body,'value'));
                  const dynamic=/\[\[|\]\]/.test(text.replace(/\[\[\s*(?:Item|TargetItem)\.[^\[\]\s.()+*/]+\s*\]\]/gi,''));
                  const plain=name!=='SetWidgetRichText'||str(field(object(g,items(field(node.body,'args'))[2])?.body,'value')).toLowerCase()==='true';
                  if(plain&&['SetWidgetRichText','SetWidgetText'].includes(name)&&value?.className==='Axure:Expr:StringLiteral'&&!field(value.body,'scope')?.entries?.length&&!items(field(value.body,'scope')).length&&!dynamic)return [];
                  return expressions.actions(node);
                };
                branch.actions.push(...compileLoad(prop(g,action,'action')));continue;
              } catch { /* Report below; row binder still handles static image bindings. */ }
            }
          }
          branch.actions.push(...decode(action));
        }
        branches.push(branch);
      }
      if (invalid) continue;
      if (branches.length === 1 && !branches[0].condition) actions.push(...branches[0].actions);
      else if (branches.some(b => b.condition)) actions.push({ kind: 'branch', branches });
      else report('interaction-case-menu', 'Multiple unconditional cases require a native case-selection menu');
    }
    if (actions.length) result.push({ event: eventName, actions });
  }
  return result;
}
