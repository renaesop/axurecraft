import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRp9Payload, encodeRp9Payload, type Rp9Node } from '../src/parser/rp9-payload.ts';

const words = (...values: number[]): Buffer => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b; };
test('IEEE754 NaN payload, ±Infinity, negative zero and raw 8-byte fields survive JSON', () => {
  const raw = ['010000000000f87f', '000000000000f07f', '000000000000f0ff', '0000000000000080', 'ffffffffffffffff'];
  const nodes: Rp9Node[] = raw.map(rawHex => ({ tag: 6, rawHex }));
  nodes.push({ tag: 29, rawHex: '0123456789abcdef' }, { tag: 25, byte: 255 });
  const encoded = encodeRp9Payload(nodes, []);
  assert.deepEqual(parseRp9Payload(encoded, []).roots, nodes);
  assert.deepEqual(encodeRp9Payload(JSON.parse(JSON.stringify(nodes)), []), encoded);
});
test('map pair order, duplicate keys, maximum u32 and 16-byte values preserved', () => {
  const nodes: Rp9Node[] = [{ tag: 1, entries: [
    [{ tag: 8, value: 1 }, { tag: 17, value: 0xffffffff }],
    [{ tag: 8, value: 1 }, { tag: 9, id: 0xffffffff, classIndex: 1, body: { tag: 28 } }],
  ] }, { tag: 30, values: ['00112233445566778899aabbccddeeff', '00112233445566778899aabbccddeeff'] }];
  assert.deepEqual(parseRp9Payload(encodeRp9Payload(nodes, ['x']), ['x']).roots, nodes);
});
test('truncations, unknown tags, bad string indices and malicious counts rejected', () => {
  for (const bytes of [Buffer.from([1]), words(4, 10), words(6), words(29), words(30, 0xffffffff), words(1, 0xffffffff), words(2, 0xffffffff), words(0xffffffff)]) {
    assert.throws(() => parseRp9Payload(bytes, []));
  }
  assert.throws(() => parseRp9Payload(words(8, 0), ['x']), /string index/);
  assert.throws(() => parseRp9Payload(words(8, 2), ['x']), /string index/);
  assert.throws(() => parseRp9Payload(words(9, 1, 2, 28), ['x']), /string index/);
});
test('decode and encode enforce byte, node, depth and collection limits', () => {
  const chain: Rp9Node[] = [{ tag: 2, items: [{ tag: 2, items: [{ tag: 28 }] }] }];
  const bytes = encodeRp9Payload(chain, []);
  for (const limits of [{ maxDepth: 1 }, { maxBytes: 4 }, { maxNodes: 2 }]) {
    assert.throws(() => parseRp9Payload(bytes, [], limits), /limit/);
    assert.throws(() => encodeRp9Payload(chain, [], limits), /limit/);
  }
  const list: Rp9Node[] = [{ tag: 2, items: [{ tag: 28 }, { tag: 28 }] }];
  assert.throws(() => parseRp9Payload(encodeRp9Payload(list, []), [], { maxCollectionItems: 1 }), /limit/);
  assert.throws(() => encodeRp9Payload(list, [], { maxCollectionItems: 1 }), /collection/);
});
test('invalid JSON AST fields, noncanonical base64 and cycles rejected', () => {
  const invalid: unknown[] = [
    [{ tag: 3, value: -1 }], [{ tag: 25, byte: 256 }], [{ tag: 8, value: 0 }],
    [{ tag: 6, rawHex: '00' }], [{ tag: 29, rawHex: 'xxxxxxxxxxxxxxxx' }],
    [{ tag: 4, base64: 'YQ=A' }], [{ tag: 4, base64: 'YR==' }],
    [{ tag: 1, entries: [[{ tag: 28 }]] }], [{ tag: 16, values: [1] }],
    [{ tag: 30, values: ['00'] }], [{ tag: 7 }], [null],
  ];
  for (const nodes of invalid) assert.throws(() => encodeRp9Payload(nodes as Rp9Node[], []));
  const cycle: Rp9Node = { tag: 2, items: [] }; cycle.items.push(cycle);
  assert.throws(() => encodeRp9Payload([cycle], []), /cyclic/);
});
test('large binary blobs use bounded validation without regexp recursion', () => {
  const nodes: Rp9Node[] = [{ tag: 4, base64: Buffer.alloc(1024 * 1024, 0xff).toString('base64') }];
  assert.deepEqual(parseRp9Payload(encodeRp9Payload(nodes, []), []).roots, nodes);
});
