import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { emitProject } from '../src/emit.ts';
import { parseSemanticProject } from '../src/semantic.ts';

const output = resolve('output/react-devtools-check');
mkdirSync(output, { recursive: true });
const project = parseSemanticProject(readFileSync('examples/hello.project.json', 'utf8'));
project.pages[0].behaviors.push({ event: 'click', actions: [{ kind: 'set-text', target: 'demo-caption', expression: { kind: 'literal', value: 'Page clicked' } }] });
const second = structuredClone(project.pages[0]); second.id = 'second'; second.name = 'Second'; second.file = 'page-2.html';
project.pages.push(second);
await emitProject(project, new Map(), output);
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname);
  const file = resolve(output, '.' + pathname);
  if (!file.startsWith(output + '/')) { response.writeHead(404).end(); return; }
  try { response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); response.end(readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert.ok(address && typeof address !== 'string');
const bases = [pathToFileURL(join(output, 'react/index.html')).href, `http://127.0.0.1:${address.port}/react/index.html`];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
// A test-only DevTools hook. Application output must never install or replace it.
await page.addInitScript(() => {
  const state = { renderer: null as any, root: null as any, commits: 0 };
  (window as any).__devtoolsProbe = state;
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject(renderer: any) { state.renderer = renderer; return 1; },
    onCommitFiberRoot(_id: number, root: any) { state.root = root; state.commits++; },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
});
const results: unknown[] = [];
try {
  for (const base of bases) {
    await page.goto(base);
    await page.waitForLoadState('load');
    assert.equal(await page.locator('iframe').count(), 0, 'React index must render the prototype in the top-level document');
    await page.locator('.rp-page').waitFor();
    await page.waitForFunction(() => (window as any).__devtoolsProbe.root);
    const result = await page.evaluate(() => {
      const probe = (window as any).__devtoolsProbe, names: string[] = [], pending = [probe.root.current];
      while (pending.length) { const fiber = pending.pop(); if (!fiber) continue; if (typeof fiber.type === 'function') names.push(fiber.type.displayName || fiber.type.name); pending.push(fiber.child, fiber.sibling); }
      return { version: probe.renderer.version, names, commits: probe.commits };
    });
    assert.ok(result.names.includes('PrototypePage')); assert.ok(result.names.includes('RpWidget'));
    const caption = await page.locator('#demo-caption').textContent();
    const toggle = page.getByRole('button', { name: '页面目录', exact: true });
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#demo-caption').textContent(), caption, 'directory controls must not trigger prototype page actions');
    // Exercise the exact renderer editing entry points exposed to DevTools.
    await page.evaluate(() => {
      const probe = (window as any).__devtoolsProbe, pending = [probe.root.current];
      while (pending.length) { const f = pending.pop(); if (!f) continue;
        if (f.type?.name === 'RpWidget' && f.memoizedProps.id === 'demo-title') { probe.renderer.overrideProps(f, ['name'], 'Edited in DevTools'); return; }
        pending.push(f.child, f.sibling);
      }
      throw new Error('Inspectable widget missing');
    });
    await page.waitForFunction(() => document.querySelector('#demo-title')?.getAttribute('data-name') === 'Edited in DevTools');
    await page.evaluate(() => {
      const probe = (window as any).__devtoolsProbe, pending = [probe.root.current];
      while (pending.length) { const f = pending.pop(); if (!f) continue;
        if (f.type?.name === 'PrototypePreview') { probe.renderer.overrideHookState(f, 0, [], false); return; }
        pending.push(f.child, f.sibling);
      }
      throw new Error('Inspectable preview state missing');
    });
    await page.waitForFunction(() => document.querySelector('#rp-preview-directory')?.hasAttribute('hidden'));
    assert.deepEqual(await page.locator('#demo-title').boundingBox(), { x: 48, y: 48, width: 540, height: 56 });
    await page.locator('#demo-button').click();
    await page.waitForFunction(() => document.querySelector('#demo-status')?.textContent?.includes('Selected'));
    await page.evaluate(() => {
      const probe = (window as any).__devtoolsProbe, pending = [probe.root.current];
      while (pending.length) { const f = pending.pop(); if (!f) continue;
        if (f.type?.name === 'PrototypePreview') { probe.renderer.overrideHookState(f, 0, [], true); return; }
        pending.push(f.child, f.sibling);
      }
      throw new Error('Inspectable preview state missing');
    });
    await page.waitForFunction(() => !document.querySelector('#rp-preview-directory')?.hasAttribute('hidden'));
    await page.getByRole('link', { name: 'Second', exact: true }).click();
    await page.waitForURL(url => url.searchParams.get('page') === 'page-2.html');
    await page.waitForFunction(() => (window as any).__devtoolsProbe.root);
    assert.equal(await page.title(), 'Second · React');
    assert.equal(await page.locator('[aria-current=page]').textContent(), 'Second');
    assert.equal(await page.locator('#demo-title').getAttribute('data-name'), 'Title', 'props must reset on a new page');
    await page.goBack();
    await page.waitForFunction(() => document.title === 'AxureCraft · React' && (window as any).__devtoolsProbe.root);
    await page.goForward();
    await page.waitForFunction(() => document.title === 'Second · React' && (window as any).__devtoolsProbe.root);
    await page.reload(); await page.waitForFunction(() => (window as any).__devtoolsProbe.root);
    assert.equal(await page.title(), 'Second · React');
    await page.goto(base + '?page=constructor'); await page.locator('.rp-page').waitFor();
    assert.equal(await page.title(), 'AxureCraft · React', 'unknown query must select a real default page');
    await page.goto(new URL('page-2.html', base).href); await page.locator('.rp-page').waitFor();
    await page.waitForFunction(() => (window as any).__devtoolsProbe.root);
    assert.equal(await page.locator('.rp-preview-tools').count(), 0, 'standalone pages keep their original layout');
    results.push({ protocol: new URL(base).protocol, ...result, editProps: true, editHookState: true, interaction: true, history: true, reload: true, directPage: true });
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'validation.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
  console.log({ results, errors });
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
