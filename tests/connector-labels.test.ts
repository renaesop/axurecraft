import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertRp9 } from '../src/convert.ts';
import { richTextValue } from '../src/rich-text.ts';
import { connectorLabelsFile, labelCases } from './fixtures/connector-labels.ts';
import { visibleDiagramBounds, visibleDiagramLeft } from '../src/groups.ts';
import type { Widget } from '../src/model.ts';

for (const team of [false, true]) {
  test(`native connector labels survive ${team ? 'rpteam' : 'rp'} conversion and follow the routed path`, () => {
    const { project } = convertRp9(connectorLabelsFile(team));
    assert.deepEqual(project.issues, []);
    assert.equal(project.pages.length, 1);
    assert.equal(project.pages[0].widgets.length, labelCases.length);
    for (const c of labelCases) {
      const widget = project.pages[0].widgets.find(w => w.name === c.name)!;
      assert.ok(widget.content.some(part => part.kind === 'vector'), c.name + ': shaft retained');
      const text = widget.content.find(part => part.kind === 'text');
      if (!c.text) { assert.equal(text, undefined); continue; }
      assert.ok(text, c.name + ': native RichTextBlock was dropped');
      assert.equal(richTextValue(text), c.text);
      assert.deepEqual([widget.x + parseFloat(text.css.left) + 50, widget.y + parseFloat(text.css.top) + 10], c.anchor, c.name);
      assert.equal(text.css.width, '100px'); assert.equal(text.css.height, '20px');
    }
    const multi = project.pages[0].widgets.find(w => w.name === 'multiple-bends')!.content.find(c => c.kind === 'text')!;
    assert.deepEqual(multi.paragraphs[0].runs.map(r => [r.text, r.css.color, r.css['font-weight']]), [['满足', 'rgba(204,0,0,1)', '700'], ['条件', 'rgba(0,0,204,1)', '400']]);
  });
}

test('connector appearance variants retain their routed shaft, arrows and label position', () => {
  const { project } = convertRp9(connectorLabelsFile(true, { only: 'elbow', appearances: true }));
  assert.deepEqual(project.issues, []);
  const widget = project.pages[0].widgets[0];
  assert.equal(widget.css['border-width'], undefined, 'wrapper must not restore the SVG stroke as a CSS border');
  const original = widget.content.find(c => c.kind === 'vector')!;
  const label = widget.content.find(c => c.kind === 'text')!;
  for (const [i, variant] of (['hover', 'pressed', 'selected', 'disabled'] as const).entries()) {
    const paint = widget.variants![variant]!;
    const vector = paint.content!.find(c => c.kind === 'vector');
    assert.ok(vector, variant + ': connector shaft was removed');
    assert.equal(vector.paths[0].data, original.paths[0].data);
    assert.equal(vector.paths[0].stroke, ['#cc0000', '#0000cc', '#008000', '#999999'][i]);
    assert.equal(vector.paths[0].strokeWidth, 3 + i);
    assert.equal(vector.paths[0].markerEnd, vector.markers[0].id);
    assert.equal(vector.markers[0].color, vector.paths[0].stroke);
    const text = paint.content!.find(c => c.kind === 'text')!;
    assert.equal(richTextValue(text), '否');
    for (const key of ['left', 'top', 'width', 'height']) assert.equal(text.css[key], label.css[key]);
    assert.equal(paint.css.border, '0');
    assert.equal(paint.css.background, 'transparent');
  }
});

test('page bounds include labels extending past a connector endpoint or zero-height shaft', () => {
  for (const name of ['horizontal', 'vertical', 'zero-length']) {
    const { project } = convertRp9(connectorLabelsFile(true, { only: name }));
    const page = project.pages[0], widget = page.widgets[0], text = widget.content.find(c => c.kind === 'text')!;
    const right = widget.x + parseFloat(text.css.left) + parseFloat(text.css.width);
    const bottom = widget.y + parseFloat(text.css.top) + parseFloat(text.css.height);
    assert.ok(page.width >= right, name + ': label clipped at right page edge');
    assert.ok(page.height >= bottom, name + ': label clipped at bottom page edge');
  }
});

test('connector appearance geometry overrides are diagnosed without moving the shaft or label', () => {
  const { project } = convertRp9(connectorLabelsFile(true, { only: 'elbow', appearances: true, appearanceGeometry: true }));
  assert.equal(project.issues.length, 4);
  assert.ok(project.issues.every(issue => issue.feature.endsWith('-appearance-geometry')));
  const widget = project.pages[0].widgets[0], vector = widget.content.find(c => c.kind === 'vector')!;
  for (const variant of Object.values(widget.variants!)) {
    assert.equal(variant.content!.find(c => c.kind === 'vector')!.paths[0].data, vector.paths[0].data);
    const text = variant.content!.find(c => c.kind === 'text')!;
    assert.deepEqual([widget.x + parseFloat(text.css.left) + 50, widget.y + parseFloat(text.css.top) + 10], [200, 260]);
  }
});

test('connector label bounds survive nesting and do not enlarge hidden content', () => {
  const { project } = convertRp9(connectorLabelsFile(true, { only: 'vertical' }));
  const widget = project.pages[0].widgets[0];
  const group: Widget = { ...widget, id: 'group', type: 'Layer', kind: 'group', x: 12, y: 34, content: [], children: [widget] };
  assert.deepEqual(visibleDiagramBounds([group]), { right: 362, bottom: 254 });
  assert.equal(visibleDiagramLeft([group]), 262);
  assert.deepEqual([widget.width, widget.height], [0, 160], 'shaft dimensions remain unchanged');
  widget.css.display = 'none';
  assert.deepEqual(visibleDiagramBounds([group]), { right: 1, bottom: 1 });
});
