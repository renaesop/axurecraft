import type { Action, Behavior, Scalar } from './model.ts';
import { axureBoolean, evaluateExpression, type ExpressionContext } from './expression.ts';

export interface BehaviorHost extends ExpressionContext {
  behaviors(id: string): Behavior[];
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
    } else await host.apply(action);
  }
}

export function valueAction(target: string, property: 'text' | 'selected', value: Scalar): Action {
  return { kind: property === 'text' ? 'set-text' : 'set-selected', target, expression: { kind: 'literal', value } };
}
