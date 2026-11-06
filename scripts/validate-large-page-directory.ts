import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import type { Project } from '../src/model.ts';

const output = resolve('output/large-page-directory-check');
execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'tests/fixtures/rp/b2c-platform.rp', output], { stdio: 'inherit' });
const project: Project = JSON.parse(readFileSync(join(output, 'project.json'), 'utf8'));
const expected: [number, string, string | null][] = JSON.parse(readFileSync('tests/fixtures/rp/b2c-directory.json', 'utf8'));
const deepest = expected.find(row => row[0] === 11 && row[2])!;
assert.ok(deepest);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-gpu'] });
const errors: string[] = [], results: unknown[] = [];
try {
  for (const renderer of ['html', 'react']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', error => errors.push(`${renderer}: ${error.message}`));
    try {
      await page.goto(pathToFileURL(join(output, renderer === 'react' ? 'react/index.html' : 'index.html')).href);
      const nav = page.getByRole('navigation', { name: '页面目录' });
      await page.frameLocator('iframe').locator('.rp-page').waitFor();
      const actual = await nav.evaluate(nav => Array.from(nav.querySelectorAll('li'), li => {
        let depth = 0, parent = li.parentElement;
        while (parent && parent !== nav) { if (parent.tagName === 'UL') depth++; parent = parent.parentElement; }
        const label = li.querySelector(':scope > a, :scope > .folder, :scope > details > summary > a, :scope > details > summary > .folder')!;
        return [depth, label.textContent!, label.getAttribute('data-page-id')] as [number, string, string | null];
      }));
      assert.deepEqual(actual, expected, renderer + ': all 243 entries must retain native order, nesting and GUID');
      const first = project.pages.find(p => p.id === expected[0][2])!;
      assert.equal(await page.locator('iframe').getAttribute('src'), first.file);
      await page.screenshot({ path: join(output, `${renderer}-initial.png`) });
      const openPage = async (id: string) => {
        const target = project.pages.find(p => p.id === id)!;
        const link = nav.locator(`a[data-page-id="${id}"]`);
        await link.click();
        const frame = page.frames().find(f => f.parentFrame()); assert.ok(frame);
        await frame.waitForURL('**/' + target.file);
        await frame.locator('.rp-page').waitFor();
        assert.equal(await frame.title(), target.name + (renderer === 'react' ? ' · React' : ''));
        assert.equal(await link.getAttribute('aria-current'), 'page');
      };
      await openPage(deepest[2]!);
      await page.screenshot({ path: join(output, `${renderer}-deepest.png`) });
      const link = nav.locator(`a[data-page-id="${deepest[2]}"]`);
      const textLines = await link.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        return range.getClientRects().length;
      });
      assert.equal(textLines, 1, 'deep directory labels must remain readable on one line');
      const folder = link.locator('xpath=ancestor::details[1]');
      await folder.locator(':scope > summary').press('Enter');
      assert.equal(await link.isVisible(), false);
      await folder.locator(':scope > summary').press('Enter');
      assert.equal(await link.isVisible(), true);
      const duplicates = expected.filter(row => row[1] === '收货地址' && row[2]);
      assert.equal(duplicates.length, 2);
      for (const row of duplicates) await openPage(row[2]!);
      results.push({ renderer, directoryEntries: actual.length, pages: project.pages.length, folders: actual.filter(r => !r[2]).length, maxDepth: Math.max(...actual.map(r => r[0])), deepestPage: deepest[1], duplicateLinks: duplicates.map(row => row[2]) });
    } finally { await page.close(); }
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'validation.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
  console.log({ results, errors });
} finally { await browser.close(); }
