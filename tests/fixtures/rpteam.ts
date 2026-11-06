/** Authored binary fixture based on the layout reported in #1; not an Axure export. */
import { gzipSync } from 'node:zlib';
import { encodeRp9Payload, type Rp9Node } from '../../src/parser/rp9-payload.ts';

export const PAGE_SIZE = 4096;
export const PAGE_DATA = 4084;
export const widgetGuid = '44444444444444444444444444444444';
export const words = (...values: number[]): Buffer => {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => bytes.writeUInt32LE(value, i * 4));
  return bytes;
};
export function manifestFrame(manifest: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(manifest));
  const lengths: number[] = [];
  if (json.length >= 15) {
    let remaining = json.length - 15;
    while (remaining >= 255) { lengths.push(255); remaining -= 255; }
    lengths.push(remaining);
  }
  const block = Buffer.concat([Buffer.from([Math.min(15, json.length) << 4, ...lengths]), json]);
  const varint = (value: number): number[] => {
    const result: number[] = [];
    do { const low = value % 128; value = Math.floor(value / 128); result.push(low | (value ? 128 : 0)); } while (value);
    return result;
  };
  return Buffer.concat([Buffer.from([1, ...varint(json.length), ...varint(block.length)]), block]);
}

export interface TeamEntry { path: string[]; bytes: Buffer }
export interface TeamItem { Key: { Path: string[] }; Id: number; StartPage: number; Length: number; PageRanges: number[][]; Crc32: number }
export interface TeamManifest { Root: { Items: Record<string, TeamItem>; ChildGroups: Record<string, unknown> }; Heap: string }
export function teamFile(entries: TeamEntry[], edit?: (manifest: TeamManifest) => void): Buffer {
  // Page 1 is an unused heap page. Chains jump over it and alternate with other
  // entries, so a parser that assumes physically adjacent pages cannot pass.
  const pages = [Buffer.alloc(PAGE_SIZE), Buffer.alloc(PAGE_SIZE)];
  const chains = entries.map(() => [] as number[]);
  for (let chunk = 0; entries.some(e => chunk * PAGE_DATA < e.bytes.length); chunk++) {
    entries.forEach((entry, i) => {
      if (chunk * PAGE_DATA < entry.bytes.length) { chains[i].push(pages.length); pages.push(Buffer.alloc(PAGE_SIZE)); }
    });
  }
  function fill(bytes: Buffer, chain: number[], owner: number): void {
    chain.forEach((index, i) => {
      const page = pages[index], part = bytes.subarray(i * PAGE_DATA, (i + 1) * PAGE_DATA);
      page.writeUInt32LE(owner); part.copy(page, 4);
      page.writeUInt16LE(i === chain.length - 1 ? part.length : chain[i + 1], 4088);
      page.writeUInt16LE(i === chain.length - 1 ? 0x200 : 0x100, 4090);
    });
  }
  const manifest: TeamManifest = { Root: { Items: {}, ChildGroups: {} }, Heap: 'unused heap metadata '.repeat(240) };
  entries.forEach((entry, i) => {
    fill(entry.bytes, chains[i], i + 1);
    manifest.Root.Items[String(i)] = { Key: { Path: entry.path }, Id: i + 1, StartPage: chains[i][0], Length: entry.bytes.length, PageRanges: chains[i].map(p => [p, 1]), Crc32: 0 };
  });
  edit?.(manifest);
  const frame = manifestFrame(manifest), directory = [0];
  while (directory.length * PAGE_DATA < frame.length) { directory.push(pages.length); pages.push(Buffer.alloc(PAGE_SIZE)); }
  fill(frame, directory, 0);
  return Buffer.concat(pages);
}

export function nativeRecord(page: boolean, text = 'Current working copy'): Buffer {
  const strings: string[] = [];
  const stringIndex = (s: string): number => { if (!strings.includes(s)) strings.push(s); return strings.indexOf(s) + 1; };
  const value = (v: unknown): Rp9Node => {
    if (typeof v === 'string') return { tag: 8, value: stringIndex(v) };
    if (typeof v === 'number') return { tag: 3, value: v };
    if (Array.isArray(v)) return { tag: 2, items: v.map(value) };
    return { tag: 1, entries: Object.entries(v as object).map(([k, v]) => [value(k), value(v)]) };
  };
  const object = (id: number, name: string, body: unknown): Rp9Node => ({ tag: 9, id, classIndex: stringIndex(name), body: value(body) });
  const objects = page ? [
    object(2, 'Axure:Page', { diagram: 3, Padding: 'fixture padding '.repeat(400) }),
    object(3, 'Axure:Diagram', { 'diagram-objects': [4] }),
    object(4, 'Axure:DiagramObject:TextBox', { MyStyle: 5, 'name-block': { text: 'Team input' }, TextBlock: { text }, Type: 0 }),
    object(5, 'Axure:WidgetStyle', { PropList: [
      { DOAName: 101, Value: { X: 24, Y: 32 } },
      { DOAName: 105, Value: { Width: 240, Height: 40 } },
    ] }),
  ] : [object(2, 'Axure:DesignDocument', {})];
  const payload = encodeRp9Payload([
    { tag: 30, values: ['1'.repeat(32), (page ? '2' : '3').repeat(32), '5'.repeat(32), widgetGuid, '6'.repeat(32)] },
    ...objects, { tag: 15, value: 2 },
  ], strings);
  return Buffer.concat([words(27, 9, 0, 5, 0, 0xc351, 31, strings.length),
    ...strings.flatMap(s => { const b = Buffer.from(s); return [words(b.length), b]; }), payload]);
}

export function workingCopyEntries(): TeamEntry[] {
  return [
    { path: ['LocalRepo', 'page', 'package'], bytes: gzipSync(nativeRecord(true, 'Old local version')) },
    { path: ['WorkingCopy', 'page', 'package'], bytes: nativeRecord(true) },
    { path: ['WorkingCopy', 'DesignDocument'], bytes: gzipSync(nativeRecord(false)) },
    { path: ['BackgroundUpdate', 'page', 'package'], bytes: nativeRecord(true, 'Background version') },
    { path: ['DDocStore', 'DesignDocument'], bytes: nativeRecord(false) },
    { path: ['WorkingCopy', 'page', 'thumbnail'], bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    { path: ['WorkingCopy', 'page', 'version'], bytes: Buffer.from('<BreakingChanges>fixture</BreakingChanges>') },
    { path: ['TeamMetadata'], bytes: Buffer.from('not project content') },
  ];
}
