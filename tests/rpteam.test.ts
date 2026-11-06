import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { parseRp9Container } from '../src/parser/rp9-container.ts';
import { parseProject } from '../src/graph.ts';
import { convertRp9 } from '../src/convert.ts';
import { teamFile, workingCopyEntries, nativeRecord, PAGE_SIZE, PAGE_DATA, widgetGuid } from './fixtures/rpteam.ts';

test('RP9 team project follows noncontiguous chains and converts only WorkingCopy', () => {
  const entries = workingCopyEntries(), bytes = teamFile(entries);
  assert.ok(bytes.readUInt16LE(4088) > 1, 'directory continuation is noncontiguous');
  const parsed = parseRp9Container(bytes);
  assert.equal(parsed.fileSize, bytes.length);
  assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(parsed.records.map(r => r.kind), ['axure-binary', 'axure-binary', 'jpeg', 'xml']);
  assert.deepEqual(parsed.records.slice(0, 2).map(r => r.compression), ['gzip', 'none']);
  assert.deepEqual(parsed.records.slice(0, 2).map(r => r.payload), [nativeRecord(false), nativeRecord(true)]);
  assert.ok(parsed.references.every(r => r.path[0] === 'WorkingCopy'));
  assert.deepEqual(parseProject(bytes).graphs.map(g => g.className), ['Axure:DesignDocument', 'Axure:Page']);
  const { project } = convertRp9(bytes);
  assert.equal(project.pages.length, 1, 'other snapshots must not introduce duplicate pages');
  const widget = project.pages[0].widgets[0];
  assert.equal(widget.id, `w-${widgetGuid}`);
  assert.equal(widget.content[0].kind, 'control');
  assert.equal(widget.content[0].kind === 'control' && widget.content[0].value, 'Current working copy');
  assert.deepEqual([widget.x, widget.y, widget.width, widget.height], [24, 32, 240, 40]);
  assert.deepEqual(project.issues, []);
});

test('team directory traversal supports nested groups without mixing snapshots', () => {
  const parsed = parseRp9Container(teamFile(workingCopyEntries(), m => {
    m.Root.ChildGroups = { nested: { Items: m.Root.Items, ChildGroups: {} } };
    m.Root.Items = {};
  }));
  assert.equal(parsed.records.length, 4);
});

test('single-page team directories and records ending exactly at a page boundary are accepted', () => {
  const payload = Buffer.alloc(PAGE_DATA * 2, 0x41);
  const bytes = teamFile([{ path: ['WorkingCopy', 'opaque'], bytes: payload }], m => { m.Heap = ''; });
  assert.equal(bytes.readUInt16LE(4090), 0x200);
  const [record] = parseRp9Container(bytes).records;
  assert.deepEqual(record.payload, payload);
  assert.deepEqual(record.team, { entryId: 1, pages: [2, 3] });
  assert.equal(record.fileOffset, 2 * PAGE_SIZE);
  assert.equal(record.references[0].relativeOffset, record.fileOffset);
});

test('team project rejects corrupt directory and record page chains', () => {
  const fixture = teamFile(workingCopyEntries());
  const pageStart = 3 * PAGE_SIZE; // second entry: uncompressed WorkingCopy page
  const corruptions: [string, (b: Buffer) => void, RegExp][] = [
    ['directory loop', b => b.writeUInt16LE(0, 4088), /cycle|reused page/],
    ['directory out of bounds', b => b.writeUInt16LE(65535, 4088), /page.*bounds/],
    ['directory flag', b => b.writeUInt16LE(0x300, 4090), /page flag/],
    ['directory reserved', b => b.writeUInt32LE(1, 4092), /reserved/],
    ['manifest expansion limit', b => { b.fill(0xff, 5, 9); b[9] = 0x0f; }, /manifest varint limit/],
    ['record loop', b => b.writeUInt16LE(3, pageStart + 4088), /cycle|reused page/],
    ['record owner', b => b.writeUInt32LE(999, pageStart), /owner/],
    ['record flag', b => b.writeUInt16LE(0x300, pageStart + 4090), /page flag/],
    ['record reserved', b => b.writeUInt32LE(1, pageStart + 4092), /reserved/],
    ['record terminal size', b => { b.writeUInt16LE(PAGE_DATA + 1, pageStart + 4088); b.writeUInt16LE(0x200, pageStart + 4090); }, /used.*bytes|page.*length/],
  ];
  for (const [name, corrupt, expected] of corruptions) {
    const bytes = Buffer.from(fixture); corrupt(bytes);
    assert.throws(() => parseRp9Container(bytes), expected, name);
  }
  assert.throws(() => parseRp9Container(fixture.subarray(0, -1)), /page.*size|page.*bounds/);
});

test('team directory rejects malformed entries, duplicate identities and missing WorkingCopy', () => {
  const entries = workingCopyEntries();
  const cases: [(m: any) => void, RegExp][] = [
    [m => { m.Root.Items['1'].Length--; }, /length mismatch/],
    [m => { m.Root.Items['1'].Length++; }, /length mismatch/],
    [m => { m.Root.Items['1'].Length = -1; }, /entry length/],
    [m => { m.Root.Items['1'].Length = 65 * 1024 * 1024; }, /entry length/],
    [m => { m.Root.Items['1'].StartPage = 0.5; }, /start page/],
    [m => { m.Root.Items['1'].StartPage = 0; }, /start page/],
    [m => { m.Root.Items['2'].Id = m.Root.Items['1'].Id; }, /duplicate.*id/],
    [m => { m.Root.Items['2'].Key.Path = m.Root.Items['1'].Key.Path; }, /duplicate.*path/],
    [m => { m.Root.Items['1'].Key.Path = ['WorkingCopy', 42]; }, /entry path/],
    [m => { m.Root.Items['1'].Key.Path = ['WorkingCopy', '', 'package']; }, /entry path/],
    [m => { m.Root.Items = {}; }, /WorkingCopy/],
    [m => { m.Root.ChildGroups = []; }, /groups/],
    [m => { let g = m.Root; for (let i = 0; i < 130; i++) { g.ChildGroups = { child: {} }; g = g.ChildGroups.child; } }, /complexity limit/],
    [m => { delete m.Root; }, /root/],
  ];
  for (const [edit, expected] of cases) assert.throws(() => parseRp9Container(teamFile(entries, edit)), expected);
  assert.throws(() => parseRp9Container(teamFile(entries.filter(e => e.path[0] !== 'WorkingCopy'))), /WorkingCopy/);
});

test('team record decompression retains CRC checks and bounds expansion', () => {
  const corrupt = gzipSync(nativeRecord(false)); corrupt[corrupt.length - 8] ^= 1;
  assert.throws(() => parseRp9Container(teamFile([{ path: ['WorkingCopy', 'DesignDocument'], bytes: corrupt }])), /data check/);
  const oversized = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1));
  assert.throws(() => parseRp9Container(teamFile([{ path: ['WorkingCopy', 'package'], bytes: oversized }])), /larger than|output length/);
});

test('team cumulative decompression limit applies across independently bounded records', () => {
  const compressed = gzipSync(Buffer.alloc(64 * 1024 * 1024));
  const entries = Array.from({ length: 5 }, (_, i) => ({ path: ['WorkingCopy', `entry-${i}`], bytes: compressed }));
  assert.throws(() => parseRp9Container(teamFile(entries)), /cumulative output limit/);
});

test('unknown formats are not mislabeled as legacy ZIP', () => {
  assert.throws(() => parseRp9Container(Buffer.alloc(32, 0x41)), /unrecognized.*container/);
  const zip = Buffer.alloc(32); zip.write('PK\x03\x04', 'binary');
  assert.throws(() => parseRp9Container(zip), /legacy ZIP/);
});
