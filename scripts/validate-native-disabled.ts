import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { enabledChanges, initialDisabled, type WidgetStateDefinition } from '../src/widget-state.ts';

const path = process.env.AXURE_QUERY_JS ?? '/Volumes/Axure RP 9/Axure RP 9.app/Contents/Resources/DefaultSettings/Prototype_Files/resources/scripts/axure/axQuery.std.js';
const source = readFileSync(path, 'utf8');
const start = source.indexOf('$ax.public.fn.enabled = function()');
const end = source.indexOf('$ax.public.fn.visible = function()', start);
assert.ok(start >= 0 && end > start);
// Execute the original enabled() body. Only widget lookup, child enumeration and
// styling/DOM effects are fixture adapters; the native recursion is unchanged.
const nativeDisabled: Record<string, boolean> = {};
let index = new Map<string, WidgetStateDefinition>();
const fn: Record<string, Function> = {};
const predicates = {
  IsImageBox: 'image', IsVector: 'shape', IsTextBox: 'control',
  IsTextArea: 'textarea', IsComboBox: 'select', IsListBox: 'list',
  IsCheckBox: 'checkbox', IsRadioButton: 'radio', IsDynamicPanel: 'panel', IsLayer: 'group',
};
for (const [key, kind] of Object.entries(predicates)) fn[key] = (type: string) => type === kind;
const ax: any = {
  public: { fn }, getTypeFromElementId: (id: string) => index.get(id)?.kind,
  style: { SetWidgetEnabled: (id: string, enabled: boolean) => nativeDisabled[id] = !enabled },
  INPUT: (id: string) => id + '_input',
};
const query = (selector: string): any => {
  const id = selector.slice(1);
  return {
    getElementIds: () => [id],
    getChildren: () => [{ children: index.get(id)!.children }],
    enabled: (enabled: boolean) => fn.enabled.call(query(selector), enabled),
  };
};
const context = vm.createContext({
  $ax: ax, $axure: query, $obj: () => ({}), PLAIN_TEXT_TYPES: [],
  $jobj: () => ({ length: 0, prop() {} }),
});
vm.runInContext(source.slice(start, end), context, { filename: path, timeout: 1000 });
const eventsPath = process.env.AXURE_EVENTS_JS ?? join(dirname(path), 'events.js');
const eventsSource = readFileSync(eventsPath, 'utf8');
const eventStart = eventsSource.indexOf('var _attachDefaultObjectEvent = function(');
const eventEnd = eventsSource.indexOf('var _shouldIgnoreLabelClickFromCheckboxOrRadioButton', eventStart);
assert.ok(eventStart >= 0 && eventEnd > eventStart);
ax.style.IsWidgetDisabled = (id: string) => !!nativeDisabled[id];
vm.runInContext(eventsSource.slice(eventStart, eventEnd) + '\nvar _shouldIgnoreLabelClickFromCheckboxOrRadioButton = function() { return false; };', context);
let eventChecks = 0;
for (const event of ['click', 'dblclick', 'mouseenter', 'mouseleave', 'change', 'focus', 'blur']) {
  let handler: Function | undefined, called = 0;
  const target = { bind: (_name: string, fn: Function) => handler = fn };
  (context as any)._attachDefaultObjectEvent(target, 'event-widget', event, () => { called++; return false; });
  nativeDisabled['event-widget'] = true;
  assert.equal(handler!({ type: event }), true, 'disabled handler lets native event bubble'); assert.equal(called, 0);
  nativeDisabled['event-widget'] = false;
  assert.equal(handler!({ type: event }), false); assert.equal(called, 1);
  eventChecks += 2;
}
let seed = 9271;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
let comparisons = 0;
for (let fixture = 0; fixture < 100; fixture++) {
  const kinds: WidgetStateDefinition['kind'][] = ['group', 'panel', 'shape', 'image', 'control', 'repeater', 'hotspot'];
  const widgets: WidgetStateDefinition[] = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), kind: kinds[Math.floor(random() * kinds.length)], children: [],
    disabled: random() < 0.2, visible: true, states: [], behaviors: [], rowInstance: false,
  }));
  for (let i = 1; i < widgets.length; i++) {
    const parents = widgets.slice(0, i).filter(w => ['group', 'panel', 'repeater'].includes(w.kind));
    const parent = parents[Math.floor(random() * parents.length)];
    if (parent) parent.children.push(widgets[i].id);
  }
  index = new Map(widgets.map(w => [w.id, w]));
  for (const key of Object.keys(nativeDisabled)) delete nativeDisabled[key];
  for (const w of widgets) if (w.disabled && !['hotspot', 'repeater'].includes(w.kind)) query('#' + w.id).enabled(false);
  let actual = initialDisabled(widgets);
  const compare = () => {
    for (const w of widgets) assert.equal(!!actual[w.id], !!nativeDisabled[w.id], `fixture ${fixture}, widget ${w.id}`);
    comparisons++;
  };
  compare();
  for (let step = 0; step < 30; step++) {
    const id = widgets[Math.floor(random() * widgets.length)].id, enabled = random() < 0.5;
    query('#' + id).enabled(enabled);
    actual = { ...actual, ...enabledChanges(widgets, id, enabled) };
    compare();
  }
}
const report = {
  passed: true, fixtures: 100, comparisons, eventChecks, widgetsPerFixture: 40, seed: 9271,
  sourcePath: path, sourceSha256: createHash('sha256').update(source).digest('hex'),
  eventsPath, eventsSha256: createHash('sha256').update(eventsSource).digest('hex'),
  scope: 'Original RP9 enabled() recursion and state mutations versus TS. Groups/panels, individual re-enable, initially disabled descendants, repeater/hotspot boundaries. DOM and visual style application are fixture adapters, not native visual verification.',
};
writeFileSync('research/native-disabled-validation.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
