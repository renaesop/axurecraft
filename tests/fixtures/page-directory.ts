import { encodeRp9Payload, type Rp9Node } from '../../src/parser/rp9-payload.ts';
import { manifestFrame, teamFile, words } from './rpteam.ts';

const guid = (n: number) => n.toString(16).padStart(32, '0');
const ref = (id: number) => ({ pair: [1, id] });
/** Native sitemap order deliberately differs from page record order. */
export function directoryFixture(team = true, corrupt = false): Buffer {
  function record(page?: number): Buffer {
    const strings: string[] = [];
    const index = (s: string) => { if (!strings.includes(s)) strings.push(s); return strings.indexOf(s) + 1; };
    const value = (v: any): Rp9Node => {
      if (typeof v === 'string') return { tag: 8, value: index(v) };
      if (typeof v === 'number') return { tag: 3, value: v };
      if (Array.isArray(v)) return { tag: 2, items: v.map(value) };
      if (v.pair) return { tag: 16, values: v.pair };
      return { tag: 1, entries: Object.entries(v).map(([k, x]) => [value(/^\d+$/.test(k) ? Number(k) : k), value(x)]) };
    };
    const object = (id: number, name: string, body: unknown): Rp9Node => ({ tag: 9, id, classIndex: index(name), body: value(body) });
    const objects = page ? [object(2, 'Axure:Page', { diagram: 3 }), object(3, 'Axure:Diagram', { 'diagram-objects': [] })] : [
      object(2, 'Axure:DesignDocument', { PackageInfos: [3, 4, 5, 6], sitemap: 7 }),
      ...[20, 21, 22, 23].map((id, i) => object(3 + i, 'Axure:PackageInfo', { 'package-id': ref(id), 'package-name': ['首页', '同名', '同名', '未收录页'][i] })),
      object(7, 'Axure:SiteTreeMap', { 'node-table': { 9: ref(20), 10: ref(21), 11: 13, 12: ref(22) }, tree: 8 }),
      object(8, 'Axure:Tree', { children: [9, 11], tree: 8 }),
      object(9, 'Axure:Node', { children: corrupt ? [9, 99, 10] : [10], 'parent-node': 8, tree: 8 }),
      object(10, 'Axure:Node', { children: [], 'parent-node': 9, tree: 8 }),
      object(11, 'Axure:Node', { children: [12], 'parent-node': 8, tree: 8 }),
      object(12, 'Axure:Node', { children: [], 'parent-node': 11, tree: 8 }),
      object(13, 'Axure:MasterTreeFolder', { 'folder-id': 14, name: '文件夹 <&>' }),
    ];
    const guids = Array.from({ length: 30 }, (_, i) => guid(i + 1));
    if (page) guids[1] = guid(page);
    const payload = encodeRp9Payload([{ tag: 30, values: guids }, ...objects, { tag: 15, value: 2 }], strings);
    return Buffer.concat([words(27, 9, 0, 5, 0, 0xc351, 31, strings.length), ...strings.flatMap(s => { const b = Buffer.from(s); return [words(b.length), b]; }), payload]);
  }
  const records = [record(), record(22), record(21), record(20), record(23)];
  if (team) return teamFile(records.map((bytes, i) => ({ path: i ? ['WorkingCopy', 'page-' + i, 'package'] : ['WorkingCopy', 'DesignDocument'], bytes })));
  let offset = 0;
  const parts = Object.fromEntries(records.map((b, i) => { const start = offset; offset += b.length + 8; return [i ? 'page-' + i : 'DesignDocument', start]; }));
  const manifest = manifestFrame({ root: { parts } });
  return Buffer.concat([Buffer.from([0xac, 0xef, 9, 0]), words(manifest.length), manifest, ...records.flatMap(b => [words(0, b.length), b])]);
}
