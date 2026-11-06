import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProject } from '../src/graph.ts';
import { convertRp9 } from '../src/convert.ts';
import { parseRp9Payload, encodeRp9Payload } from '../src/parser/rp9-payload.ts';
import { rpteamSamples, readRpteamSample } from './fixtures/rpteam-samples.ts';

for (const sample of rpteamSamples) {
  test(`public team fixture: ${sample.file}`, () => {
    const bytes = readRpteamSample(sample);
    if (!sample.expected) {
      assert.equal(bytes.subarray(0, 8).toString('hex'), sample.unsupportedHeader);
      assert.throws(() => convertRp9(bytes), /unrecognized Axure container/);
      return;
    }
    const native = parseProject(bytes);
    assert.equal(native.records.length, sample.expected.records);
    assert.ok(native.records.every(r => r.references.every(ref => ref.path[0] === 'WorkingCopy')));
    let roundTrips = 0;
    for (const record of native.records) {
      if (!record.inner) continue;
      const payload = record.payload.subarray(record.inner.payloadStart);
      const ast = parseRp9Payload(payload, record.inner.strings);
      assert.deepEqual(encodeRp9Payload(ast.roots, record.inner.strings), payload);
      roundTrips++;
    }
    assert.equal(roundTrips, sample.expected.roundTrips);
    const { project } = convertRp9(bytes);
    assert.deepEqual(project.stats, sample.expected.stats);
    assert.deepEqual(project.pages.filter(p => p.widgets.length === 0).map(p => p.file), sample.expected.emptyPages);
    const issueCounts: Record<string, number> = {};
    for (const issue of project.issues) issueCounts[issue.feature] = (issueCounts[issue.feature] ?? 0) + 1;
    assert.deepEqual(issueCounts, sample.expected.issueCounts);
  });
}
