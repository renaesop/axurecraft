import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const errors = [];
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
  page.on('pageerror', error => errors.push(error.message));
  for (const renderer of ['html', 'react']) {
    const root = renderer === 'html' ? 'output/demo' : 'output/demo/react';
    await page.goto(pathToFileURL(resolve(root, 'page-1.html')).href);
    const button = page.locator('#demo-button');
    const status = page.locator('#demo-status');
    await button.waitFor();
    assert.match(await status.innerText(), /^Ready/);
    await button.click();
    await page.waitForFunction(() => document.getElementById('demo-status').textContent.startsWith('Selected'));
    assert.equal(await button.getAttribute('aria-selected'), 'true');
    assert.equal(await button.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(67, 56, 202)');
    await button.click();
    await page.waitForFunction(() => document.getElementById('demo-status').textContent.startsWith('Ready'));
    assert.equal(await button.getAttribute('aria-selected'), 'false');
    assert.equal(await button.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(224, 231, 255)');
    await page.evaluate(() => document.fonts.ready);
    if (renderer === 'react') {
      mkdirSync('docs', { recursive: true });
      await page.locator('.rp-page').screenshot({ path: process.env.UPDATE_DEMO_SCREENSHOT === '1' ? 'docs/demo.png' : 'output/demo/react.png' });
    }
    results.push({ renderer, actualPointerToggle: true, appearanceAndTextRestored: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync('output/demo/validation.json', JSON.stringify({ results, errors }, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
