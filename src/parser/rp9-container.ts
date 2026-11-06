/** Bounded RP9 container parser. Widget semantics are resolved in the graph and conversion stages. */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const MAX_FILE = 128 * 1024 * 1024;
const MAX_MANIFEST = 16 * 1024 * 1024;
const MAX_RECORD = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
function need(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

export function decodeLz4Block(input: Buffer, outputLength: number): Buffer {
  need(Number.isSafeInteger(outputLength) && outputLength > 0 && outputLength <= MAX_MANIFEST, 'invalid LZ4 output length');
  const output = Buffer.alloc(outputLength);
  let i = 0, o = 0;
  function length(n: number): number {
    if (n === 15) {
      let v: number;
      do { need(i < input.length, 'truncated LZ4 length'); v = input[i++]; n += v; } while (v === 255);
    }
    return n;
  }
  while (i < input.length) {
    const token = input[i++];
    const literals = length(token >>> 4);
    need(i + literals <= input.length && o + literals <= output.length, 'LZ4 literal bounds');
    input.copy(output, o, i, i + literals); i += literals; o += literals;
    if (i === input.length) break;
    need(i + 2 <= input.length, 'truncated LZ4 distance');
    const distance = input.readUInt16LE(i); i += 2;
    need(distance > 0 && distance <= o, 'invalid LZ4 distance');
    const matches = length(token & 15) + 4;
    need(o + matches <= output.length, 'LZ4 match bounds');
    for (let j = 0; j < matches; j++) { output[o] = output[o - distance]; o++; }
  }
  need(i === input.length && o === output.length, 'LZ4 length mismatch');
  return output;
}

export interface PartReference { path: string[]; part: string; relativeOffset: number }
export interface InnerTable { words: number[]; strings: string[]; payloadStart: number }
export interface RpRecord {
  index: number; relativeOffset: number; fileOffset: number; reserved: number;
  storedLength: number; decodedLength: number; compression: 'gzip' | 'none';
  kind: 'axure-binary' | 'jpeg' | 'xml' | 'opaque';
  references: PartReference[]; storedSha256: string; decodedSha256: string;
  inner?: InnerTable; payload: Buffer;
}
export interface RpContainer {
  sha256: string; fileSize: number; headerHex: string; formatVersion: number;
  manifestStoredLength: number; manifestDecodedLength: number; dataBase: number;
  manifest: unknown; references: PartReference[]; records: RpRecord[];
}

export function parseStringTable(data: Buffer): InnerTable {
  need(data.length >= 32, 'short inner header');
  const words = Array.from({ length: 8 }, (_, i) => data.readUInt32LE(i * 4));
  // An RP9 container can retain RP8 records (for example untouched CSV/print
  // configurations). They use the same string-table framing and payload tags.
  // The outer container is still required to be RP9; legacy ZIP files are not accepted.
  need(words[0] === 27 && (words[1] === 8 || words[1] === 9) && words[5] === 0xc351 && words[6] === 31, 'unsupported inner header');
  need(words[7] <= 100000 && words[7] <= Math.floor((data.length - 32) / 4), 'invalid string count');
  let offset = 32;
  const strings: string[] = [];
  for (let i = 0; i < words[7]; i++) {
    need(offset + 4 <= data.length, 'truncated string length');
    const length = data.readUInt32LE(offset); offset += 4;
    need(offset + length <= data.length, 'truncated string bytes');
    strings.push(utf8.decode(data.subarray(offset, offset + length))); offset += length;
  }
  return { words, strings, payloadStart: offset };
}

function manifestReferences(manifest: unknown): PartReference[] {
  const refs: PartReference[] = [];
  const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
  need(object(manifest) && object(manifest.root), 'manifest root missing');
  let count = 0;
  function walk(node: Record<string, unknown>, path: string[]): void {
    need(++count <= 100000 && path.length <= 128, 'manifest complexity limit');
    if (node.parts !== undefined) {
      need(object(node.parts), 'invalid manifest parts');
      for (const [part, offset] of Object.entries(node.parts)) {
        need(typeof offset === 'number' && Number.isSafeInteger(offset) && offset >= 0, 'invalid manifest offset');
        refs.push({ path, part, relativeOffset: offset });
      }
    }
    if (node.children !== undefined) {
      need(object(node.children), 'invalid manifest children');
      for (const [name, child] of Object.entries(node.children)) {
        need(object(child), 'invalid manifest child'); walk(child, [...path, name]);
      }
    }
  }
  walk(manifest.root, ['root']);
  return refs;
}

export function parseRp9Container(data: Buffer): RpContainer {
  need(data.length >= 13 && data.length <= MAX_FILE, 'file size outside PoC limits');
  need(data[0] === 0xac && data[1] === 0xef, 'unsupported container (legacy ZIP .rp requires a separate decoder)');
  const formatVersion = data.readUInt16LE(2);
  need(formatVersion === 9, `unsupported container version ${formatVersion}`);
  const manifestStoredLength = data.readUInt32LE(4);
  const dataBase = 8 + manifestStoredLength;
  need(manifestStoredLength <= MAX_MANIFEST && dataBase <= data.length, 'manifest bounds');
  let cursor = 8;
  function byte(): number { need(cursor < dataBase, 'truncated manifest frame'); return data[cursor++]; }
  function varint(): number {
    let n = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const b = byte(); n += (b & 127) * 2 ** shift;
      if (!(b & 128)) { need(n <= MAX_MANIFEST, 'manifest varint limit'); return n; }
    }
    throw new Error('manifest varint too long');
  }
  // Only the single compressed block form observed in the test corpus is supported.
  need(byte() === 1, 'unsupported manifest frame flags');
  const manifestDecodedLength = varint();
  const compressedLength = varint();
  need(cursor + compressedLength === dataBase, 'unsupported multi-block or malformed manifest');
  const manifest = JSON.parse(utf8.decode(decodeLz4Block(data.subarray(cursor, dataBase), manifestDecodedLength))) as unknown;
  const references = manifestReferences(manifest);
  const refsByOffset = new Map<number, PartReference[]>();
  for (const ref of references) {
    const list = refsByOffset.get(ref.relativeOffset) ?? []; list.push(ref); refsByOffset.set(ref.relativeOffset, list);
  }
  const records: RpRecord[] = [];
  let total = 0;
  cursor = dataBase;
  while (cursor < data.length) {
    need(records.length < 100000 && cursor + 8 <= data.length, 'record header bounds');
    const relativeOffset = cursor - dataBase;
    const reserved = data.readUInt32LE(cursor);
    const storedLength = data.readUInt32LE(cursor + 4);
    need(reserved === 0, 'unsupported nonzero record reserved field');
    need(storedLength > 0 && storedLength <= MAX_RECORD && cursor + 8 + storedLength <= data.length, 'record payload bounds');
    const stored = data.subarray(cursor + 8, cursor + 8 + storedLength);
    const compression = stored[0] === 0x1f && stored[1] === 0x8b && stored[2] === 8 ? 'gzip' : 'none';
    const payload = compression === 'gzip' ? gunzipSync(stored, { maxOutputLength: Math.min(MAX_RECORD, MAX_TOTAL - total) }) : stored;
    total += payload.length;
    need(total <= MAX_TOTAL, 'cumulative output limit');
    let kind: RpRecord['kind'] = 'opaque';
    let inner: InnerTable | undefined;
    if (payload.length >= 24 && payload.readUInt32LE(20) === 0xc351) { kind = 'axure-binary'; inner = parseStringTable(payload); }
    else if (payload[0] === 0xff && payload[1] === 0xd8 && payload[2] === 0xff) kind = 'jpeg';
    else if (payload.subarray(0, 17).toString() === '<BreakingChanges>') kind = 'xml';
    records.push({ index: records.length, relativeOffset, fileOffset: cursor, reserved, storedLength,
      decodedLength: payload.length, compression, kind, references: refsByOffset.get(relativeOffset) ?? [],
      storedSha256: sha256(stored), decodedSha256: sha256(payload), inner, payload });
    cursor += 8 + storedLength;
  }
  const offsets = new Set(records.map(record => record.relativeOffset));
  for (const ref of references) need(offsets.has(ref.relativeOffset), `manifest reference not on frame boundary: ${ref.relativeOffset}`);
  return { sha256: sha256(data), fileSize: data.length, headerHex: data.subarray(0, 8).toString('hex'),
    formatVersion, manifestStoredLength, manifestDecodedLength, dataBase, manifest, references, records };
}
