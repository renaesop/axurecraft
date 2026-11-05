import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeLz4Block } from '../src/parser/rp9-container.ts';

test('LZ4 rejects truncation, back-reference before output and length mismatch', () => {
  assert.throws(() => decodeLz4Block(Buffer.from([0xf0]), 20), /truncated/);
  assert.throws(() => decodeLz4Block(Buffer.from([0, 1, 0]), 4), /distance/);
  assert.throws(() => decodeLz4Block(Buffer.from([0x10, 65]), 2), /mismatch/);
});
