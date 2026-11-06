import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convertRp9 } from '../src/convert.ts';
import type { PageTreeNode } from '../src/model.ts';
import { parseSemanticProject } from '../src/semantic.ts';

test('public B2C RP preserves all 175 pages and 68 folders in native order through 11 levels', () => {
  const source = JSON.parse(readFileSync(new URL('./fixtures/rp/b2c-source.json', import.meta.url), 'utf8'));
  const bytes = readFileSync(new URL('./fixtures/rp/b2c-platform.rp', import.meta.url));
  assert.equal(bytes.length, source.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  const expected = JSON.parse(readFileSync(new URL('./fixtures/rp/b2c-directory.json', import.meta.url), 'utf8'));
  const { project } = convertRp9(bytes), rows: unknown[] = [];
  const visit = (nodes: PageTreeNode[], depth = 1) => { for (const n of nodes) { rows.push([depth, n.name, n.pageId ?? null]); visit(n.children, depth + 1); } };
  assert.ok(project.pageTree, 'native directory missing'); visit(project.pageTree);
  assert.deepEqual(rows, expected, 'every parent, sibling position, name and page target must match the saved sitemap');
  assert.equal(project.pages.length, 175);
  assert.equal(project.pageTree[0].name, '电商平台框架图');
  assert.equal(project.pages[0].name, '收货地址', 'storage order deliberately differs from directory order');
  assert.deepEqual(project.issues.filter(i => i.feature === 'page-directory'), []);
  assert.deepEqual(parseSemanticProject(JSON.stringify(project)).pageTree, project.pageTree);
});
