import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { parseSemanticProject } from '../src/semantic.ts';
import { emitProject } from '../src/emit.ts';
import { flattenWidgets, materializePage } from '../src/repeater-model.ts';
import type { Widget, UIExpression, Scalar, Action } from '../src/model.ts';
const source = resolve('output/campus'), out = resolve('output/expression-check');
const original = parseSemanticProject(readFileSync(join(source, 'project.json'), 'utf8'));
const project = structuredClone(original), pageModel = project.pages[4]; project.pages = [pageModel];
pageModel.width = 500; pageModel.height = 600; pageModel.behaviors = [];
const repeater = pageModel.widgets.find(w => w.repeater)!;
const all = flattenWidgets(repeater.repeater!.template);
const find = (id: number) => structuredClone(all.find(w => w.source.objectId === id)!);
const quantity = find(212), plus = find(209), minus = find(214), subtotal = find(213);
// A separately labelled semantic fixture supplies valid condition targets. The
// original campus RP contains stale references; this does not repair that RP.
Object.assign(quantity, { x: 70, y: 10, width: 50, height: 30 });
Object.assign(plus, { x: 130, y: 10 }); Object.assign(minus, { x: 20, y: 10 });
Object.assign(subtotal, { x: 200, y: 10, width: 130, height: 30 });
const literal = (value: Scalar): UIExpression => ({ kind: 'literal', value });
const read: UIExpression = { kind: 'widget', target: quantity.id, property: 'text' };
const amount: UIExpression = { kind: 'call', method: 'toFixed', receiver: { kind: 'binary', operator: '*', left: { kind: 'column', columnId: 265 }, right: read }, args: [literal(2)] };
const setTotal: Action = { kind: 'set-text', target: subtotal.id, expression: { kind: 'concat', parts: [literal('￥'), amount] } };
subtotal.behaviors = [{ event: 'load', actions: [setTotal] }];
quantity.behaviors.push({ event: 'textchange', actions: [
  { kind: 'branch', branches: [
    { condition: { kind: 'binary', operator: '<=', left: read, right: literal(1) }, actions: [{ kind: 'enable', target: minus.id, value: false }] },
    { actions: [{ kind: 'enable', target: minus.id, value: true }] },
  ] }, setTotal,
] });
const selection: Widget = {
  ...find(212), id: 'selection', type: 'Checkbox', kind: 'control', name: 'Selection fixture', x: 340, y: 10, width: 100, height: 30,
  variants: undefined, content: [{ kind: 'control', control: 'checkbox', label: 'Selection', value: 'Select', placeholder: '', disabled: false, readOnly: false, checked: false }],
  behaviors: [{ event: 'select', actions: [{ kind: 'set-text', target: subtotal.id, expression: literal('selected') }] }, { event: 'unselect', actions: [setTotal] }],
};
const boundName=find(203);Object.assign(boundName,{x:20,y:50,width:300,height:25});
repeater.repeater!.template = [quantity, plus, minus, subtotal, selection,boundName];
repeater.repeater!.bindings = [{targetGuid:boundName.source.guid,property:'text',expression:{kind:'literal',value:'edited semantic binding'}}]; repeater.repeater!.rows = repeater.repeater!.rows.slice(0, 2);
repeater.repeater!.layout = { ...repeater.repeater!.layout, pageSize: 0, wrap: 0, paddingLeft: 0, paddingTop: 0, verticalSpacing: 40 };
Object.assign(repeater, { x: 0, y: 0, width: 480, height: 180 });
const firstRow = flattenWidgets(materializePage({ ...pageModel, widgets: [repeater] }).widgets).filter(w => w.instance?.rowId === '0');
const selectionId = firstRow.find(w => w.id.endsWith('-selection'))!.id;
const toggle: Widget = { ...find(212), id: 'toggle-selection', type: 'VectorShape', kind: 'shape', name: 'Toggle', variants: undefined, x: 20, y: 230, width: 110, height: 35,
  content: [{ kind: 'text', css: {}, paragraphs: [{ css: {}, runs: [{ text: 'Toggle selection', css: {} }] }] }],
  behaviors: [{ event: 'click', actions: [{ kind: 'set-selected', target: selectionId, expression: literal('toggle') }] }],
};
pageModel.widgets = [repeater, toggle];
const assets = new Map(readdirSync(join(source, 'assets')).map(name => ['assets/' + name, readFileSync(join(source, 'assets', name))]));
await emitProject(parseSemanticProject(JSON.stringify(project)), assets, out, 'semantic-expression-fixture.json');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results: unknown[] = [], errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  const selector = (id: string) => '[id="' + id + '"]';
  for (const variant of ['', 'react']) {
    await page.goto(pathToFileURL(join(out, variant, 'page-5.html')).href);
    const rows = flattenWidgets(materializePage(pageModel).widgets);
    const row = (id: number, rowId = '0') => rows.find(w => w.instance?.rowId === rowId && w.source.objectId === id && w.id !== selectionId)!;
    const input = page.locator(selector(row(212).id) + ' input');
    const total = page.locator(selector(row(213).id) + ' .rp-text');
    const plusHit = row(211), minusHit = row(216);
    await input.waitFor();
    assert.equal(await input.inputValue(), '1');
    assert.equal(await page.locator(selector(row(203).id)+' .rp-text').textContent(),'edited semantic binding','runtime load must not overwrite edited static bindings');
    const cell = repeater.repeater!.rows[0].cells['265']; const price = Number(cell.kind === 'text' ? cell.value : 0);
    await page.waitForFunction(({ id, expected }) => document.getElementById(id)?.textContent === expected, { id: row(213).id, expected: `￥${price.toFixed(2)}` });
    await input.evaluate(el => { (window as any).originalInput = el; });
    await page.locator(selector(plusHit.id)).click();
    assert.equal(await input.inputValue(), '2');
    assert.equal(await total.textContent(), `￥${(price * 2).toFixed(2)}`);
    assert.equal(await page.locator(selector(row(214).id)).getAttribute('aria-disabled'), 'false');
    assert.equal(await page.locator(selector(row(212, '1').id) + ' input').inputValue(), '1');
    await page.locator(selector(minusHit.id)).click();
    assert.equal(await input.inputValue(), '1');
    assert.equal(await page.locator(selector(row(214).id)).getAttribute('aria-disabled'), 'true');
    const disabledBox=await page.locator(selector(minusHit.id)).boundingBox();
    assert.ok(disabledBox);await page.mouse.click(disabledBox.x+disabledBox.width/2,disabledBox.y+disabledBox.height/2);
    assert.equal(await input.inputValue(), '1', 'disabled minus must not run');
    await input.fill('9');
    await page.locator(selector(plusHit.id)).click();
    assert.equal(await input.inputValue(), '10');
    assert.equal(await total.textContent(), `￥${(price * 10).toFixed(2)}`);
    await input.fill('0'); await input.press('Tab');
    assert.equal(await input.inputValue(), '1', 'native blur condition corrects values below one');
    await page.locator('#toggle-selection').click();
    assert.equal(await page.locator(selector(selectionId) + ' input').isChecked(), true);
    assert.equal(await total.textContent(), 'selected');
    await page.locator('#toggle-selection').click();
    assert.equal(await total.textContent(), `￥${price.toFixed(2)}`);
    await page.locator(selector(selectionId) + ' input').check();
    assert.equal(await total.textContent(), 'selected');
    assert.ok(await input.evaluate(el => el === (window as any).originalInput));
    results.push({ renderer: variant || 'html', semanticFixture: 'real source add/minus/blur plus explicit valid textchange branches, per-row calculations, selection events, retained input identity', passed: true });
    // Separate verification against the unmodified converted public sample.
    await page.goto(pathToFileURL(join(source, variant, 'page-5.html')).href);
    const real = flattenWidgets(materializePage(original.pages[4]).widgets);
    const realWidget = (id: number) => real.find(w => w.instance?.rowId === '0' && w.source.objectId === id)!;
    const realInput = page.locator(selector(realWidget(212).id) + ' input');
    await realInput.waitFor(); await page.locator(selector(realWidget(211).id)).click();
    assert.equal(await realInput.inputValue(), '2');
    await realInput.fill('9'); await page.locator(selector(realWidget(211).id)).click();
    assert.equal(await realInput.inputValue(), '10');
    await realInput.fill('0'); await realInput.press('Tab');
    assert.equal(await realInput.inputValue(), '1');
    results.push({ renderer: variant || 'html', originalCampus: 'unmodified source add and blur actions use actual input values; stale textchange case group remains omitted', passed: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'validation.json'), JSON.stringify({ passed: true, nativeVisualParity: false, results, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
