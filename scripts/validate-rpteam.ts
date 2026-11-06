import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { teamFile, workingCopyEntries, widgetGuid, nativeRecord } from '../tests/fixtures/rpteam.ts';
import { parseProject } from '../src/graph.ts';
import { parseRp9Payload, encodeRp9Payload } from '../src/parser/rp9-payload.ts';
import { rpteamSamples, rpteamSamplePath, readRpteamSample } from '../tests/fixtures/rpteam-samples.ts';

const output = resolve('output/rpteam-check');
mkdirSync(output, { recursive: true });
const input = join(output, 'authored.rpteam');
writeFileSync(input, teamFile(workingCopyEntries()));
// Exercise the public CLI, including its emitted HTML and React bundles.
execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', input, output], { stdio: 'inherit' });
const report = JSON.parse(readFileSync(join(output, 'conversion-report.json'), 'utf8'));
assert.equal(report.stats.pages, 1);
assert.equal(report.stats.widgets, 1);
assert.deepEqual(report.issues, []);
// A real team sample includes empty pages. Compile an authored equivalent so
// the empty-page regression also has a small, focused fixture.
const emptyOutput = join(output, 'empty-page');
mkdirSync(emptyOutput, { recursive: true });
const emptyInput = join(emptyOutput, 'empty.rpteam');
writeFileSync(emptyInput, teamFile([
  { path: ['WorkingCopy', 'DesignDocument'], bytes: nativeRecord(false) },
  { path: ['WorkingCopy', 'empty', 'package'], bytes: nativeRecord(true, '', true) },
]));
execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', emptyInput, emptyOutput], { stdio: 'inherit' });
const emptyProject = JSON.parse(readFileSync(join(emptyOutput, 'project.json'), 'utf8'));
assert.equal(emptyProject.pages.length, 1);
assert.deepEqual(emptyProject.pages[0].widgets, []);
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--project', join(emptyOutput, 'react/tsconfig.json')], { stdio: 'inherit' });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--disable-gpu'],
});
const errors: string[] = [], results: unknown[] = [], screenshots: Buffer[] = [];
try {
  for (const renderer of ['html', 'react']) {
    const page = await browser.newPage({ viewport: { width: 400, height: 160 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(`${renderer}: ${error.message}`));
    await page.goto(pathToFileURL(join(output, renderer === 'react' ? 'react/page-1.html' : 'page-1.html')).href);
    const input = page.locator(`#w-${widgetGuid} input`);
    await input.waitFor({ state: 'visible' });
    assert.equal(await input.inputValue(), 'Current working copy');
    const box = await page.locator(`#w-${widgetGuid}`).boundingBox();
    assert.deepEqual(box, { x: 24, y: 32, width: 240, height: 40 });
    await input.fill('Edited in browser');
    assert.equal(await input.inputValue(), 'Edited in browser');
    await input.blur();
    await page.evaluate(() => document.fonts.ready);
    screenshots.push(await page.screenshot({ path: join(output, renderer + '.png'), fullPage: true }));
    results.push({ renderer, workingCopyValue: true, geometry: box, editable: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  const [html, react] = screenshots.map(s => PNG.sync.read(s));
  assert.deepEqual([html.width, html.height], [react.width, react.height]);
  let differentPixels = 0;
  for (let i = 0; i < html.data.length; i += 4) {
    if (!html.data.subarray(i, i + 4).equals(react.data.subarray(i, i + 4))) differentPixels++;
  }
  assert.equal(differentPixels, 0, 'HTML and React screenshots must match exactly');
  const validation = { fixture: 'authored binary; not an Axure export', results, errors, differentPixels };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(JSON.stringify(validation, null, 2));
  // Run the checked-in real samples by default, with no network dependency.
  const defaults = rpteamSamples.filter(sample => sample.expected);
  for (const sample of defaults) readRpteamSample(sample);
  const filenames = process.argv.length > 2 ? process.argv.slice(2) : defaults.map(rpteamSamplePath);
  for (const [sampleIndex, filename] of filenames.entries()) {
    const input = resolve(filename), destination = join(output, `sample-${sampleIndex + 1}`);
    const native = parseProject(readFileSync(input));
    let roundTrips = 0;
    for (const record of native.records) {
      if (!record.inner) continue;
      const payload = record.payload.subarray(record.inner.payloadStart);
      const ast = parseRp9Payload(payload, record.inner.strings);
      assert.deepEqual(encodeRp9Payload(ast.roots, record.inner.strings), payload);
      roundTrips++;
    }
    assert.ok(roundTrips > 0);
    execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', input, destination], { stdio: 'inherit' });
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--project', join(destination, 'react/tsconfig.json')], { stdio: 'inherit' });
    const project = JSON.parse(readFileSync(join(destination, 'project.json'), 'utf8'));
    assert.ok(project.pages.length > 0);
    const comparisons: unknown[] = [];
    const sampleErrors: string[] = [];
    for (const definition of project.pages) {
      const shots: Buffer[] = [];
      for (const renderer of ['html', 'react']) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
        try {
          page.on('pageerror', error => sampleErrors.push(`${definition.file}/${renderer}: ${error.message}`));
          await page.goto(pathToFileURL(join(destination, renderer === 'react' ? 'react' : '', definition.file)).href);
          if (definition.widgets.length) await page.locator(`#${definition.widgets[0].id}`).waitFor({ state: 'attached' });
          await page.evaluate(() => document.fonts.ready);
          assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), `${definition.file}/${renderer}: broken emitted image`);
          shots.push(await page.screenshot({ path: join(destination, `${renderer}-${definition.file}.png`), fullPage: true, animations: 'disabled' }));
        } finally { await page.close(); }
      }
      const [html, react] = shots.map(s => PNG.sync.read(s));
      assert.deepEqual([html.width, html.height], [react.width, react.height]);
      let differentPixels = 0;
      for (let i = 0; i < html.data.length; i += 4) {
        if (!html.data.subarray(i, i + 4).equals(react.data.subarray(i, i + 4))) differentPixels++;
      }
      comparisons.push({ page: definition.file, width: html.width, height: html.height, differentPixels });
    }
    const report = {
      sample: basename(input), sha256: native.sha256, roundTrips, stats: project.stats,
      conversionIssues: project.issues, comparisons, errors: sampleErrors,
      scope: 'HTML versus React in the same browser; not native Axure screenshot parity',
    };
    writeFileSync(join(destination, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
    assert.deepEqual(sampleErrors, []);
    assert.ok(comparisons.every(c => (c as { differentPixels: number }).differentPixels === 0), `${filename}: renderer screenshots differ; see validation.json`);
    console.log(JSON.stringify({ sample: report.sample, roundTrips, stats: project.stats, pagesCompared: comparisons.length }));
  }
} finally {
  await browser.close();
}
