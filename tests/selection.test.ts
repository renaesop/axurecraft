import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createSelectionController } from '../src/selection.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import { materializeRepeater } from '../src/repeater-model.ts';
import type { RepeaterData } from '../src/model.ts';
import type { WidgetStateDefinition } from '../src/widget-state.ts';

const widget = (id: string, extra: Partial<WidgetStateDefinition> = {}): WidgetStateDefinition => ({
  id, kind: 'shape', visible: true, disabled: false, children: [], states: [], behaviors: [], rowInstance: false, ...extra,
});
function fixture(widgets: WidgetStateDefinition[]) {
  const paint: Record<string, boolean> = {}, checked: Record<string, boolean> = {}, disabled: Record<string, boolean> = {};
  const events: [string, boolean][] = [];
  const controller = createSelectionController({
    widgets: () => widgets, paint: id => !!paint[id], checked: id => !!checked[id], disabled: id => !!disabled[id],
    writePaint: (id, value) => { paint[id] = value; }, writeChecked: (id, value) => { checked[id] = value; },
    fire: (id, value) => { events.push([id, value]); },
  });
  return { controller, paint, checked, disabled, events };
}
test('exclusive selection clears peers before selecting the target, but preserves disabled peers', () => {
  const f = fixture(['a', 'b', 'c'].map(id => widget(id, { selectionGroup: 'tabs' })));
  f.controller.select('a', true); f.events.length = 0;
  f.controller.select('b', true);
  assert.deepEqual(f.events, [['a', false], ['b', true]]);
  f.disabled.b = true;
  f.controller.select('a', true);
  assert.equal(f.paint.a, true); assert.equal(f.paint.b, true);
  f.disabled.b = false;
  f.controller.style('b', true); // Re-enable with a disabled appearance reapplies paint.
  assert.equal(f.paint.a, false); assert.equal(f.paint.b, true);
});
test('radio property assignment changes checked peers while clicks also update their paint and events', () => {
  const f = fixture(['a', 'b'].map(id => widget(id, { kind: 'control', selectionControl: 'radio', radioGroup: 'radios' })));
  f.controller.select('a', true); f.controller.select('b', true);
  assert.deepEqual(f.checked, { b: true, a: false });
  assert.deepEqual(f.paint, { a: true, b: true });
  f.events.length = 0; f.controller.click('b', true);
  assert.deepEqual(f.events, [['a', false], ['b', false], ['b', true]]);
  f.events.length = 0; f.controller.click('b', true);
  assert.deepEqual(f.events, [['b', false], ['b', true]], 'clicking the checked named radio still changes native paint twice');
});
test('container selection visits inactive state children and only the first direct member of each selection group', () => {
  const f = fixture([
    widget('panel', { kind: 'panel', children: ['a', 'b', 'nested', 'repeater', 'hotspot'] }),
    widget('a', { selectionGroup: 'tabs' }), widget('b', { selectionGroup: 'tabs' }),
    widget('nested', { kind: 'group', children: ['hidden'] }), widget('hidden', { visible: false }),
    widget('repeater', { kind: 'repeater', children: ['row'] }), widget('row'), widget('hotspot', { kind: 'hotspot' }),
  ]);
  f.controller.select('panel', true);
  assert.equal(f.paint.a, true); assert.equal(f.paint.b, false); assert.equal(f.paint.hidden, true);
  assert.equal(f.paint.row, undefined); assert.equal(f.paint.repeater, undefined); assert.equal(f.paint.hotspot, undefined);
  f.controller.select('hidden', false);
  f.controller.select('panel', true);
  assert.equal(f.paint.hidden, true, 'unchanged container assignment still reapplies descendants');
  f.controller.select('panel', false);
  assert.equal(f.paint.a, false); assert.equal(f.paint.hidden, false);
});
test('disabled checkbox assignments retain paint and do not emit synthetic selection events', () => {
  const f = fixture([widget('check', { kind: 'control', selectionControl: 'checkbox' })]);
  f.controller.select('check', true); f.disabled.check = true; f.events.length = 0;
  f.controller.select('check', false);
  assert.equal(f.checked.check, false); assert.equal(f.paint.check, true); assert.deepEqual(f.events, []);
  f.disabled.check = false; f.controller.select('check', true);
  assert.equal(f.checked.check, true); assert.deepEqual(f.events, []);
});
test('semantic selection metadata survives JSON and rejects malformed group fields', () => {
  const project = parseSemanticProject(readFileSync(new URL('../examples/hello.project.json', import.meta.url), 'utf8'));
  const w = project.pages[0].widgets[0];
  w.selectionGroup = 'Tab group';
  assert.equal(parseSemanticProject(JSON.stringify(project)).pages[0].widgets[0].selectionGroup, 'Tab group');
  assert.throws(() => parseSemanticProject(JSON.stringify(project).replace('"selectionGroup":"Tab group"', '"selectionGroup":42')), /selectionGroup/);
});
test('repeater selection groups isolate rows without mutating templates and validate the isolation flag', () => {
  const project = parseSemanticProject(readFileSync(new URL('../examples/hello.project.json', import.meta.url), 'utf8'));
  const w = project.pages[0].widgets[0]; w.selectionGroup = 'tabs';
  const data: RepeaterData = {
    columns: [], rows: [{ id: '0', cells: {} }, { id: '1', cells: {} }], bindings: [], template: [w],
    isolateRadioGroups: true, isolateSelectionGroups: true, templateSource: w.source,
    layout: { direction: 'vertical', horizontalSpacing: 0, verticalSpacing: 0, pageSize: 0, startPage: 1, wrap: 0, paddingLeft: 0, paddingTop: 0 },
  };
  const rows = materializeRepeater('list', data);
  assert.notEqual(rows[0].widgets[0].selectionGroup, rows[1].widgets[0].selectionGroup);
  assert.equal(w.selectionGroup, 'tabs');
  data.isolateSelectionGroups = false;
  assert.deepEqual(materializeRepeater('list', data).map(row => row.widgets[0].selectionGroup), ['tabs', 'tabs']);
  w.kind = 'repeater'; w.repeater = { ...data, template: [], isolateSelectionGroups: 'bad' as unknown as boolean };
  assert.throws(() => parseSemanticProject(JSON.stringify(project)), /isolateSelectionGroups/);
});
