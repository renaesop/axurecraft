/**
 * Bounded RP9 structural grammar, adapted from zee-rp parse-payload.mjs.
 * Original: https://github.com/LilZeeCN/zee-rp/blob/b3a6709382fe57fba59bd744687e633229a1ec71/scripts/parse-payload.mjs.
 * This is a byte-preserving AST, not a verified interpretation of widget semantics.
 *
 * MIT License
 * Copyright (c) 2026 zee-rp contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type Rp9Node =
  | { tag: 1; entries: [Rp9Node, Rp9Node][] }
  | { tag: 2; items: Rp9Node[] }
  | { tag: 3 | 5 | 8 | 15 | 17 | 18 | 20 | 22; value: number }
  | { tag: 4; base64: string }
  // Eight raw little-endian bytes are authoritative, preserving NaN, Infinity and -0.
  | { tag: 6; rawHex: string }
  | { tag: 9; id: number; classIndex: number; body: Rp9Node }
  | { tag: 16 | 19; values: [number, number] }
  // Preserve all 256 possible bytes; assigning Boolean semantics would lose bits.
  | { tag: 25; byte: number }
  | { tag: 26 | 28 }
  | { tag: 29; rawHex: string }
  // Preserve each 16-byte value in wire order, without GUID byte-order assumptions.
  | { tag: 30; values: string[] };

export interface PayloadLimits {
  maxBytes: number;
  maxNodes: number;
  maxDepth: number;
  maxCollectionItems: number;
}
const DEFAULT_LIMITS: PayloadLimits = {
  maxBytes: 64 * 1024 * 1024, maxNodes: 1_000_000,
  maxDepth: 128, maxCollectionItems: 1_000_000,
};
function ensure(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function limitsOf(partial: Partial<PayloadLimits>): PayloadLimits {
  const result = { ...DEFAULT_LIMITS, ...partial };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof PayloadLimits)[]) {
    ensure(Number.isSafeInteger(result[key]) && result[key] > 0 && result[key] <= DEFAULT_LIMITS[key], `invalid ${key}; limits may only be lowered`);
  }
  return result;
}
function checkStrings(strings: readonly string[]): void {
  ensure(Array.isArray(strings) && strings.length <= 1_000_000, 'invalid string table');
  ensure(strings.every(s => typeof s === 'string'), 'string table contains non-string');
}
function stringIndex(index: number, strings: readonly string[]): void {
  ensure(Number.isInteger(index) && index >= 1 && index <= strings.length, `invalid 1-based string index ${index}`);
}

export function parseRp9Payload(
  input: Uint8Array, strings: readonly string[], limits: Partial<PayloadLimits> = {},
): { roots: Rp9Node[]; byteLength: number; nodeCount: number } {
  const cap = limitsOf(limits); checkStrings(strings);
  ensure(input instanceof Uint8Array && input.byteLength <= cap.maxBytes, 'payload byte limit');
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let offset = 0, nodeCount = 0;
  function take(length: number): Buffer {
    ensure(length <= data.length - offset, `truncated payload at ${offset}: need ${length} bytes`);
    const bytes = data.subarray(offset, offset + length); offset += length; return bytes;
  }
  function u32(): number { return take(4).readUInt32LE(0); }
  function count(minimumBytes: number): number {
    const n = u32();
    ensure(n <= cap.maxCollectionItems && n <= Math.floor((data.length - offset) / minimumBytes), 'collection length exceeds limit or remaining input');
    return n;
  }
  function node(depth: number): Rp9Node {
    ensure(depth <= cap.maxDepth, 'payload depth limit');
    ensure(++nodeCount <= cap.maxNodes, 'payload node limit');
    const start = offset, tag = u32();
    switch (tag) {
      case 1: {
        const n = count(8), entries: [Rp9Node, Rp9Node][] = [];
        ensure(n * 2 <= cap.maxNodes - nodeCount, 'payload node limit');
        for (let i = 0; i < n; i++) entries.push([node(depth + 1), node(depth + 1)]);
        return { tag, entries };
      }
      case 2: {
        const n = count(4), items: Rp9Node[] = [];
        ensure(n <= cap.maxNodes - nodeCount, 'payload node limit');
        for (let i = 0; i < n; i++) items.push(node(depth + 1));
        return { tag, items };
      }
      case 3: case 5: case 8: case 15: case 17: case 18: case 20: case 22: {
        const value = u32(); if (tag === 8) stringIndex(value, strings);
        return { tag, value };
      }
      case 4: { const length = u32(); return { tag, base64: take(length).toString('base64') }; }
      case 6: case 29: return { tag, rawHex: take(8).toString('hex') };
      case 9: {
        const id = u32(), classIndex = u32(); stringIndex(classIndex, strings);
        return { tag, id, classIndex, body: node(depth + 1) };
      }
      case 16: case 19: return { tag, values: [u32(), u32()] };
      case 25: return { tag, byte: take(1)[0] };
      case 26: case 28: return { tag };
      case 30: {
        const n = count(16), values: string[] = [];
        for (let i = 0; i < n; i++) values.push(take(16).toString('hex'));
        return { tag, values };
      }
      default: throw new Error(`unsupported payload tag ${tag} at ${start}`);
    }
  }
  const roots: Rp9Node[] = [];
  while (offset < data.length) roots.push(node(0));
  return { roots, byteLength: offset, nodeCount };
}

/** Validate and encode a JSON-roundtrippable AST. Pair order and duplicate keys survive. */
export function encodeRp9Payload(
  roots: readonly Rp9Node[], strings: readonly string[], limits: Partial<PayloadLimits> = {},
): Buffer {
  const cap = limitsOf(limits); checkStrings(strings);
  ensure(Array.isArray(roots) && roots.length <= cap.maxNodes, 'invalid roots');
  // First traversal validates and measures; second writes directly into one bounded allocation.
  function traverse(output?: Buffer): number {
    let offset = 0, nodes = 0;
    const ancestors = new Set<unknown>();
    function reserve(length: number): number {
      ensure(length <= cap.maxBytes - offset, 'encoded payload byte limit');
      const start = offset; offset += length; return start;
    }
    function u32(value: number): void {
      ensure(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, 'invalid u32');
      const at = reserve(4); if (output) output.writeUInt32LE(value, at);
    }
    function bytes(value: Buffer): void { const at = reserve(value.length); if (output) value.copy(output, at); }
    function hex(value: string, length: number): void {
      ensure(typeof value === 'string' && value.length === length * 2 && /^[0-9a-fA-F]+$/.test(value), `invalid ${length}-byte hex`);
      bytes(Buffer.from(value, 'hex'));
    }
    function collection(value: unknown): asserts value is unknown[] {
      ensure(Array.isArray(value) && value.length <= cap.maxCollectionItems, 'invalid collection');
    }
    function write(n: Rp9Node, depth: number): void {
      ensure(depth <= cap.maxDepth, 'payload depth limit');
      ensure(++nodes <= cap.maxNodes, 'payload node limit');
      ensure(n !== null && typeof n === 'object' && !Array.isArray(n), 'invalid AST node');
      ensure(!ancestors.has(n), 'cyclic AST'); ancestors.add(n);
      u32(n.tag);
      switch (n.tag) {
        case 1:
          collection(n.entries); u32(n.entries.length);
          for (const pair of n.entries) {
            ensure(Array.isArray(pair) && pair.length === 2, 'map entry must contain exactly two nodes');
            write(pair[0], depth + 1); write(pair[1], depth + 1);
          }
          break;
        case 2:
          collection(n.items); u32(n.items.length); for (const item of n.items) write(item, depth + 1); break;
        case 3: case 5: case 8: case 15: case 17: case 18: case 20: case 22:
          if (n.tag === 8) stringIndex(n.value, strings); u32(n.value); break;
        case 4: {
          ensure(typeof n.base64 === 'string' && n.base64.length <= Math.ceil(cap.maxBytes / 3) * 4, 'base64 byte limit');
          ensure(n.base64.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(n.base64), 'invalid base64');
          const data = Buffer.from(n.base64, 'base64');
          ensure(data.toString('base64') === n.base64, 'noncanonical base64'); u32(data.length); bytes(data); break;
        }
        case 6: case 29: hex(n.rawHex, 8); break;
        case 9:
          u32(n.id); stringIndex(n.classIndex, strings); u32(n.classIndex); write(n.body, depth + 1); break;
        case 16: case 19:
          ensure(Array.isArray(n.values) && n.values.length === 2, 'expected two u32 values');
          u32(n.values[0]); u32(n.values[1]); break;
        case 25: {
          ensure(Number.isInteger(n.byte) && n.byte >= 0 && n.byte <= 255, 'invalid u8');
          const at = reserve(1); if (output) output[at] = n.byte; break;
        }
        case 26: case 28: break;
        case 30:
          collection(n.values); u32(n.values.length); for (const value of n.values) hex(value, 16); break;
        default: throw new Error('unsupported AST tag');
      }
      ancestors.delete(n);
    }
    for (const root of roots) write(root, 0);
    return offset;
  }
  const output = Buffer.alloc(traverse());
  ensure(traverse(output) === output.length, 'AST changed between encoder passes');
  return output;
}
