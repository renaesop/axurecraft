import type { Behavior, Widget, WidgetAppearance, WidgetContent } from './model.ts';
import { flattenWidgets } from './repeater-model.ts';
import type {Geometry} from './motion.ts';
const supportsDisabled = (kind: Widget['kind']): boolean => ['group', 'panel', 'shape', 'image', 'control'].includes(kind);

type ResolvedAppearance = WidgetAppearance & {content:WidgetContent[]};
export type AppearanceVariant = 'normal' | 'disabled' | 'selected';
/** RP9 applies a disabled style independently of selected; absent disabled styles retain selection paint. */
export function appearanceVariant(variants:{disabled?:unknown;selected?:unknown}|undefined,state:{disabled?:boolean;selected?:boolean;selectedPaint?:boolean}):AppearanceVariant {
  return state.disabled&&variants?.disabled?'disabled':(state.selectedPaint??state.selected)&&variants?.selected?'selected':'normal';
}

/** Rendering metadata. It is derived from Project, not part of editable content. */
export interface WidgetStateDefinition {
  id: string;
  geometry?: Geometry;
  kind: Widget['kind'];
  visible: boolean;
  disabled: boolean;
  selected?: boolean;
  selectionControl?: 'checkbox' | 'radio';
  radioGroup?: string;
  selectionGroup?: string;
  selectable?: boolean;
  hasDisabledAppearance?: boolean;
  children: string[];
  states: string[];
  behaviors: Behavior[];
  rowInstance: boolean;
  appearance?: {normal:ResolvedAppearance;disabled?:ResolvedAppearance;selected?:ResolvedAppearance};
}

function selectionControl(widget:Widget):'checkbox'|'radio'|undefined {
  const control=widget.content.find(c=>c.kind==='control'&&(c.control==='checkbox'||c.control==='radio'));
  return control?.kind==='control'?control.control as 'checkbox'|'radio':undefined;
}

export function describeWidgets(widgets: Widget[]): WidgetStateDefinition[] {
  return flattenWidgets(widgets).map(w => ({
    id: w.id, kind: w.kind, visible: w.css.display !== 'none',
    geometry:{x:w.x,y:w.y,width:w.width,height:w.height,rotation:parseFloat(/rotate\(([-.\d]+)/.exec(w.css.transform??'')?.[1]??'0')},
    selectionControl: selectionControl(w),
    radioGroup: w.content.flatMap(c => c.kind === 'control' && c.control === 'radio' && c.group ? [c.group] : [])[0],
    selectionGroup: w.selectionGroup,
    selectable: w.kind !== 'control' || !w.content.some(c => c.kind === 'control' && c.control === 'button'),
    hasDisabledAppearance: !!w.variants?.disabled,
    selected: w.selected ?? w.content.some(c=>c.kind==='control'&&c.checked),
    disabled: w.disabled ?? w.content.some(c => c.kind === 'control' && c.disabled),
    children: [...(w.children ?? []), ...(w.states ?? []).flatMap(s => s.widgets)].map(c => c.id),
    states: (w.states ?? []).map(s => s.id), behaviors: w.behaviors, rowInstance: !!w.instance,
    ...(w.variants?{appearance:{normal:{css:w.css,content:w.content},...Object.fromEntries(Object.entries(w.variants).map(([name,value])=>[name,{...value,content:value.content??w.content}]))}}:{}),
  }));
}

/** Matches RP9 enabled(): groups/panels recurse; repeaters and hotspots do not. */
export function enabledChanges(widgets: WidgetStateDefinition[], target: string, enabled: boolean): Record<string, boolean> {
  const index = new Map(widgets.map(w => [w.id, w]));
  const result: Record<string, boolean> = {};
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const w = index.get(id);
    if (!w || !supportsDisabled(w.kind)) return;
    result[id] = !enabled;
    if (w.kind === 'group' || w.kind === 'panel') for (const child of w.children) visit(child);
  };
  visit(target);
  return result;
}

/** Native initialization applies only explicit disabled=true flags, never enables siblings. */
export function initialDisabled(widgets: WidgetStateDefinition[]): Record<string, boolean> {
  const result: Record<string, boolean> = Object.fromEntries(widgets.filter(w => supportsDisabled(w.kind)).map(w => [w.id, false]));
  for (const w of widgets) if (w.disabled) Object.assign(result, enabledChanges(widgets, w.id, false));
  return result;
}

/** Native selected() updates disabled checkbox/radio checked properties, but other disabled widgets ignore selection writes. */
export function canSelectWidget(widget:WidgetStateDefinition|undefined,disabled:boolean):boolean {
  return !!widget && widget.selectable !== false && ['shape','image','control','group','panel'].includes(widget.kind) && (!disabled || !!widget.selectionControl);
}
