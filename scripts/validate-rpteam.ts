import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { teamFile, workingCopyEntries, widgetGuid } from '../tests/fixtures/rpteam.ts';

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
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
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
} finally {
  await browser.close();
}
