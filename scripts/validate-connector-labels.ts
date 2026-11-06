import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { connectorLabelsFile, labelCases, connectorId } from '../tests/fixtures/connector-labels.ts';

const output = resolve('output/connector-labels-check');
mkdirSync(output, { recursive: true });
const input = join(output, 'native-labels.rpteam');
writeFileSync(input, connectorLabelsFile());
execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', input, output], { stdio: 'inherit' });
assert.deepEqual(JSON.parse(readFileSync(join(output, 'conversion-report.json'), 'utf8')).issues, []);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-gpu'] });
const errors: string[] = [], comparisons: unknown[] = [];
try {
  for (const dpr of [1, 2]) for (const zoom of [1, 1.25]) {
    const shots: Buffer[] = [];
    for (const renderer of ['html', 'react']) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr });
      try {
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(join(output, renderer === 'react' ? 'react/page-1.html' : 'page-1.html')).href);
        await page.locator(`#${connectorId(0)} .rp-text`).waitFor();
        await page.evaluate(z => { document.documentElement.style.zoom = String(z); }, zoom);
        await page.evaluate(() => document.fonts.ready);
        for (const [i, c] of labelCases.entries()) {
          const widget = page.locator(`#${connectorId(i)}`), text = widget.locator('.rp-text');
          assert.equal(await widget.locator('svg.ax-vector > path').count(), 1);
          if (!c.text) { assert.equal(await text.count(), 0); continue; }
          assert.equal(await text.textContent(), c.text);
          const box = await text.boundingBox(); assert.ok(box);
          assert.ok(Math.abs(box.x + box.width / 2 - c.anchor[0] * zoom) < 0.05, `${c.name}: label x`);
          assert.ok(Math.abs(box.y + box.height / 2 - c.anchor[1] * zoom) < 0.05, `${c.name}: label y`);
          // Compare the rendered path against the text panel, not the widget box.
          const distance = await widget.evaluate(element => {
            const text = element.querySelector('.rp-text')!.getBoundingClientRect();
            const path = element.querySelector<SVGPathElement>('svg.ax-vector > path')!;
            const length = path.getTotalLength(), matrix = path.getScreenCTM()!;
            let min = Infinity;
            for (let step = 0; step <= 2000; step++) {
              const point = path.getPointAtLength(length * step / 2000).matrixTransform(matrix);
              min = Math.min(min, Math.hypot(point.x - text.x - text.width / 2, point.y - text.y - text.height / 2));
            }
            return min;
          });
          assert.ok(distance < 0.6 * zoom, `${c.name}: label is ${distance}px off its rendered path`);
        }
        const runs = await page.locator(`#${connectorId(4)} .rp-text span`).evaluateAll(elements => elements.map(e => ({ color: getComputedStyle(e).color, weight: getComputedStyle(e).fontWeight })));
        assert.deepEqual(runs, [{ color: 'rgb(204, 0, 0)', weight: '700' }, { color: 'rgb(0, 0, 204)', weight: '400' }]);
        shots.push(await page.screenshot({ path: join(output, `${renderer}-zoom${zoom}-dpr${dpr}.png`), fullPage: true }));
      } finally { await page.close(); }
    }
    const [a, b] = shots.map(s => PNG.sync.read(s));
    assert.deepEqual([a.width, a.height], [b.width, b.height]);
    let differentPixels = 0;
    for (let i = 0; i < a.data.length; i += 4) if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) differentPixels++;
    assert.equal(differentPixels, 0);
    comparisons.push({ zoom, dpr, labels: labelCases.filter(c => c.text).length, differentPixels });
  }
  assert.deepEqual(errors, []);
  const report = { fixture: 'authored native RP9 records, not a paired Axure export', comparisons, errors };
  writeFileSync(join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally { await browser.close(); }
