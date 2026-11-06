import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { directoryFixture } from '../tests/fixtures/page-directory.ts';
import type { Project } from '../src/model.ts';

const output = resolve('output/page-directory-check');
mkdirSync(output, { recursive: true });
const authored = join(output, 'directory.rpteam');
writeFileSync(authored, directoryFixture());
const inputs = [['authored', authored], ['real', 'tests/fixtures/rpteam/706platform.rpteam']];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--disable-gpu'] });
const errors: string[] = [], results: unknown[] = [];
try {
  for (const [sample, input] of inputs) {
    const directory = join(output, sample);
    execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', input, directory], { stdio: 'inherit' });
    const project: Project = JSON.parse(readFileSync(join(directory, 'project.json'), 'utf8'));
    for (const renderer of ['html', 'react']) {
      const root = renderer === 'react' ? join(directory, 'react') : directory;
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      page.on('pageerror', e => errors.push(`${sample}/${renderer}: ${e.message}`));
      try {
        await page.goto(pathToFileURL(join(root, 'index.html')).href);
        const nav = page.getByRole('navigation', { name: '页面目录' });
        const firstName = sample === 'real' ? '工程规范文档' : '首页';
        const first = project.pages.find(p => p.name === firstName)!;
        assert.equal(await nav.getByRole('link').first().textContent(), firstName);
        assert.equal(await page.locator('iframe').getAttribute('src'), first.file);
        const frame = page.frameLocator('iframe');
        await frame.locator('.rp-page').waitFor();
        assert.equal(await frame.locator('title').textContent(), first.name + (renderer === 'react' ? ' · React' : ''));
        const topNames = await nav.locator(':scope > ul > li').evaluateAll(nodes => nodes.map(n => n.querySelector(':scope > a, :scope > details > summary > a, :scope > details > summary > .folder, :scope > .folder')?.textContent));
        assert.deepEqual(topNames, sample === 'real' ? ['工程规范文档', '官网首页', '广场', '圈子', '活动', '居住', '个人主页', '弃用版本'] : ['首页', '文件夹 <&>', '未收录页']);
        if (sample === 'real') {
          const activity = nav.locator('details').filter({ has: page.locator(':scope > summary > a', { hasText: /^活动$/ }) });
          const detail = activity.locator('details').filter({ has: page.locator(':scope > summary > a', { hasText: /^活动详情$/ }) });
          assert.deepEqual(await detail.locator(':scope > ul > li > a').allTextContents(), ['报名登录页面', '支付页面']);
        }
        await page.screenshot({ path: join(directory, `${renderer}-initial.png`) });
        const duplicateName = sample === 'real' ? '圈子' : '同名';
        const duplicates = nav.getByRole('link', { name: duplicateName, exact: true });
        assert.equal(await duplicates.count(), 2);
        const targets: string[] = [];
        for (let i = 0; i < 2; i++) {
          const link = duplicates.nth(i), file = (await link.getAttribute('href'))!;
          targets.push(file);
          await link.click();
          const child = page.frames().find(f => f.parentFrame());
          assert.ok(child); await child.waitForURL('**/' + file);
          await frame.locator('.rp-page').waitFor();
          assert.equal(await link.getAttribute('aria-current'), 'page');
          assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
        }
        assert.notEqual(targets[0], targets[1], 'same-name pages must retain distinct destinations');
        const folder = nav.locator('summary').filter({ hasText: sample === 'real' ? /^弃用版本$/ : /^文件夹 <&>$/ });
        await folder.click();
        assert.equal(await duplicates.nth(1).isVisible(), false);
        await folder.click();
        assert.equal(await duplicates.nth(1).isVisible(), true);
        assert.equal(await nav.getByRole('link').count(), project.pages.length);
        await page.screenshot({ path: join(directory, `${renderer}-directory.png`) });
        results.push({ sample, renderer, pages: project.pages.length, hierarchy: true, initialPage: firstName, distinctTargets: targets });
      } finally { await page.close(); }
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'validation.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
  console.log({ results, errors });
} finally { await browser.close(); }
