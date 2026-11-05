import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nestGroups, visibleDiagramBounds } from '../src/groups.ts';
import { widgetStyle } from '../src/render-tree.ts';
import type { Widget } from '../src/model.ts';

const widget = (id: string, x: number, y: number, kind: Widget['kind'] = 'shape'): Widget => ({
  id, kind, type: kind === 'group' ? 'Layer' : 'VectorShape', name: '',
  x, y, width: 10, height: 20, css: {}, content: [], behaviors: [],
  source: { record: 0, objectId: 0, guid: id, className: kind },
});

test('nested groups preserve world coordinates, paint order and individual visibility', () => {
  const group = widget('group', 999, -999, 'group');
  group.css.display = 'none';
  const hidden = widget('hidden', 500, 600); hidden.css.display = 'none';
  const flat = [group, widget('first', 10, 20), widget('nested', 999, 999, 'group'), widget('second', 40, 50), hidden, widget('outside', 5, 6)];
  const original = structuredClone(flat);
  const roots = nestGroups(flat, new Map([['group', ['first', 'nested']], ['nested', ['second', 'hidden']]]));
  assert.deepEqual(flat, original, 'canonical source objects must not be mutated');
  assert.deepEqual(roots.map(w => w.id), ['group', 'outside']);
  const outer = roots[0], inner = outer.children![1], child = inner.children![0];
  assert.equal(outer.x + inner.x + child.x, 40);
  assert.equal(outer.y + inner.y + child.y, 50);
  assert.equal(outer.children![0].css.display, undefined, 'group visibility must not overwrite child visibility');
  assert.equal(inner.children![1].css.display, 'none');
  assert.deepEqual(visibleDiagramBounds(roots), { right: 15, bottom: 26 });
  outer.css = {};
  assert.deepEqual(visibleDiagramBounds(roots), { right: 50, bottom: 70 }, 'hidden members do not enlarge page');
  assert.equal(widgetStyle(outer).width, '0px', 'group gap must not become a click target');
  assert.equal(widgetStyle(outer).height, '0px');
});

test('invalid membership fails explicitly instead of losing widgets or changing paint order', () => {
  const a = widget('a', 0, 0, 'group'), b = widget('b', 0, 0, 'group');
  assert.throws(() => nestGroups([a, b], new Map([['a', ['b']], ['b', ['a']]])), /Cyclic/);
  assert.throws(() => nestGroups([a, b], new Map([['a', ['missing']]])), /Missing group member/);
  assert.throws(() => nestGroups([a, b, widget('c', 0, 0)], new Map([['a', ['c']], ['b', ['c']]])), /multiple owners/);
  assert.throws(() => nestGroups([a, widget('outside', 0, 0), widget('inside', 0, 0)], new Map([['a', ['inside']]])), /interleaves paint order/);
  const deep = Array.from({ length: 67 }, (_, i) => widget(`g${i}`, 0, 0, 'group'));
  assert.throws(() => nestGroups(deep, new Map(deep.slice(0, -1).map((w, i) => [w.id, [deep[i + 1].id]]))), /nesting exceeds/);
});
