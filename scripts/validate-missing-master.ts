import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { convertRp9 } from '../src/convert.ts';
import { emitProject } from '../src/emit.ts';
import { missingMasterFile, instanceGuids, instanceNames, masterGuid } from '../tests/fixtures/missing-master.ts';

const output = resolve('output/missing-master-check');
mkdirSync(output, { recursive: true });
for (const includeMaster of [false, true]) {
  const bytes = missingMasterFile({ includeMaster }), { project, assets } = convertRp9(bytes);
  writeFileSync(join(output, includeMaster ? 'resolved.rp' : 'missing.rp'), bytes);
  await emitProject(project, assets, join(output, includeMaster ? 'resolved' : 'missing'), 'authored-master-fixture.rp');
}
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
});
const errors: string[] = [], results: unknown[] = [], screenshots: Buffer[] = [];
try {
  for (const renderer of ['html', 'react']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1500 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(`${renderer}: ${error.message}`));
    const url = (state: string) => pathToFileURL(join(output, state, renderer === 'react' ? 'react' : '', 'page-1.html')).href;
    await page.goto(url('missing'), { waitUntil: 'networkidle' });
    for (const [i, id] of instanceGuids.entries()) {
      const widget = page.locator(`#w-${id}`);
      if (i === 2) { assert.equal(await widget.isVisible(), false); continue; }
      assert.equal(await widget.isVisible(), true);
      const expected = { x: 20, y: [20, 1400, 1460, 1440][i], width: i === 0 ? 1210 : 362, height: i === 0 ? 1362 : 22 };
      assert.deepEqual(await widget.boundingBox(), expected);
      assert.equal(await widget.textContent(), `Missing master: ${instanceNames[i] || masterGuid}`);
      assert.equal(await widget.evaluate(el => getComputedStyle(el).borderStyle), 'dashed');
      const textBox = await widget.locator('.rp-text p').boundingBox();
      assert.ok(textBox && textBox.height > 0 && textBox.y >= expected.y && textBox.y + textBox.height <= expected.y + expected.height, 'label fits even in a 22px instance');
    }
    assert.equal(await page.locator('content').count(), 0, 'instance names are text, not HTML');
    const bounds = await page.locator('.rp-page').boundingBox();
    assert.equal(bounds?.width, 1230); assert.equal(bounds?.height, 1462);
    await page.evaluate(() => document.fonts.ready);
    const screenshot = await page.screenshot({ path: join(output, `${renderer}.png`), fullPage: true });
    screenshots.push(screenshot);
    const png = PNG.sync.read(screenshot), pixel = (200 * png.width + 30) * 4;
    assert.deepEqual([...png.data.subarray(pixel, pixel + 4)], [255, 247, 237, 255], 'the missing region is visibly painted');
    await page.goto(url('resolved'), { waitUntil: 'networkidle' });
    const master = page.locator(`#w-${instanceGuids[0]}`), input = master.locator('input');
    assert.equal(await input.inputValue(), 'Master content');
    await input.fill('Edited master'); assert.equal(await input.inputValue(), 'Edited master');
    assert.equal((await master.boundingBox())?.width, 0, 'available master retains group hit geometry');
    assert.equal(await page.getByText('Missing master:', { exact: false }).count(), 0);
    results.push({ renderer, originalGeometry: true, dashedBorder: true, visibleText: true, hiddenPreserved: true, pageBounds: true, validMasterEditable: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  const [html, react] = screenshots.map(s => PNG.sync.read(s));
  assert.deepEqual([html.width, html.height], [react.width, react.height]);
  let differentPixels = 0;
  for (let i = 0; i < html.data.length; i += 4) if (!html.data.subarray(i, i + 4).equals(react.data.subarray(i, i + 4))) differentPixels++;
  assert.equal(differentPixels, 0, 'full HTML and React screenshots match exactly');
  const validation = { fixture: 'authored RP9 binary, not native Axure output', results, errors, differentPixels };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(JSON.stringify(validation, null, 2));
} finally { await browser.close(); }
