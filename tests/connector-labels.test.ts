import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertRp9 } from '../src/convert.ts';
import { richTextValue } from '../src/rich-text.ts';
import { connectorLabelsFile, labelCases } from './fixtures/connector-labels.ts';

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
