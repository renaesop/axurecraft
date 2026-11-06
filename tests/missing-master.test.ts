import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertRp9 } from '../src/convert.ts';
import { widgetStyle } from '../src/render-tree.ts';
import { widgetHtml } from '../src/html.ts';
import { pageToJsx } from '../src/jsx.ts';
import { parseSemanticProject } from '../src/semantic.ts';
import { missingMasterFile, masterGuid, instanceGuids, instanceNames } from './fixtures/missing-master.ts';

test('missing master diagnostics identify every instance and the referenced GUID', () => {
  const { project } = convertRp9(missingMasterFile());
  assert.equal(project.issues.length, 4);
  project.issues.forEach((issue, i) => {
    assert.equal(issue.feature, 'master-reference');
    assert.equal(issue.widget, `w-${instanceGuids[i]}`);
    assert.ok(issue.detail.includes(masterGuid));
    assert.ok(issue.detail.includes(JSON.stringify(instanceNames[i] || `w-${instanceGuids[i]}`)));
  });
});

test('missing masters preserve authored dimensions, paint placeholders and contribute to page bounds', () => {
  const { project } = convertRp9(missingMasterFile());
  const [large, small, hidden, unnamed] = project.pages[0].widgets;
  assert.deepEqual([large.x, large.y, large.width, large.height], [20, 20, 1210, 1362]);
  assert.deepEqual([small.x, small.y, small.width, small.height], [20, 1400, 362, 22]);
  assert.equal(large.kind, 'unsupported');
  assert.equal(widgetStyle(large).width, '1210px');
  assert.equal(widgetStyle(small).height, '22px');
  assert.match(large.css.border, /dashed/);
  assert.deepEqual([project.pages[0].width, project.pages[0].height], [1230, 1462]);
  for (const widget of [large, small, hidden, unnamed]) {
    assert.equal(widget.type, 'ReferenceDiagramObject');
    assert.equal(widget.content[0].kind, 'text');
    assert.equal(widget.children, undefined);
  }
  assert.equal(hidden.css.display, 'none', 'an authored hidden instance must stay hidden');
  assert.ok(unnamed.content[0].kind === 'text' && unnamed.content[0].paragraphs[0].runs[0].text.includes(masterGuid));
  assert.deepEqual(parseSemanticProject(JSON.stringify(project)), project);
});

test('placeholder names render as escaped text in both exports', () => {
  const { project } = convertRp9(missingMasterFile());
  const html = widgetHtml(project.pages[0].widgets[0]), jsx = pageToJsx(project.pages[0]);
  assert.match(html, /Missing master:/);
  assert.match(html, /Main &lt;content&gt; &amp; &quot;details&quot;/);
  assert.doesNotMatch(html, /<content>/);
  assert.ok(jsx.includes(JSON.stringify(`Missing master: ${instanceNames[0]}`)));
});

test('missing GUID diagnostics use an explicit fallback without undefined text', () => {
  const { project } = convertRp9(missingMasterFile({ missingGuid: true }));
  assert.equal(project.issues.length, 4);
  for (const issue of project.issues) {
    assert.match(issue.detail, /unknown GUID/);
    assert.doesNotMatch(issue.detail, /undefined/);
  }
});

test('available masters still expand as groups without placeholder styling or diagnostics', () => {
  const { project } = convertRp9(missingMasterFile({ includeMaster: true }));
  assert.deepEqual(project.issues, []);
  for (const widget of project.pages[0].widgets) {
    assert.equal(widget.kind, 'group');
    assert.equal(widgetStyle(widget).width, '0px');
    assert.equal(widget.css.border, undefined);
    assert.deepEqual(widget.content, []);
    assert.equal(widget.children?.length, 1);
    assert.equal(widget.children[0].content[0].kind === 'control' && widget.children[0].content[0].value, 'Master content');
  }
});
