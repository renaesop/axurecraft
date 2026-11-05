import { canSelectWidget, type WidgetStateDefinition } from './widget-state.ts';

/** Logical form values and selection paint are distinct in the RP9 runtime. */
export interface SelectionHost {
  widgets(): WidgetStateDefinition[];
  disabled(id: string): boolean;
  checked(id: string): boolean;
  paint(id: string): boolean;
  writeChecked(id: string, value: boolean): void;
  writePaint(id: string, value: boolean): void;
  fire(id: string, value: boolean, depth: number): void;
}

export function createSelectionController(host: SelectionHost) {
  const definition = (id: string) => host.widgets().find(widget => widget.id === id);
  const guard = (depth: number) => {
    if (depth > 128) throw new Error('Selection recursion exceeds 128');
  };

  // Assigning a radio's checked property lets the browser clear its peers, including
  // disabled peers. Native RP9 does not also clear their selection paint here.
  const check = (widget: WidgetStateDefinition, value: boolean): void => {
    if (value && widget.selectionControl === 'radio' && widget.radioGroup) {
      for (const other of host.widgets()) {
        if (other.id !== widget.id && other.selectionControl === 'radio' && other.radioGroup === widget.radioGroup) {
          host.writeChecked(other.id, false);
        }
      }
    }
    host.writeChecked(widget.id, value);
  };

  const style = (id: string, value: boolean, depth = 0): void => {
    guard(depth);
    const widget = definition(id);
    if (!widget || host.disabled(id)) return;
    const changed = host.paint(id) !== value;

    if (value && widget.selectionGroup) {
      for (const other of host.widgets()) {
        if (other.id !== id && other.selectionGroup === widget.selectionGroup) style(other.id, false, depth + 1);
      }
    }

    if (widget.kind === 'group' || widget.kind === 'panel') {
      const skipped = new Set<string>();
      for (const childId of widget.children) {
        if (value && skipped.has(childId)) continue;
        const child = definition(childId);
        if (value && child?.selectionGroup) {
          for (const other of host.widgets()) if (other.selectionGroup === child.selectionGroup) skipped.add(other.id);
        }
        select(childId, value, depth + 1);
      }
    }

    host.writePaint(id, value);
    if (changed) host.fire(id, value, depth + 1);
  };

  const select = (id: string, value: boolean, depth = 0): void => {
    guard(depth);
    const widget = definition(id);
    if (!canSelectWidget(widget, host.disabled(id))) return;
    if (widget!.selectionControl) {
      if (host.checked(id) === value) return;
      check(widget!, value);
    }
    // Shapes and containers reapply selection even when already selected: peers
    // and descendants may have changed independently since the preceding write.
    style(id, value, depth);
  };

  const click = (id: string, checked: boolean): void => {
    const widget = definition(id);
    if (!widget?.selectionControl || host.disabled(id)) return;
    check(widget, checked);
    if (widget.selectionControl === 'checkbox') style(id, !host.paint(id));
    else {
      // A click on an already checked, named radio still clears and reselects its
      // paint in RP9, emitting unselect/select. An unnamed radio has no such peers.
      if (widget.radioGroup) {
        for (const other of host.widgets()) {
          if (other.selectionControl === 'radio' && other.radioGroup === widget.radioGroup) style(other.id, false);
        }
      }
      style(id, true);
    }
  };

  return { select, style, click };
}
