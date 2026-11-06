/** Authored native RP9 records: labels go through the parser and convertRp9. */
import { encodeRp9Payload, type Rp9Node } from '../../src/parser/rp9-payload.ts';
import { teamFile, nativeRecord, words, manifestFrame } from './rpteam.ts';

export const labelCases = [
  { name: 'diagonal', type: 2, points: [[60, 60], [220, 100]], text: '是', anchor: [140, 80] },
  { name: 'horizontal', type: 2, points: [[60, 160], [220, 160]], text: 'Y', anchor: [140, 160] },
  { name: 'vertical', type: 2, points: [[300, 60], [300, 220]], text: 'N', anchor: [300, 140] },
  { name: 'elbow', type: 1, points: [[60, 260], [260, 260], [260, 340]], text: '否', anchor: [200, 260] },
  { name: 'multiple-bends', type: 1, points: [[420, 60], [520, 60], [520, 260], [680, 260]], text: '满足条件', anchor: [520, 190] },
  { name: 'rounded', type: 0, points: [[60, 400], [260, 400], [260, 480]], text: '取消', anchor: [200, 400] },
  { name: 'curve', type: 3, points: [[420, 380], [680, 420]], text: '确定', anchor: [550, 385] },
  { name: 'empty', type: 2, points: [[60, 560], [260, 560]], text: '', anchor: [160, 560] },
  { name: 'zero-length', type: 2, points: [[380, 550], [380, 550]], text: '重试', anchor: [380, 550] },
];
export const connectorId = (index: number): string => 'w-' + (10 + index * 10).toString(16).padStart(32, '0');

function pageRecord(): Buffer {
  const strings: string[] = [];
  const index = (s: string): number => { if (!strings.includes(s)) strings.push(s); return strings.indexOf(s) + 1; };
  const value = (v: unknown): Rp9Node => {
    if (typeof v === 'string') return { tag: 8, value: index(v) };
    if (typeof v === 'number') return Number.isInteger(v) ? { tag: 3, value: v } : { tag: 6, rawHex: (() => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return b.toString('hex'); })() };
    if (Array.isArray(v)) return { tag: 2, items: v.map(value) };
    return { tag: 1, entries: Object.entries(v as object).map(([k, v]) => [value(k), value(v)]) };
  };
  const object = (id: number, name: string, body: unknown): Rp9Node => ({ tag: 9, id, classIndex: index(name), body: value(body) });
  const objects: Rp9Node[] = [object(2, 'Axure:Page', { diagram: 3 }), object(3, 'Axure:Diagram', { 'diagram-objects': labelCases.map((_, i) => 10 + i * 10) })];
  for (const [i, c] of labelCases.entries()) {
    const id = 10 + i * 10, start = c.points[0], end = c.points.at(-1)!;
    const segments = c.type < 2 ? c.points.slice(1).map((point, n) => {
      const segmentId = id + 2 + n;
      objects.push(object(segmentId, 'Axure:ConnectorSegment', { 'from-x': c.points[n][0], 'from-y': c.points[n][1], 'to-x': point[0], 'to-y': point[1] }));
      return segmentId;
    }) : [];
    const runs = c.text === '满足条件' ? [
      { Text: '满足', Family: 'Arial', Size: 12, Weight: 700, Color: 0xffcc0000 },
      { Text: '条件', Family: 'Arial', Size: 12, Weight: 400, Color: 0xff0000cc },
    ] : [{ Text: c.text, Family: 'Arial', Size: 12, Weight: 400, Color: 0xff333333 }];
    objects.push(object(id, 'Axure:DiagramObject:Connector', {
      MyStyle: id + 1, 'name-block': { text: c.name }, 'connector-type': c.type,
      'end-point-x': end[0], 'end-point-y': end[1], segments,
      ...(c.type === 3 ? { 'control-points': [{ PathPoint: { X: 550, Y: 385 }, LowerHandle: { X: 440, Y: 280 }, HigherHandle: { X: 660, Y: 480 } }] } : {}),
      RichTextBlock: { 'attributed-string': { Paragraphs: [{ HorizontalAlignment: 1, Inlines: runs }] } },
    }), object(id + 1, 'Axure:WidgetStyle', { PropList: [
      { DOAName: 101, Value: { X: start[0], Y: start[1] } },
      { DOAName: 105, Value: { Width: 100, Height: 20 } },
      { DOAName: 10, Value: 1 }, { DOAName: 15, Value: 2 },
      { DOAName: 8, Value: { 'fill-type': 'solid', 'fill-color': 0xff333333 } },
      { DOAName: 17, Value: { Start: 1, End: 3 } },
    ] }));
  }
  const guids = Array.from({ length: 100 }, (_, i) => (i + 1).toString(16).padStart(32, '0'));
  const payload = encodeRp9Payload([{ tag: 30, values: guids }, ...objects, { tag: 15, value: 2 }], strings);
  return Buffer.concat([words(27, 9, 0, 5, 0, 0xc351, 31, strings.length), ...strings.flatMap(s => { const b = Buffer.from(s); return [words(b.length), b]; }), payload]);
}

export function connectorLabelsFile(team = true): Buffer {
  const document = nativeRecord(false), page = pageRecord();
  if (team) return teamFile([{ path: ['WorkingCopy', 'DesignDocument'], bytes: document }, { path: ['WorkingCopy', 'labels', 'package'], bytes: page }]);
  const manifest = manifestFrame({ root: { parts: { DesignDocument: 0, page: document.length + 8 } } });
  return Buffer.concat([Buffer.from([0xac, 0xef, 9, 0]), words(manifest.length), manifest, words(0, document.length), document, words(0, page.length), page]);
}
