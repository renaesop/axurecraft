import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Page as BrowserPage } from 'playwright-core';
import { PNG } from 'pngjs';
import { emitProject } from '../src/emit.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import { materializePage, flattenWidgets } from '../src/repeater-model.ts';
import type { Widget, Project, Action } from '../src/model.ts';

const before = resolve(process.argv[2] ?? 'output/group-before');
const after = resolve(process.argv[3] ?? 'output/campus');
const reportDirectory = join(after, 'group-validation');
mkdirSync(reportDirectory, { recursive: true });
const sample: Project = JSON.parse(readFileSync(join(after, 'project.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-gpu', '--force-color-profile=srgb'] });
const errors: string[] = [];
const results: unknown[] = [];
async function snapshot(page: BrowserPage, root: string, file: string) {
  await page.goto(pathToFileURL(join(root, file)).href);
  await page.locator('.rp-page').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const geometry = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rp-widget:not([data-kind="Layer"])')].map(el => {
    const rect = el.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return { id: el.id, rect: [rect.x, rect.y, rect.width, rect.height], hit: rect.width && rect.height ? document.elementFromPoint(point.x, point.y)?.closest('.rp-widget')?.id ?? null : null };
  }));
  const png = PNG.sync.read(await page.locator('.rp-page').screenshot());
  return { geometry, png };
}

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  for (const variant of ['', 'react']) for (const p of sample.pages) {
    const a = await snapshot(page, join(before, variant), p.file);
    const b = await snapshot(page, join(after, variant), p.file);
    assert.deepEqual(b.geometry, a.geometry, `${variant}/${p.file}: geometry, paint order or center hit changed`);
    assert.equal(b.png.width, a.png.width); assert.equal(b.png.height, a.png.height);
    let changedPixels = 0;
    for (let i = 0; i < a.png.data.length; i += 4) if ([0, 1, 2, 3].some(c => a.png.data[i + c] !== b.png.data[i + c])) changedPixels++;
    results.push({ renderer: variant || 'html', page: p.file, geometryAndCenterHitsUnchanged: true, changedPixels });
  }

  // Click real members of source groups. A zero-size wrapper has no own click
  // point, so dispatchEvent on the wrapper would not verify user interaction.
  for (const variant of ['', 'react']) for (const p of sample.pages.map(p => materializePage(p))) {
    for (const group of flattenWidgets(p.widgets).filter(w => w.kind === 'group')) {
      const actions = group.behaviors.find(b => b.event === 'click')?.actions;
      if (actions?.length !== 1 || actions[0].kind !== 'link' || typeof actions[0].value !== 'string') continue;
      await page.goto(pathToFileURL(join(after, variant, p.file)).href);
      await page.locator('.rp-page').waitFor();
      const point = await page.evaluate(id => {
        const group = document.getElementById(id)!;
        for (const member of group.querySelectorAll<HTMLElement>('.rp-widget')) {
          const r = member.getBoundingClientRect(); if (!r.width || !r.height) continue;
          const x = r.x + r.width / 2, y = r.y + r.height / 2;
          const handler = document.elementFromPoint(x, y)?.closest('[data-click]');
          if (handler === group) return { x, y };
        }
        return null;
      }, group.id);
      // Groups in inactive panel states are intentionally not clickable yet.
      if (!point) { results.push({ renderer: variant || 'html', page: p.file, group: group.id, pointer: 'no member center reaches this group in initial state' }); continue; }
      await Promise.all([page.waitForURL('**/' + actions[0].value), page.mouse.click(point.x, point.y)]);
      results.push({ renderer: variant || 'html', page: p.file, group: group.id, pointer: 'passed' });
    }
  }

  const make = (id: string, x: number, y: number, width = 20, height = 20): Widget => ({
    id, name: id, kind: 'shape', type: 'VectorShape', x, y, width, height,
    css: { background: '#08a' }, content: [], behaviors: [], source: { record: 0, objectId: 0, guid: id, className: 'test' },
  });
  const onClick = (w: Widget, actions: Action[]) => { w.behaviors = [{ event: 'click', actions }]; return w; };
  const marker = make('marker', 200, 10); marker.css.display = 'none';
  const hidden = make('hidden-child', 0, 0); hidden.css.display = 'none';
  const nested = make('nested', 60, 0, 60, 20);
  nested.kind = 'group'; nested.type = 'Layer'; nested.css = {}; nested.children = [hidden, make('right', 40, 0)];
  const group = onClick(make('group', 20, 20, 120, 20), [{ kind: 'show', target: 'marker' }]);
  group.kind = 'group'; group.type = 'Layer'; group.css = { display: 'none' }; group.children = [make('left', 0, 0), nested];
  const backing = onClick(make('backing', 20, 20, 120, 20), [{ kind: 'hide', target: 'marker' }]);
  const hide = onClick(make('hide', 20, 80), [{ kind: 'hide', target: 'group' }]);
  const show = onClick(make('show', 60, 80), [{ kind: 'show', target: 'group' }]);
  const toggle = onClick(make('toggle', 100, 80), [{ kind: 'toggle', target: 'nested' }]);
  const fixture: Project = {
    schema: 'axure-semantic', schemaVersion: 2, sourceSha256: '0'.repeat(64), stats: {}, issues: [],
    pages: [{ id: 'fixture', name: 'Group interactions', file: 'page-1.html', width: 300, height: 200, background: 'white', behaviors: [], widgets: [backing, group, marker, hide, show, toggle] }],
  };
  const fixtureRoot = join(reportDirectory, 'fixture');
  await emitProject(parseSemanticProject(JSON.stringify(fixture)), new Map(), fixtureRoot);
  for (const variant of ['', 'react']) {
    await page.goto(pathToFileURL(join(fixtureRoot, variant, 'page-1.html')).href);
    await page.locator('.rp-page').waitFor();
    assert.equal(await page.locator('#left').isVisible(), false);
    await page.locator('#show').click();
    assert.equal(await page.locator('#left').isVisible(), true);
    assert.equal(await page.locator('#right').isVisible(), true);
    assert.equal(await page.locator('#hidden-child').isVisible(), false);
    await page.locator('#right').click();
    assert.equal(await page.locator('#marker').isVisible(), true, 'nested member click must reach group');
    await page.mouse.click(65, 30);
    assert.equal(await page.locator('#marker').isVisible(), false, 'blank group area must let backing handle click');
    await page.locator('#toggle').click();
    assert.equal(await page.locator('#right').isVisible(), false);
    await page.locator('#hide').click(); await page.locator('#show').click();
    assert.equal(await page.locator('#left').isVisible(), true);
    assert.equal(await page.locator('#right').isVisible(), false, 'show outer group must retain nested visibility state');
    await page.locator('#toggle').click();
    assert.equal(await page.locator('#right').isVisible(), true);
    assert.equal(await page.locator('#hidden-child').isVisible(), false);
    results.push({ renderer: variant || 'html', fixture: 'nested group visibility, member clicks, blank-area click-through', passed: true });
  }
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: 'Group reconstruction regression against prior generated output, plus synthetic semantic behavior fixtures. NOT native Axure visual parity.', results, errors };
  writeFileSync(join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
