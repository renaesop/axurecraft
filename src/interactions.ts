import { nativeExpressions } from './native-expression.ts';
import { bool, field, items, number, object, prop, str, type Graph, type Value } from './graph.ts';
import type { Action, Behavior, ConversionIssue, ConditionalBranch, GlobalVariable } from './model.ts';

// RP9 event numbers and action fields are taken from the serialized object graph.
const events: Record<number, string> = { 16: 'click', 17: 'dblclick', 18: 'mouseenter', 20: 'mouseleave', 48: 'focus', 49: 'blur', 50: 'textchange', 52: 'selectedchange', 53: 'select', 54: 'unselect', 288: 'load', 320: 'load', 289: 'itemload' };
const zeroGuid = '00000000000000000000000000000000';

export function readBehaviors(g: Graph, owner: Value, pageByGuid: Map<string, string>, issues: ConversionIssue[], rowBindings=false, variables: GlobalVariable[] = []): Behavior[] {
  const map = prop(g, owner, 'InteractionMap') ?? prop(g, owner, 'interactionmap');
  if (!map) return [];
  const report = (feature: string, detail: string): void => {
    issues.push({ widget: owner.id === undefined ? undefined : `w-${g.guids[owner.id - 1]}`, feature, detail });
  };
  const expressions = nativeExpressions(g, owner, variables);
  const nodeTable = field(map.body, 'node-table');
  const target = (node: Value): Value | undefined => object(g, nodeTable?.entries?.find(([key]) => number(key, -1) === node.id)?.[1]);
  const children = (node: Value | undefined): Value[] => items(field(node?.body, 'children')).map(v => object(g, v)).filter((v): v is Value => !!v);
  const literal = (node: Value | undefined): string | undefined => {
    if (node?.tag === 8) return node.text;
    const value = object(g, node);
    if (!value || items(field(value.body, 'scope')).length || field(value.body, 'scope')?.entries?.length) return undefined;
    return field(value.body, 'value')?.tag === 8 ? str(field(value.body, 'value')) : undefined;
  };
  const decode = (action: Value): Action[] => {
    if (bool(field(action.body, 'Disabled'))) return [];
    const name = action.className ?? 'unknown action';
    const fail = (detail: string): Action[] => { report('interaction-action', `${name}: ${detail}`); return []; };
    if (name === 'Axure:InteractionLinkWindowAction') {
      const dest = prop(g, action, 'target');
      const kind = number(field(dest?.body, 'target-type'), -1);
      if (kind === 2) return [{ kind: 'refresh', includeVariables: true }];
      if (kind === 3) return [{ kind: 'back' }];
      if (number(field(action.body, 'link-type'), 1) !== 1) return fail('new-window/frame navigation is unsupported');
      if (kind === 1) {
        const index = field(dest?.body, 'target-page-id')?.values?.[1];
        const guid = typeof index === 'number' ? g.guids[index - 1] : undefined;
        const file = guid ? pageByGuid.get(guid) : undefined;
        return file ? [{ kind: 'link', value: file, includeVariables: true }] : fail('target page could not be resolved');
      }
      if (kind === 0) {
        const url = literal(field(dest?.body, 'target-literal'));
        if (!url || !/^(https?:\/\/|mailto:|tel:|#)/i.test(url)) return fail('URL is dynamic or has an unsupported scheme');
        return [{ kind: 'link', value: url }];
      }
      return fail(`unknown navigation kind ${kind}`);
    }
    if (name === 'Axure:InteractionWaitAction') {
      const duration = number(field(action.body, 'wait_time'), -1);
      return duration >= 0 ? [{ kind: 'wait', value: duration }] : fail('invalid wait duration');
    }
    if (name === 'Axure:InterationActionSetFunction') {
      try { return expressions.actions(prop(g, action, 'action')); }
      catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    }
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
        const sortType=number(field(info.body,'sort-type'),-1),columnId=number(field(info.body,'column-id'),-1);
        if(![1,2].includes(sortType)||columnId<0){fail('unsupported sort type or unresolved column');continue;}
        out.push({kind:'repeater-sort',target:targetId,sort:{columnId,ascending:bool(field(info.body,'ascending')),toggle:bool(field(info.body,'toggle')),label:str(field(info.body,'label')),type:sortType===1?'number':'text'}});
      }else if(spec[1]==='SetPageInfos'){
        const mode=number(field(info.body,'set-page-type'),-1);
        let value:string|number|undefined;
        if(mode===1)value='previous';else if(mode===2)value='next';else if(mode===3)value='last';
        else if(mode===0){const raw=literal(field(info.body,'page-value'));if(raw!==undefined&&/^\s*\d+\s*$/.test(raw))value=Number(raw);}
        if(value===undefined){fail('dynamic or unknown repeater page expression');continue;}
        out.push({kind:'repeater-page',target:targetId,value});
      }else if (spec[1] === 'FadeInfos') {
        const kind = number(field(info.body, 'fade-action-type'), -1);
        if (![0, 1, 2].includes(kind) || number(field(info.body, 'show-type')) !== 0) { fail('unsupported visibility mode'); continue; }
        if (number(field(info.body, 'easing')) || number(field(info.body, 'EasingHide')) || bool(field(info.body, 'BringToFront'))) report('interaction-animation', `${name}: visibility is applied without animation or stacking changes`);
        out.push({ kind: kind === 0 ? 'hide' : kind === 1 ? 'show' : 'toggle', target: targetId });
      } else if (spec[1] === 'EnableDisableInfos') {
        const enabled = field(info.body, 'enable');
        if (enabled?.tag !== 25) { fail('expected RP9 boolean enable value'); continue; }
        out.push({ kind: 'enable', target: targetId, value: bool(enabled) });
      } else {
        const mode = number(field(info.body, 'set-state-type'), -1);
        if (bool(field(info.body, 'repeat')) || bool(field(info.body, 'compress'))) { fail('repeated/compressed state changes are unsupported'); continue; }
        let value: string | undefined;
        if (mode === 0) value = g.guids[number(field(info.body, 'diagram-id'), -1) - 1];
        else if ((mode === 1 || mode === 2) && bool(field(info.body, 'loop'))) value = mode === 1 ? 'next' : 'previous';
        else if (mode === 4) continue;
        if (!value || value === zeroGuid) { fail(`unsupported or unresolved panel state mode ${mode}`); continue; }
        if (number(field(info.body, 'enter-easing')) || number(field(info.body, 'exit-easing'))) report('interaction-animation', `${name}: panel state changes without transition animation`);
        if (bool(field(info.body, 'show-when-set'))) out.push({ kind: 'show', target: targetId });
        out.push({ kind: 'state', target: targetId, value });
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
          if (rowBindings && [288, 289].includes(eventType)) {
            if (action.className === 'Axure:InteractionSetImageAction') continue;
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
