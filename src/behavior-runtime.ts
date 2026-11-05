import type { Action, Behavior, Scalar } from './model.ts';
import { axureBoolean, evaluateExpression, snapshotExpression, bindExpression, type ExpressionContext } from './expression.ts';
import {motionAxes} from './motion.ts';

export interface BehaviorHost extends ExpressionContext {
  behaviors(id: string): Behavior[];
  resolveTargets?(id:string):string[];
  isDisabled(id: string): boolean;
  canSelect?(id: string): boolean;
  selectionEventState?(id: string): boolean;
  select?(id: string, value: boolean, depth: number): void;
  writeText(id: string, value: string): void;
  writeSelected(id: string, value: boolean): void;
  writeVariable?(name: string, value: Scalar): void;
  apply(action: Action): void | Promise<void>;
  cancelled?(): boolean;
}

/** Shared sequencing for conditional actions and synthetic change events. */
export async function executeActions(actions: Action[], host: BehaviorHost, depth = 0): Promise<void> {
  if (depth > 128) throw new Error('Interaction recursion exceeds 128');
  const fire = async (id: string, event: string): Promise<void> => {
    if (host.isDisabled(id)) return;
    for (const behavior of host.behaviors(id)) if (behavior.event === event) await executeActions(behavior.actions, host, depth + 1);
  };
  for (const action of actions) {
    if (host.cancelled?.()) return;
    if(action.target&&host.resolveTargets){const targets=host.resolveTargets(action.target);if(targets.length!==1||targets[0]!==action.target){for(const target of targets){const mapped={...action,target};if(mapped.expression)mapped.expression=bindExpression(mapped.expression,id=>id===action.target?target:id,()=>undefined);await executeActions([mapped],host,depth+1);}continue;}}
    if (action.kind === 'branch') {
      const branch = action.branches?.find(b => !b.condition || axureBoolean(evaluateExpression(b.condition, host)));
      if (branch) await executeActions(branch.actions, host, depth + 1);
    } else if (action.kind === 'set-variable' && action.variable && action.expression) {
      const value = evaluateExpression(action.expression, host);
      if (value !== undefined) host.writeVariable?.(action.variable, value);
    } else if ((action.kind === 'set-text' || action.kind === 'set-selected') && action.target && action.expression) {
      const value = evaluateExpression(action.expression, host);
      if (value === undefined) continue;
      if (action.kind === 'set-text') {
        const text = String(value);
        if (host.readWidget(action.target, 'text') === text) continue;
        host.writeText(action.target, text);
        await fire(action.target, 'textchange');
      } else {
        if(host.canSelect&&!host.canSelect(action.target))continue;
        const previous = !!host.readWidget(action.target, 'selected');
        const selected = value === 'toggle' ? !previous : Boolean(value) && value !== 'false';
        if (host.select) { host.select(action.target, selected, depth); continue; }
        if (selected === previous) continue;
        const previousEventState=host.selectionEventState?.(action.target)??previous;
        host.writeSelected(action.target, selected);
        if(selected===previousEventState)continue;
        await fire(action.target, 'selectedchange');
        await fire(action.target, selected ? 'select' : 'unselect');
      }
    } else if(action.kind==='fire-event'&&action.target){
      await fire(action.target,String(action.value));
    } else if(action.repeaterAction){
      const r=structuredClone(action.repeaterAction);
      if(r.condition)r.condition=snapshotExpression(r.condition,host);
      for(const values of [r.values,...r.rows??[]])for(const value of Object.values(values??{}))if(value.kind==='expression')value.expression=snapshotExpression(value.expression,host);
      await host.apply({...action,repeaterAction:r});
    } else if(action.motion){
      const motion=structuredClone(action.motion);let valid=true;
      for(const [key,e]of Object.entries(motion.bounds??{})){const value=evaluateExpression(e,host);if(value===undefined||!Number.isFinite(Number(value))){valid=false;break;}motion.bounds![key as 'left']={kind:'literal',value:Number(value)};}
      for(const key of motionAxes)if(motion[key]){const value=evaluateExpression(motion[key]!,host);if(value===undefined||!Number.isFinite(Number(value))){valid=false;break;}motion[key]={kind:'literal',value:Number(value)};}
      if(valid){await host.apply({...action,motion});if(action.target&&action.kind==='move')await fire(action.target,'move');if(action.target&&action.kind==='rotate'){const id=action.target;if(motion.easing&&motion.duration)setTimeout(()=>void fire(id,'rotate'),motion.duration);else await fire(id,'rotate');}}
    } else if((action.kind==='link'||action.kind==='set-image'||action.kind==='repeater-page'||action.kind==='state')&&action.expression){
      const value=evaluateExpression(action.expression,host);
      if(value!==undefined)await host.apply({...action,value:action.kind==='state'?value:String(value)});
    } else await host.apply(action);
  }
}

export function valueAction(target: string, property: 'text' | 'selected', value: Scalar): Action {
  return { kind: property === 'text' ? 'set-text' : 'set-selected', target, expression: { kind: 'literal', value } };
}
