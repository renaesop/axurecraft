import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { connectorLabelsFile, connectorId, labelCases } from '../tests/fixtures/connector-labels.ts';

const output = resolve('output/connector-label-states-check');
mkdirSync(output, { recursive: true });
const cases = [
  ...['horizontal', 'vertical', 'zero-length'].map(only => ({ name: only, only, appearances: false, state: undefined })),
  ...([undefined, 'selected', 'disabled'] as const).map(state => ({ name: state ?? 'pointer', only: 'elbow', appearances: true, state })),
];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-gpu'] });
const errors: string[] = [], results: unknown[] = [];
try {
  for (const fixture of cases) {
    const directory = join(output, fixture.name);
    mkdirSync(directory, { recursive: true });
    const input = join(directory, 'authored.rpteam');
    writeFileSync(input, connectorLabelsFile(true, fixture));
    execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', input, directory], { stdio: 'inherit' });
    const id = connectorId(labelCases.findIndex(c => c.name === fixture.only));
    const screenshots: Buffer[][] = [];
    for (const renderer of ['html', 'react']) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
      page.on('pageerror', error => errors.push(`${fixture.name}/${renderer}: ${error.message}`));
      try {
        await page.goto(pathToFileURL(join(directory, renderer === 'react' ? 'react/page-1.html' : 'page-1.html')).href);
        await page.locator(`#${id} .rp-text`).waitFor();
        await page.evaluate(() => document.fonts.ready);
        const shots: Buffer[] = [];
        const screenshot = async (state: string) => shots.push(await page.screenshot({ path: join(directory, `${renderer}-${state}.png`), fullPage: true }));
        const checkPaint = async (stroke: string, width: number) => {
          await page.waitForFunction(({ id, stroke, width }) => {
            const path = document.querySelector(`#${id} svg.ax-vector > path`);
            return path?.getAttribute('stroke') === stroke && Number(path.getAttribute('stroke-width')) === width;
          }, { id, stroke, width });
          const text = page.locator(`#${id} .rp-text`);
          assert.equal(await text.textContent(), '否');
          const box = await text.boundingBox(); assert.ok(box);
          assert.deepEqual([box.x + box.width / 2, box.y + box.height / 2], [200, 260]);
          const marker = await page.locator(`#${id} svg.ax-vector > path`).getAttribute('marker-end');
          assert.ok(marker?.startsWith('url(#'));
          const markerId = marker.slice(5, -1);
          assert.equal(await page.locator(`[id="${markerId}"]`).count(), 1);
          assert.equal(await page.locator(`[id="${markerId}"] path`).getAttribute('stroke'), stroke);
        };
        if (fixture.appearances) {
          const initial = fixture.state === 'selected' ? ['#008000', 5] as const : fixture.state === 'disabled' ? ['#999999', 6] as const : ['#333333', 2] as const;
          await checkPaint(...initial); await screenshot('initial');
          await page.mouse.move(100, 260);
          await checkPaint(...(fixture.state ? initial : ['#cc0000', 3] as const)); await screenshot('hover');
          await page.mouse.down();
          await checkPaint(...(fixture.state ? initial : ['#0000cc', 4] as const)); await screenshot('pressed');
          await page.mouse.up();
          await checkPaint(...(fixture.state ? initial : ['#cc0000', 3] as const));
          await page.mouse.move(990, 790);
          await checkPaint(...initial); await screenshot('restored');
        } else {
          const bounds = await page.locator('.rp-page').boundingBox(), text = await page.locator(`#${id} .rp-text`).boundingBox();
          assert.ok(bounds && text);
          assert.ok(text.x >= bounds.x && text.x + text.width <= bounds.x + bounds.width, fixture.name + ': horizontally clipped text');
          assert.ok(text.y >= bounds.y && text.y + text.height <= bounds.y + bounds.height, fixture.name + ': vertically clipped text');
          await screenshot('bounds');
        }
        screenshots.push(shots);
      } finally { await page.close(); }
    }
    assert.equal(screenshots[0].length, screenshots[1].length);
    for (const [i, shot] of screenshots[0].entries()) {
      const a = PNG.sync.read(shot), b = PNG.sync.read(screenshots[1][i]);
      assert.deepEqual([a.width, a.height], [b.width, b.height]);
      assert.ok(a.data.equals(b.data), `${fixture.name}/${i}: HTML and React pixels differ`);
    }
    results.push({ fixture: fixture.name, comparedStates: screenshots[0].length, differentPixels: 0 });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'validation.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
  console.log({ results, errors });
} finally { await browser.close(); }
