import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { createSelectionController } from '../src/selection.ts';
import type { WidgetStateDefinition } from '../src/widget-state.ts';

const directory = process.env.AXURE_SCRIPT_DIRECTORY ?? '/Volumes/Axure RP 9/Axure RP 9.app/Contents/Resources/DefaultSettings/Prototype_Files/resources/scripts/axure/';
const sources = Object.fromEntries(['style.js', 'axQuery.std.js', 'events.js'].map(name => [name, readFileSync(directory + name, 'utf8')]));
const section = (source: string, start: string, end: string): string => {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Native source section ${start}`);
  return source.slice(first, last);
};
const widget = (id: string, extra: Partial<WidgetStateDefinition> = {}): WidgetStateDefinition => ({
  id, kind: 'shape', visible: true, disabled: false, selected: false,
  children: [], states: [], behaviors: [], rowInstance: false, hasDisabledAppearance: true, ...extra,
});
const widgets = [
  widget('a', { selectionGroup: 'tabs' }), widget('b', { selectionGroup: 'tabs' }),
  widget('c', { selectionGroup: 'tabs' }),
  widget('box', { kind: 'group', children: ['a', 'b', 'nested', 'repeater', 'hotspot'] }),
  widget('nested', { kind: 'group', children: ['checkbox', 'plain'] }),
  widget('checkbox', { kind: 'control', selectionControl: 'checkbox', selectionGroup: 'mixed' }),
  widget('plain', { selectionGroup: 'mixed', hasDisabledAppearance: false }),
  widget('panel', { kind: 'panel', children: ['c', 'radio1', 'radio2', 'radio3', 'unnamed'], states: ['active', 'hidden'] }),
  ...['radio1', 'radio2', 'radio3'].map(id => widget(id, { kind: 'control', selectionControl: 'radio', radioGroup: 'choices' })),
  widget('unnamed', { kind: 'control', selectionControl: 'radio' }),
  widget('repeater', { kind: 'repeater', children: ['row'] }), widget('row'), widget('hotspot', { kind: 'hotspot' }),
];
const index = new Map(widgets.map(w => [w.id, w]));
type State = { checked: Record<string, boolean>; paint: Record<string, boolean>; disabled: Record<string, boolean>; events: [string, boolean][] };
const state = (): State => ({ checked: {}, paint: {}, disabled: {}, events: [] });
const native = state(), actual = state();
const type = (id: string): string => index.get(id)?.selectionControl ?? index.get(id)?.kind ?? '';
const writeChecked = (state: State, id: string, value: boolean): void => {
  const w = index.get(id)!;
  if (value && w.selectionControl === 'radio' && w.radioGroup) {
    for (const other of widgets) if (other.id !== id && other.radioGroup === w.radioGroup) state.checked[other.id] = false;
  }
  state.checked[id] = value;
};
const wrap = (ids: string[]): any => {
  const values: any = ids.map(id => ({ id }));
  values.each = (fn: (this: { id: string }) => void) => { for (const id of ids) fn.call({ id }); return values; };
  values.attr = (name: string) => name === 'selectiongroup' ? index.get(ids[0])?.selectionGroup : undefined;
  values.hasClass = () => false;
  values.removeClass = () => values;
  values.find = () => ({ css: () => {} });
  values.prop = (name: string, value?: boolean) => {
    const id = ids[0]?.replace(/_input$/, '');
    if (name === 'checked') {
      if (value !== undefined) writeChecked(native, id, value);
      return !!native.checked[id];
    }
  };
  values.parent = () => wrap(ids);
  return values;
};
const jquery: any = (selector: string) => {
  if (selector.startsWith('#')) return wrap([selector.slice(1)]);
  const selectionGroup = selector.match(/^\[selectiongroup='(.*)'\]$/)?.[1];
  if (selectionGroup !== undefined) return wrap(widgets.filter(w => w.selectionGroup === selectionGroup).map(w => w.id));
  const radioGroup = selector.match(/^input\[name='(.*)'\]$/)?.[1];
  if (radioGroup !== undefined) return wrap(widgets.filter(w => w.radioGroup === radioGroup).map(w => w.id));
  throw new Error('Unexpected native selector: ' + selector);
};
jquery.inArray = (value: unknown, values: unknown[]) => values.indexOf(value);
const fn: any = {};
const types: Record<string, string> = { IsVector: 'shape', IsImageBox: 'image', IsLayer: 'group', IsDynamicPanel: 'panel', IsCheckBox: 'checkbox', IsRadioButton: 'radio' };
for (const name of ['IsTreeNodeObject', 'IsImageBox', 'IsVector', 'IsTableCell', 'IsDynamicPanel', 'IsLayer', 'IsTextArea', 'IsTextBox', 'IsListBox', 'IsComboBox', 'IsCheckBox', 'IsRadioButton']) fn[name] = (value: string) => types[name] === value;
const object = (id: string) => ({ id, type: type(id), isContained: false });
const query = (selector: string): any => {
  const id = selector.replace(/^#/, '');
  return {
    getElementIds: () => [id], getChildren: () => [{ children: index.get(id)?.children ?? [] }],
    selected: (value: boolean) => fn.selected.call(query(id), value),
  };
};
const ax: any = {
  style: {}, public: { fn }, INPUT: (id: string) => id + '_input', getTypeFromElementId: type,
  getObjectFromElementId: object, visibility: { isScriptIdLimbo: () => false },
  repeater: { getItemIdFromElementId: () => undefined, getScriptIdFromElementId: (id: string) => id },
  getPathFromScriptId: (id: string) => [id], getElementIdFromPath: (path: string[]) => path.at(-1),
  event: { mouseOverIds: [], raiseSelectedEvents: (id: string, value: boolean) => native.events.push([id, value]) },
};
const context = vm.createContext({
  $ax: ax, $axure: query, $obj: object, $jobj: (id: string) => wrap([id]), $: jquery,
  _selectedWidgets: native.paint, _disabledWidgets: native.disabled, _isWidgetDisabled: (id: string) => !!native.disabled[id],
  _widgetHasState: (id: string, name: string) => name !== 'disabled' || !!index.get(id)?.hasDisabledAppearance,
  _generateMouseState: () => 'normal', _applyImageAndTextJson: () => {}, _updateElementIdImageStyle: () => {},
  MOUSE_DOWN: 'mouseDown', MOUSE_OVER: 'mouseOver', NORMAL: 'normal', SELECTED: 'selected', DISABLED: 'disabled',
});
vm.runInContext(section(sources['style.js'], '$ax.style.SetWidgetSelected = function(', '$ax.style.SetWidgetPlaceholder = function('), context);
vm.runInContext(section(sources['axQuery.std.js'], '$ax.public.fn.selected = function(', '$ax.public.fn.focus = function('), context);
ax.style.IsWidgetDisabled = (id: string) => !!native.disabled[id];
const clickStart = sources['events.js'].indexOf('var onClick = function(e)', sources['events.js'].indexOf('var radioGroupName ='));
assert.ok(clickStart > 0);
const clickBody = sources['events.js'].slice(clickStart, sources['events.js'].indexOf('};', clickStart) + 2);
const radioClick = vm.runInContext('(function(elementId,radioGroupName){' + clickBody + ';return onClick;})', context);
const controller = createSelectionController({
  widgets: () => widgets, disabled: id => !!actual.disabled[id], checked: id => !!actual.checked[id], paint: id => !!actual.paint[id],
  writeChecked: (id, value) => { actual.checked[id] = value; }, writePaint: (id, value) => { actual.paint[id] = value; },
  fire: (id, value) => { actual.events.push([id, value]); },
});
type Operation = { kind: 'select' | 'enable' | 'click'; id: string; value: boolean };
const operations: Operation[] = [
  { kind: 'select', id: 'a', value: true }, { kind: 'select', id: 'b', value: true },
  { kind: 'enable', id: 'b', value: false }, { kind: 'select', id: 'a', value: true },
  { kind: 'select', id: 'box', value: true }, { kind: 'select', id: 'box', value: true },
  { kind: 'select', id: 'panel', value: true },
  ...['radio1', 'radio1', 'radio2', 'unnamed', 'unnamed'].map(id => ({ kind: 'click' as const, id, value: true })),
];
let seed = 0x3754;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
for (let i = 0; i < 1000; i++) {
  const w = widgets[random() % widgets.length];
  const kind = w.selectionControl && random() % 3 === 0 ? 'click' : random() % 3 === 0 ? 'enable' : 'select';
  operations.push({ kind, id: w.id, value: !!(random() & 0x100) });
}
let checkedStates = 0;
for (const [i, operation] of operations.entries()) {
  const { id, kind, value } = operation;
  const w = index.get(id)!;
  native.events = []; actual.events = [];
  if (kind === 'enable') {
    ax.style.SetWidgetEnabled(id, value);
    actual.disabled[id] = !value;
    if (value && w.hasDisabledAppearance) controller.style(id, !!actual.paint[id]);
  } else if (kind === 'select') {
    fn.selected.call(query(id), value);
    controller.select(id, value);
  } else if (!native.disabled[id]) {
    const checked = w.selectionControl === 'checkbox' ? !native.checked[id] : true;
    writeChecked(native, id, checked); // Browser pre-click activation, independent from RP paint.
    if (w.selectionControl === 'radio') radioClick(id, w.radioGroup ?? id)({ originalEvent: {} });
    else ax.style.SetWidgetSelected(id, !ax.style.IsWidgetSelected(id), true);
    controller.click(id, checked);
  }
  for (const w of widgets) {
    assert.equal(!!actual.paint[w.id], !!native.paint[w.id], `paint ${w.id}, #${i} ${JSON.stringify(operation)}`);
    if (w.selectionControl) assert.equal(!!actual.checked[w.id], !!native.checked[w.id], `checked ${w.id}, #${i} ${JSON.stringify(operation)}`);
    checkedStates++;
  }
  assert.deepEqual(actual.events, native.events, `events #${i} ${JSON.stringify(operation)}`);
}
const report = {
  passed: true, operations: operations.length, widgetStateChecks: checkedStates, eventSequenceChecks: operations.length,
  sources: Object.entries(sources).map(([name, source]) => ({ name, sha256: createHash('sha256').update(source).digest('hex') })),
  scope: 'Original RP9 public selected(), style SetWidgetSelected/Enabled and radio click handler. Selection groups, disabled peers, radio checked/paint divergence, repeated clicks, nested group/panel propagation and repeater/hotspot boundary. DOM selectors, browser checked exclusivity, getChildren and painting are adapters. No native visual or asynchronous interaction timing equivalence claimed.',
};
writeFileSync('research/native-selection-groups-validation.json', JSON.stringify(report, null, 2) + '\n');
console.log(report);
