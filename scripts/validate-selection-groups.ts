import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { emitProject } from '../src/emit.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import { materializeRepeater } from '../src/repeater-model.ts';
import type { Action, Behavior, Project, Widget, RepeaterData } from '../src/model.ts';

const out = resolve('output/selection-groups-check');
const example = JSON.parse(readFileSync('examples/hello.project.json', 'utf8')) as Project;
const source = example.pages[0].widgets[2];
const select = (target: string, value = true): Action => ({ kind: 'set-selected', target, expression: { kind: 'literal', value } });
const append = (text: string): Action => ({ kind: 'set-text', target: 'log', expression: { kind: 'concat', parts: [
  { kind: 'widget', target: 'log', property: 'text' }, { kind: 'literal', value: text },
] } });
const logs = (id: string): Behavior[] => ['select', 'unselect', 'click'].map(event => ({ event, actions: [append(id + ':' + event + ';')] }));
const box = (id: string, x: number, y: number, extra: Partial<Widget> = {}): Widget => ({
  ...structuredClone(source), id, name: id, x, y, width: 110, height: 34,
  css: { background: '#e0e7ff', 'font-family': 'Arial', 'font-size': '14px' },
  variants: { selected: { css: { background: '#ff0000' } }, disabled: { css: { background: '#999999' } } },
  content: [{ kind: 'text', css: {}, paragraphs: [{ css: {}, runs: [{ text: id, css: {} }] }] }],
  behaviors: [{ event: 'click', actions: [select(id)] }, ...logs(id).filter(b => b.event !== 'click')],
  ...extra,
});
const radio = (id: string, x: number, y: number, group?: string): Widget => box(id, x, y, {
  kind: 'control', type: 'RadioButton', behaviors: logs(id), content: [{ kind: 'control', control: 'radio',
    label: id, value: id, placeholder: '', disabled: false, readOnly: false, group, checked: false,
  }],
});
const command = (id: string, x: number, y: number, actions: Action[]) => box(id, x, y, { variants: undefined, behaviors: [{ event: 'click', actions }] });
const repeater = (id: string, x: number, isolated: boolean): Widget => {
  const data: RepeaterData = {
    columns: [], rows: ['0', '1', '2'].map(id => ({ id, cells: {} })), bindings: [],
    template: [box('row-a', 0, 0, { selectionGroup: id + '-tabs' }), box('row-b', 120, 0, { selectionGroup: id + '-tabs' }),
      radio('row-r1', 0, 42, id + '-radios'), radio('row-r2', 120, 42, id + '-radios')],
    isolateRadioGroups: isolated, isolateSelectionGroups: isolated, templateSource: source.source,
    layout: { direction: 'vertical', horizontalSpacing: 0, verticalSpacing: 12, pageSize: 2, startPage: 1, wrap: 0, paddingLeft: 0, paddingTop: 0 },
  };
  return box(id, x, 380, { kind: 'repeater', type: 'Repeater', width: 240, height: 180, css: {}, content: [], variants: undefined, behaviors: [], repeater: data });
};
const isolated = repeater('isolated', 20, true), shared = repeater('shared', 300, false);
const project: Project = { ...example, pages: [{
  id: 'groups', name: 'Selection groups', file: 'groups.html', width: 650, height: 700, background: '#ffffff', behaviors: [],
  widgets: [
    box('a', 20, 20, { selectionGroup: 'tabs' }), box('b', 140, 20, { selectionGroup: 'tabs' }),
    radio('r1', 20, 80, 'radios'), radio('r2', 140, 80, 'radios'), radio('unnamed', 260, 80),
    command('set-r1', 20, 130, [select('r1')]), command('set-r2', 140, 130, [select('r2')]),
    command('disable-b', 260, 20, [{ kind: 'enable', target: 'b', value: false }]),
    command('enable-b', 380, 20, [{ kind: 'enable', target: 'b', value: true }]),
    box('panel', 20, 210, { kind: 'panel', type: 'DynamicPanel', width: 240, height: 60, css: {}, variants: undefined, content: [], behaviors: logs('panel'), states: [
      { id: 'first', name: 'First', widgets: [box('child-a', 0, 0, { selectionGroup: 'panel-tabs' }), box('child-b', 120, 0, { selectionGroup: 'panel-tabs' })] },
      { id: 'second', name: 'Second', widgets: [box('hidden-child', 0, 0)] },
    ] }),
    command('select-panel', 300, 210, [select('panel')]), command('clear-child', 420, 210, [select('hidden-child', false)]),
    box('self-disable', 20, 320, { behaviors: [
      { event: 'selectedchange', actions: [{ kind: 'enable', target: 'self-disable', value: false }] },
      { event: 'select', actions: [append('unexpected-disabled-select;')] },
    ] }),
    command('set-self', 140, 320, [select('self-disable')]),
    isolated, shared,
    radio('tail', 300, 280, 'shared-radios'),
    command('prepare-order', 420, 330, [select('shared-row0-row-r1'), select('shared-row1-row-r1'), select('tail')]),
    command('next', 20, 580, [{ kind: 'repeater-page', target: 'isolated', value: 'next' }]),
    command('previous', 140, 580, [{ kind: 'repeater-page', target: 'isolated', value: 'previous' }]),
    command('shared-next', 300, 580, [{ kind: 'repeater-page', target: 'shared', value: 'next' }]),
    command('shared-prev', 420, 580, [{ kind: 'repeater-page', target: 'shared', value: 'previous' }]),
    command('reset-log', 300, 130, [{ kind: 'set-text', target: 'log', expression: { kind: 'literal', value: '' } }]),
    box('log', 20, 640, { width: 600, height: 40, variants: undefined, behaviors: [], content: [{ kind: 'text', css: {}, paragraphs: [{ css: {}, runs: [{ text: '', css: {} }] }] }] }),
  ],
}] };
await emitProject(parseSemanticProject(JSON.stringify(project)), new Map(), out, 'authored-selection-groups.json');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors: string[] = [], results: unknown[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  const selected = async (id: string) => page.locator('[id="' + id + '"]').getAttribute('aria-selected');
  const background = async (id: string) => page.locator('[id="' + id + '"]').evaluate(el => getComputedStyle(el).backgroundColor);
  const log = async () => page.locator('#log .rp-text').innerText();
  const reset = async () => { await page.locator('#reset-log').click(); };
  for (const renderer of ['html', 'react']) {
    await page.goto(pathToFileURL(join(out, renderer === 'react' ? 'react' : '', 'groups.html')).href);
    await page.locator('#a').click(); await page.locator('#b').click();
    assert.equal(await selected('a'), 'false'); assert.equal(await selected('b'), 'true');
    assert.equal(await log(), 'a:select;a:unselect;b:select;');
    await page.locator('#disable-b').click(); await page.locator('#a').click();
    assert.equal(await selected('a'), 'true'); assert.equal(await selected('b'), 'true');
    await page.locator('#enable-b').click();
    assert.equal(await selected('a'), 'false'); assert.equal(await selected('b'), 'true');

    await reset(); await page.locator('#r1 input').click();
    assert.equal(await log(), 'r1:select;r1:click;');
    await reset(); await page.locator('#r2 input').click();
    assert.equal(await log(), 'r1:unselect;r2:select;r2:click;');
    assert.equal(await page.locator('#r1 input').isChecked(), false);
    assert.equal(await background('r1'), 'rgb(224, 231, 255)');
    await reset(); await page.locator('#r2 input').click();
    assert.equal(await log(), 'r2:unselect;r2:select;r2:click;');
    await reset(); await page.locator('#r1 label').click({ position: { x: 50, y: 12 } });
    assert.equal(await log(), 'r2:unselect;r1:select;r1:click;', 'label must not execute the click behavior twice');
    await reset(); await page.locator('#unnamed input').click(); await page.locator('#unnamed input').click();
    assert.equal(await log(), 'unnamed:select;unnamed:click;unnamed:click;');

    await page.locator('#set-r2').click();
    assert.equal(await page.locator('#r1 input').isChecked(), false);
    assert.equal(await page.locator('#r2 input').isChecked(), true);
    assert.equal(await background('r1'), 'rgb(255, 0, 0)', 'programmatic radio assignment retains peer paint');
    await reset(); await page.locator('#r2 input').click();
    assert.equal(await log(), 'r1:unselect;r2:unselect;r2:select;r2:click;');

    await page.locator('#select-panel').click();
    assert.equal(await selected('child-a'), 'true'); assert.equal(await selected('child-b'), 'false');
    assert.equal(await selected('hidden-child'), 'true');
    await page.locator('#clear-child').click(); assert.equal(await selected('hidden-child'), 'false');
    await page.locator('#select-panel').click(); assert.equal(await selected('hidden-child'), 'true');
    await reset(); await page.locator('#set-self').click();
    assert.equal(await background('self-disable'), 'rgb(153, 153, 153)');
    assert.equal(await log(), '', 'disabling during selectedchange suppresses the following select event');

    for (const repeater of [isolated, shared]) {
      const rows = materializeRepeater(repeater.id, repeater.repeater!);
      const a = rows[0].widgets[0].id, b = rows[1].widgets[1].id;
      await page.locator('[id="' + a + '"]').click(); await page.locator('[id="' + b + '"]').click();
      assert.equal(await selected(a), repeater === isolated ? 'true' : 'false');
      assert.equal(await selected(b), 'true');
      const r1 = rows[0].widgets[2].id, r2 = rows[1].widgets[3].id;
      await page.locator('[id="' + r1 + '"] input').click(); await page.locator('[id="' + r2 + '"] input').click();
      assert.equal(await page.locator('[id="' + r1 + '"] input').isChecked(), repeater === isolated);
      assert.equal(await background(r1), repeater === isolated ? 'rgb(255, 0, 0)' : 'rgb(224, 231, 255)');
    }
    await page.locator('#next').click(); await page.locator('#previous').click();
    assert.equal(await selected('isolated-row0-row-a'), 'false');
    assert.equal(await page.locator('[id="isolated-row0-row-r1"] input').isChecked(), false);
    await page.locator('#shared-next').click(); await page.locator('#shared-prev').click();
    await page.locator('#prepare-order').click(); await reset();
    await page.locator('#tail input').click();
    assert.equal(await log(), 'row-r1:unselect;row-r1:unselect;tail:unselect;tail:select;tail:click;', 'selection events follow DOM order even after repeater refresh');
    results.push({ renderer, passed: true, pointerClicks: 'selection groups, disabled peers, radio input/label/repeated clicks, property assignment, panel states, row isolation and refresh' });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'validation.json'), JSON.stringify({ passed: true, nativeVisualParity: false, source: 'Original semantic fixture, not a corrected RP or native export.', results, errors }, null, 2) + '\n');
  console.log(results);
} finally { await browser.close(); }
