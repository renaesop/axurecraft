/** Authored RP9 binary reproducer; no private prototype or native HTML is included. */
import { encodeRp9Payload, type Rp9Node } from '../../src/parser/rp9-payload.ts';

export const masterGuid = 'ee3d734b000000000000000000000001';
export const instanceNames = ['Main <content> & "details"', 'Short header', 'Hidden instance', ''];
export const instanceGuids = [4, 6, 8, 10].map(id => id.toString(16).padStart(32, '0'));
const words = (...values: number[]): Buffer => {
  const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b;
};
function record(kind: 'document' | 'page' | 'master', missingGuid: boolean): Buffer {
  const strings: string[] = [];
  const index = (s: string): number => { if (!strings.includes(s)) strings.push(s); return strings.indexOf(s) + 1; };
  const value = (v: unknown): Rp9Node => {
    if (typeof v === 'string') return { tag: 8, value: index(v) };
    if (typeof v === 'boolean') return { tag: 25, byte: Number(v) };
    if (typeof v === 'number') return { tag: 3, value: v };
    if (Array.isArray(v)) return { tag: 2, items: v.map(value) };
    return { tag: 1, entries: Object.entries(v as object).map(([k, v]) => [value(k), value(v)]) };
  };
  const object = (id: number, name: string, body: Record<string, unknown>): Rp9Node => ({ tag: 9, id, classIndex: index(name), body: value(body) });
  const guids = Array.from({ length: 12 }, (_, i) => (i + 1).toString(16).padStart(32, '0'));
  guids[1] = kind === 'master' ? masterGuid : (kind === 'page' ? 'b' : 'c').repeat(32);
  guids[11] = masterGuid;
  const objects: Rp9Node[] = [];
  if (kind === 'document') objects.push(object(2, 'Axure:DesignDocument', {}));
  else {
    const ids = kind === 'page' ? [4, 6, 8, 10] : [4];
    objects.push(object(2, kind === 'page' ? 'Axure:Page' : 'Axure:Master', { diagram: 3 }),
      object(3, 'Axure:Diagram', { 'diagram-objects': ids }));
    for (const [i, id] of ids.entries()) {
      const widget = object(id, kind === 'page' ? 'Axure:DiagramObject:ReferenceDiagramObject' : 'Axure:DiagramObject:TextBox', {
        MyStyle: id + 1, 'name-block': { text: kind === 'page' ? instanceNames[i] : 'Valid master input' },
        VisibleFromSettings: i !== 2, ...(kind === 'master' ? { TextBlock: { text: 'Master content' }, Type: 0 } : {}),
      });
      if (kind === 'page' && widget.tag === 9 && widget.body.tag === 1) {
        widget.body.entries.push([value('ReferredMaster'), { tag: 19, values: [1, missingGuid ? 999 : 12] }]);
      }
      objects.push(widget, object(id + 1, 'Axure:WidgetStyle', { PropList: [
        { DOAName: 101, Value: { X: 20, Y: kind === 'master' ? 10 : [20, 1400, 1460, 1440][i] } },
        { DOAName: 105, Value: { Width: kind === 'master' ? 160 : i === 0 ? 1210 : 362, Height: kind === 'master' ? 30 : i === 0 ? 1362 : 22 } },
      ] }));
    }
  }
  const payload = encodeRp9Payload([{ tag: 30, values: guids }, ...objects, { tag: 15, value: 2 }], strings);
  return Buffer.concat([words(27, 9, 0, 5, 0, 0xc351, 31, strings.length),
    ...strings.flatMap(s => { const bytes = Buffer.from(s); return [words(bytes.length), bytes]; }), payload]);
}

export function missingMasterFile(options: { includeMaster?: boolean; missingGuid?: boolean } = {}): Buffer {
  const kinds = ['document', 'page', ...(options.includeMaster ? ['master'] : [])] as ('document' | 'page' | 'master')[];
  const frames = kinds.map(kind => { const payload = record(kind, !!options.missingGuid); return Buffer.concat([words(0, payload.length), payload]); });
  let offset = 0;
  const parts = Object.fromEntries(frames.map((frame, i) => { const entry = [kinds[i], offset]; offset += frame.length; return entry; }));
  const json = Buffer.from(JSON.stringify({ root: { parts } })), extension: number[] = [];
  let remaining = json.length - 15;
  while (remaining >= 255) { extension.push(255); remaining -= 255; }
  extension.push(remaining);
  const compressed = Buffer.concat([Buffer.from([0xf0, ...extension]), json]);
  const varint = (n: number): number[] => { const bytes: number[] = []; do { const low = n % 128; n = Math.floor(n / 128); bytes.push(low | (n ? 128 : 0)); } while (n); return bytes; };
  const manifest = Buffer.concat([Buffer.from([1, ...varint(json.length), ...varint(compressed.length)]), compressed]);
  return Buffer.concat([Buffer.from([0xac, 0xef, 9, 0]), words(manifest.length), manifest, ...frames]);
}
