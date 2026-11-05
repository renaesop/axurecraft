import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { parseSemanticProject } from '../src/semantic.ts';
import { emitProject } from '../src/emit.ts';
import { materializePage, flattenWidgets } from '../src/repeater-model.ts';
import type { Widget } from '../src/model.ts';

const source = resolve('output/campus'), out = resolve('output/appearance-check');
const project = parseSemanticProject(readFileSync(join(source, 'project.json'), 'utf8'));
const pageModel = project.pages[4]; project.pages = [pageModel]; pageModel.width = 500;
const widgets = flattenWidgets(materializePage(pageModel).widgets);
const find = (objectId: number) => widgets.find(w => w.source.record === 18 && w.source.objectId === objectId && w.instance?.rowId === '0')!;
const group = find(214), border = find(215), minus = find(216), quantity = find(212);
for (const [i, enabled] of [true, false].entries()) {
  const button: Widget = {
    id: enabled ? 'enable-appearance' : 'disable-appearance', type: 'VectorShape', kind: 'shape', name: 'Appearance test',
    x: 400, y: 20 + i * 50, width: 40, height: 30, css: { background: '#69c' }, content: [],
    behaviors: [{ event: 'click', actions: [group, quantity].map(w => ({ kind: 'enable', target: w.id, value: enabled })) }],
    source: { record: 0, objectId: -1, guid: 'test-' + i, className: 'fixture' },
  };
  pageModel.widgets.push(button);
}
const assets = new Map(readdirSync(join(source, 'assets')).map(name => ['assets/' + name, readFileSync(join(source, 'assets', name))]));
await emitProject(parseSemanticProject(JSON.stringify(project)), assets, out, 'semantic-appearance-fixture.json');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-gpu', '--force-color-profile=srgb'] });
const results: unknown[] = [], errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  for (const variant of ['', 'react']) {
    const selector = (id: string) => '[id="' + id + '"]';
    await page.goto(pathToFileURL(join('output/appearance-before', variant, 'page-5.html')).href);
    const old = PNG.sync.read(await page.locator(selector(border.id)).screenshot());
    await page.goto(pathToFileURL(join(out, variant, 'page-5.html')).href);
    const borderPath = page.locator(selector(border.id) + ' svg path').first();
    const minusPath = page.locator(selector(minus.id) + ' svg path').first();
    const input = page.locator(selector(quantity.id) + ' input');
    await borderPath.waitFor();
    assert.equal(await borderPath.getAttribute('stroke'), '#cccccc');
    assert.equal(await borderPath.getAttribute('stroke-opacity'), '0.90588');
    assert.equal(await minusPath.getAttribute('fill'), '#cccccc');
    const current = PNG.sync.read(await page.locator(selector(border.id)).screenshot({ path: join(out, variant || 'html') + '-disabled-minus.png' }));
    assert.equal(old.width, current.width); assert.equal(old.height, current.height);
    let changedPixels = 0;
    for (let i = 0; i < old.data.length; i += 4) if ([0, 1, 2, 3].some(c => old.data[i + c] !== current.data[i + c])) changedPixels++;
    assert.ok(changedPixels > 0, 'source disabled border must change the previously normal rendering');
    await input.fill('9');
    await input.evaluate(el => { (globalThis as any).savedQuantity = el; });
    await page.locator('#enable-appearance').click();
    assert.equal(await borderPath.getAttribute('stroke'), '#999999');
    assert.equal(await minusPath.getAttribute('fill'), '#333333');
    await page.locator('#disable-appearance').click();
    assert.equal(await borderPath.getAttribute('stroke'), '#cccccc');
    assert.equal(await input.isDisabled(), true);
    assert.equal(await page.locator(selector(quantity.id)).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(240, 240, 240)');
    await page.locator('#enable-appearance').click();
    assert.equal(await input.inputValue(), '9');
    assert.ok(await input.evaluate(el => el === (globalThis as any).savedQuantity), 'style switch must preserve the edited input node');
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(ids.length, new Set(ids).size);
    results.push({ renderer: variant || 'html', passed: true, changedBorderPixels: changedPixels, scope: 'Source RP disabled border/fill/opacity and named input style, restoration on enable, retained edited quantity and node identity' });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'validation.json'), JSON.stringify({ passed: true, nativeVisualParity: false, results, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
