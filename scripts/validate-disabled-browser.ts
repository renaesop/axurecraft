import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { emitProject } from '../src/emit.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import type { Action, Project, Widget, FormControl } from '../src/model.ts';

const root = resolve('output/disabled-check');
const make = (id: string, x: number, y: number, kind: Widget['kind'] = 'shape', width = 30, height = 24): Widget => ({
  id, kind, type: kind === 'group' ? 'Layer' : kind === 'panel' ? 'DynamicPanel' : kind === 'control' ? 'TextBox' : 'VectorShape',
  name: id, x, y, width, height, css: { background: '#cdf' }, content: [], behaviors: [],
  source: { record: 0, objectId: 0, guid: id, className: 'fixture' },
});
const control = (id: string, x: number, y: number, disabled = false, kind:FormControl['control']='text'): Widget => {
  const w:Widget={...make(id,x,y,'control',60,24),content:[{kind:'control',control:kind,label:id,value:id,placeholder:'',disabled,readOnly:false}]};
  w.variants={disabled:{css:{background:'#eee',color:'#777'},content:structuredClone(w.content)}};
  return w;
};
const click = (w: Widget, actions: Action[]): Widget => ({ ...w, behaviors: [{ event: 'click', actions }] });
const marker = (id: string, x: number) => ({ ...make(id, x, 5), css: { background: '#0a0', display: 'none' } });
const leaf = click(make('leaf', 0, 0), [{ kind: 'show', target: 'child-marker' }]); leaf.disabled = true;
const panel = make('panel', 0, 40, 'panel', 80, 30);
panel.states = [{ id: 'state-a', name: 'A', widgets: [control('input-a', 0, 0)] }, { id: 'state-b', name: 'B', widgets: [control('input-b', 0, 0, true)] }];
const rowGroup = make('row-group', 0, 0, 'group', 80, 30); rowGroup.disabled = true; rowGroup.css = {};
rowGroup.children = [control('row-input', 0, 0)];
const repeater = make('rep', 0, 90, 'repeater', 80, 30); repeater.type = 'Repeater'; repeater.css = {};
repeater.repeater = {
  columns: [{ id: 1, name: 'name' }], rows: [{ id: 'a', cells: { '1': { kind: 'text', value: 'A' } } }, { id: 'b', cells: { '1': { kind: 'text', value: 'B' } } }],
  bindings: [], template: [rowGroup], isolateRadioGroups: true, templateSource: rowGroup.source,
  layout: { direction: 'vertical', horizontalSpacing: 0, verticalSpacing: 0, pageSize: 1, startPage: 1, wrap: 0, paddingLeft: 0, paddingTop: 0 },
};
const group = click(make('group', 10, 40, 'group', 160, 130), [{ kind: 'show', target: 'parent-marker' }]);
group.css = {}; group.children = [leaf, control('input', 50, 0, true), panel, repeater,control('memo',90,40,false,'textarea'),control('choice',90,90,false,'checkbox')];
const buttons = [
  ['enable-group', { kind: 'enable', target: 'group', value: true }],
  ['disable-group', { kind: 'enable', target: 'group', value: false }],
  ['enable-leaf', { kind: 'enable', target: 'leaf', value: true }],
  ['state-b', { kind: 'state', target: 'panel', value: 'state-b' }],
  ['enable-row', { kind: 'enable', target: 'rep-rowa-row-group', value: true }],
  ['next', { kind: 'repeater-page', target: 'rep', value: 'next' }],
  ['previous', { kind: 'repeater-page', target: 'rep', value: 'previous' }],
  ['enable-second-row', { kind: 'enable', target: 'rep-rowb-row-group', value: true }],
  ['disable-row', { kind: 'enable', target: 'rep-rowa-row-group', value: false }],
] as const;
const widgets = [group, marker('child-marker', 10), marker('parent-marker', 60), ...buttons.map(([id, action], i) => click(make(id, 220, 10 + i * 35), [action]))];
widgets.push(click(make('clear', 270, 10), [{ kind: 'hide', target: 'child-marker' }, { kind: 'hide', target: 'parent-marker' }]));
const project: Project = { schema: 'axure-semantic', schemaVersion: 2, sourceSha256: '0'.repeat(64), issues: [], stats: {}, pages: [{ id: 'disabled', name: 'Disabled behavior', file: 'page-1.html', width: 350, height: 320, background: 'white', behaviors: [], widgets }] };
await emitProject(parseSemanticProject(JSON.stringify(project)), new Map(), root);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results: unknown[] = [], errors: string[] = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  for (const variant of ['', 'react']) {
    await page.goto(pathToFileURL(join(root, variant, 'page-1.html')).href); await page.locator('.rp-page').waitFor();
    const input = (id: string) => page.locator(`[id="${id}"] input`);
    const clickAtLeaf = () => page.mouse.click(25, 52);
    assert.equal(await input('input').isDisabled(), true);
    assert.equal(await input('input-a').isDisabled(), false);
    assert.equal(await input('input-b').isDisabled(), true);
    assert.equal(await input('rep-rowa-row-input').isDisabled(), true, 'row initial group must disable its input');
    assert.equal(await page.locator('#input').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 238, 238)');
    await clickAtLeaf();
    assert.equal(await page.locator('#child-marker').isVisible(), false);
    assert.equal(await page.locator('#parent-marker').isVisible(), true, 'disabled child allows enabled parent click');
    await page.locator('#clear').click();
    await page.locator('#enable-group').click();
    assert.equal(await input('input').isDisabled(), false);
    assert.equal(await input('input-b').isDisabled(), false, 'enable group reaches inactive panel state');
    assert.equal(await input('rep-rowa-row-input').isDisabled(), true, 'container enable stops at repeater boundary');
    await input('input').fill('typed static');
    await page.locator('#memo textarea').fill('typed\ntextarea');
    await input('choice').check();
    await page.evaluate(()=>{(globalThis as any).savedControls=[document.querySelector('#input input'),document.querySelector('#memo textarea'),document.querySelector('#choice input')];});
    await page.locator('#clear').click();
    await page.locator('#leaf').click();
    assert.equal(await page.locator('#child-marker').isVisible(), true);
    assert.equal(await page.locator('#parent-marker').isVisible(), false);
    await page.locator('#clear').click();
    await page.locator('#disable-group').click();
    assert.equal(await input('input').isDisabled(), true);
    assert.equal(await input('input-a').isDisabled(), true);
    assert.equal(await input('input-b').isDisabled(), true);
    await page.locator('#state-b').click();
    assert.equal(await input('input-b').isVisible(), true);
    await clickAtLeaf();
    assert.equal(await page.locator('#child-marker').isVisible(), false);
    assert.equal(await page.locator('#parent-marker').isVisible(), false);
    await page.locator('#enable-leaf').click();
    await clickAtLeaf();
    assert.equal(await page.locator('#child-marker').isVisible(), true, 'child can be re-enabled while group remains disabled');
    assert.equal(await input('input').isDisabled(), true);
    await page.locator('#enable-row').click();
    assert.equal(await input('rep-rowa-row-input').isDisabled(), false);
    await input('rep-rowa-row-input').fill('edited');
    await page.evaluate(()=>{(globalThis as any).savedRowInput=document.querySelector('[id="rep-rowa-row-input"] input');});
    await page.locator('#disable-row').click();
    assert.equal(await page.locator('[id="rep-rowa-row-input"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 238, 238)');
    await page.locator('#enable-row').click();
    assert.equal(await input('rep-rowa-row-input').inputValue(),'edited');
    assert.ok(await page.evaluate(()=>(globalThis as any).savedRowInput===document.querySelector('[id="rep-rowa-row-input"] input')),'row appearance must retain input DOM identity');
    await page.locator('#next').click();
    assert.equal(await input('rep-rowb-row-input').isDisabled(), true);
    await page.locator('#enable-second-row').click();
    assert.equal(await input('rep-rowb-row-input').isDisabled(), false, 'actions resolve rows absent from initial page');
    await page.locator('#previous').click();
    assert.equal(await input('rep-rowa-row-input').isDisabled(), true, 'native repeater refresh restores initial disabled state');
    assert.equal(await input('rep-rowa-row-input').inputValue(), 'row-input');
    await page.locator('#enable-group').click();
    assert.equal(await input('input').inputValue(),'typed static');
    assert.equal(await page.locator('#memo textarea').inputValue(),'typed\ntextarea');
    assert.equal(await input('choice').isChecked(),true);
    assert.equal(await page.locator('#input').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(204, 221, 255)');
    assert.ok(await page.evaluate(()=>(globalThis as any).savedControls.every((node:Node,i:number)=>node===document.querySelector(['#input input','#memo textarea','#choice input'][i]))),'static appearance must retain control DOM identity');
    results.push({ renderer: variant || 'html', passed: true, scope: 'Initial disabled flags, container recursion, event bubbling, repeater boundaries/reset, appearance colors and restoration, retained input/textarea/checkbox values and DOM identity' });
  }
  assert.deepEqual(errors, []);
  mkdirSync(root, { recursive: true }); writeFileSync(join(root, 'validation.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
