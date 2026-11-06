import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertRp9 } from '../src/convert.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import { directoryFixture } from './fixtures/page-directory.ts';
import { rpteamSamples, readRpteamSample } from './fixtures/rpteam-samples.ts';

for (const team of [false, true]) test(`native ${team ? 'rpteam' : 'rp'} directory preserves hierarchy and sibling order independently of storage`, () => {
  const { project } = convertRp9(directoryFixture(team));
  const tree = project.pageTree;
  assert.ok(tree, 'native sitemap must be retained');
  assert.deepEqual(tree.map((n) => n.name), ['首页', '文件夹 <&>', '未收录页']);
  assert.equal(tree[0].children[0].name, '同名');
  assert.equal(tree[1].children[0].name, '同名');
  assert.notEqual(tree[0].children[0].pageId, tree[1].children[0].pageId);
  assert.equal(tree[1].pageId, undefined);
  assert.equal(project.pages.find(p => p.id === tree[0].pageId)!.file, 'page-3.html');
  assert.deepEqual(project.issues, []);
  assert.deepEqual(parseSemanticProject(JSON.stringify(project)), project);
});

test('real 706 sitemap keeps folders, nested pages and author order', () => {
  const { project } = convertRp9(readRpteamSample(rpteamSamples.find(s => s.file === '706platform.rpteam')!));
  const tree = project.pageTree;
  assert.ok(tree, 'real sitemap must be retained');
  assert.deepEqual(tree.map((n) => n.name), ['工程规范文档', '官网首页', '广场', '圈子', '活动', '居住', '个人主页', '弃用版本']);
  assert.deepEqual(tree[0].children.map((n) => n.name), ['test', '使用流程图']);
  assert.deepEqual(tree[4].children[1].children.map((n) => n.name), ['报名登录页面', '支付页面']);
  assert.equal(tree[7].children[0].name, '圈子');
  assert.notEqual(tree[3].pageId, tree[7].children[0].pageId);
});

test('broken native sitemap branches are diagnosed without losing unrelated pages', () => {
  const { project } = convertRp9(directoryFixture(true, true));
  assert.equal(project.issues.filter(i => i.feature === 'page-directory').length, 2);
  assert.deepEqual(project.pageTree!.map(n => n.name), ['首页', '文件夹 <&>', '未收录页']);
  assert.equal(project.pageTree![0].children[0].name, '同名');
  assert.deepEqual(parseSemanticProject(JSON.stringify(project)), project);
});

test('semantic directory validates targets, uniqueness and completeness while accepting legacy projects', () => {
  const { project } = convertRp9(directoryFixture());
  const legacy = structuredClone(project); delete legacy.pageTree;
  assert.deepEqual(parseSemanticProject(JSON.stringify(legacy)), legacy);
  for (const edit of [
    (p: typeof project) => { p.pageTree![0].pageId = 'missing'; },
    (p: typeof project) => { p.pageTree![0].children[0].pageId = p.pageTree![0].pageId; },
    (p: typeof project) => { p.pageTree![1].id = p.pageTree![0].id; },
    (p: typeof project) => { p.pageTree!.pop(); },
    (p: typeof project) => { p.pageTree![1].children = null as never; },
  ]) {
    const invalid = structuredClone(project); edit(invalid);
    assert.throws(() => parseSemanticProject(JSON.stringify(invalid)), /Invalid semantic project.*pageTree/);
  }
});
