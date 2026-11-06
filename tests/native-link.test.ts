import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLinkTarget } from '../src/native-link.ts';
import { readBehaviors } from '../src/interactions.ts';
import type { ConversionIssue } from '../src/model.ts';
import { absentGuid, linkGraph, validGuid, value, zeroGuid } from './fixtures/native-link.ts';

test('zero GUID page links report an unset target even if a page map contains the sentinel', () => {
  const { graph, owner, target, pages } = linkGraph();
  for (const map of [pages, new Map([...pages, [zeroGuid, 'incorrect.html']])]) {
    assert.throws(() => readLinkTarget(graph, owner, target, map), { message: 'Link target page is not set' });
  }
});

test('missing nonzero page links retain an unresolved diagnostic containing the GUID', () => {
  const { graph, owner, target, pages } = linkGraph(absentGuid);
  assert.throws(() => readLinkTarget(graph, owner, target, pages), { message: `Target page could not be resolved: ${absentGuid}` });
  graph.guids.pop();
  assert.throws(() => readLinkTarget(graph, owner, target, pages), { message: 'Target page could not be resolved' });
  target.body = value({ 'target-type': 1 });
  assert.throws(() => readLinkTarget(graph, owner, target, pages), { message: 'Target page could not be resolved' });
});

test('valid page, external URL, refresh and back targets keep their existing behavior', () => {
  const { graph, owner, target, pages } = linkGraph(validGuid);
  assert.deepEqual(readLinkTarget(graph, owner, target, pages), { kind: 'link', value: 'page-2.html', includeVariables: true });
  for (const [kind, expected] of [[2, { kind: 'refresh', includeVariables: true }], [3, { kind: 'back' }]] as const) {
    target.body = value({ 'target-type': kind }); assert.deepEqual(readLinkTarget(graph, owner, target, pages), expected);
  }
  target.body = value({ 'target-type': 0, 'target-literal': 'https://example.test/path' });
  assert.deepEqual(readLinkTarget(graph, owner, target, pages), { kind: 'link', value: 'https://example.test/path' });
});

test('invalid native link actions are omitted without dropping valid following actions', () => {
  for (const [guid, message] of [[zeroGuid, 'Link target page is not set'], [absentGuid, `Target page could not be resolved: ${absentGuid}`]]) {
    for (const following of [false, true]) {
      const { graph, owner, pages } = linkGraph(guid, following), issues: ConversionIssue[] = [];
      assert.deepEqual(readBehaviors(graph, owner, pages, issues), following ? [{ event: 'click', actions: [
        { kind: 'wait', value: 1 }, { kind: 'link', value: 'page-2.html', includeVariables: true, navigation: 'current' },
      ] }] : []);
      assert.deepEqual(issues, [{ widget: `w-${graph.guids[0]}`, feature: 'interaction-action', detail: `Axure:InteractionLinkWindowAction: Error: ${message}` }]);
    }
  }
});
