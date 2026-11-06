import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { emitProject } from '../src/emit.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import { readBehaviors } from '../src/interactions.ts';
import type { Widget } from '../src/model.ts';
import { linkGraph, zeroGuid, absentGuid } from '../tests/fixtures/native-link.ts';

const project = parseSemanticProject(readFileSync('examples/hello.project.json', 'utf8'));
const base = project.pages[0].widgets[0];
project.issues = [];
const button = (id: string, guid: string, following: boolean, y: number): Widget => {
  const { graph, owner, pages } = linkGraph(guid, following);
  const issues: typeof project.issues = [];
  const behaviors = readBehaviors(graph, owner, pages, issues);
  project.issues.push(...issues.map(issue => ({ ...issue, widget: id })));
  return { ...structuredClone(base), id, name: id, type: 'Button', kind: 'control', x: 20, y, width: 280, height: 36,
    css: {}, variants: undefined, behaviors, content: [{ kind: 'control', control: 'button', label: id, value: id, placeholder: '', disabled: false, readOnly: false }] };
};
const widgets = [button('Unset target', zeroGuid, false, 20), button('Missing page', absentGuid, false, 70),
  button('Unset then valid', zeroGuid, true, 120), button('Missing then valid', absentGuid, true, 170)];
project.pages = [{ ...project.pages[0], id: 'source', file: 'page-1.html', width: 340, height: 240, widgets, behaviors: [] },
  { ...project.pages[0], id: 'destination', file: 'page-2.html', name: 'Destination', width: 340, height: 240, behaviors: [],
    widgets: [{ ...structuredClone(base), id: 'destination', x: 20, y: 20, width: 280, height: 40, behaviors: [], variants: undefined,
      content: [{ kind: 'text', css: {}, paragraphs: [{ css: {}, runs: [{ text: 'Reached valid page', css: {} }] }] }] }] }];
const output = resolve('output/missing-link-check');
await emitProject(project, new Map(), output, 'authored-native-link-graph.json');
const report = JSON.parse(readFileSync(join(output, 'conversion-report.json'), 'utf8'));
assert.deepEqual(report.issues.map((i: { detail: string }) => i.detail), [
  'Axure:InteractionLinkWindowAction: Error: Link target page is not set',
  `Axure:InteractionLinkWindowAction: Error: Target page could not be resolved: ${absentGuid}`,
  'Axure:InteractionLinkWindowAction: Error: Link target page is not set',
  `Axure:InteractionLinkWindowAction: Error: Target page could not be resolved: ${absentGuid}`,
]);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors: string[] = [], results: unknown[] = [];
try {
  for (const renderer of ['html', 'react']) {
    const page = await browser.newPage(), root = join(output, renderer === 'react' ? 'react' : '');
    page.on('pageerror', error => errors.push(`${renderer}: ${error.message}`));
    const source = pathToFileURL(join(root, 'page-1.html')).href, destination = pathToFileURL(join(root, 'page-2.html')).href;
    await page.goto(source, { waitUntil: 'networkidle' });
    for (const name of ['Unset target', 'Missing page']) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal(page.url(), source, 'invalid links must not navigate or use the literal fallback');
    }
    for (const name of ['Unset then valid', 'Missing then valid']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForURL(destination);
      assert.equal(await page.locator('#destination').textContent(), 'Reached valid page');
      await page.goto(source, { waitUntil: 'networkidle' });
    }
    results.push({ renderer, invalidTargetsOmitted: true, followingNavigationPreserved: true, diagnostics: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  const validation = { fixture: 'authored native object graph plus semantic UI, not a native RP export', results, errors };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(JSON.stringify(validation, null, 2));
} finally { await browser.close(); }
