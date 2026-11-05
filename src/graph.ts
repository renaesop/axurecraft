import { parseRp9Container, type RpRecord } from './parser/rp9-container.ts';
import { parseRp9Payload, type Rp9Node } from './parser/rp9-payload.ts';

/** Convenience view over the lossless AST. References stay local to each record. */
export interface Value {
  tag: number; value?: number | boolean | string; text?: string;
  values?: (number | string)[]; entries?: [Value, Value][]; items?: Value[];
  id?: number; className?: string; body?: Value;
}
export interface Graph {
  record: RpRecord; roots: Value[]; objects: Map<number, Value>;
  root?: Value; guids: string[]; className: string;
}
export function field(map: Value | undefined, key: string): Value | undefined {
  return map?.entries?.find(([k]) => k.text === key)?.[1];
}
export function number(node: Value | undefined, fallback = 0): number {
  return typeof node?.value === 'number' && Number.isFinite(node.value) ? node.value : fallback;
}
export const str = (node: Value | undefined, fallback = ''): string => node?.text ?? fallback;
export const bool = (node: Value | undefined, fallback = false): boolean => node?.tag === 25 ? !!node.value : fallback;
export const items = (node: Value | undefined): Value[] => node?.items ?? [];
export const object = (graph: Graph, node: Value | undefined): Value | undefined => node?.tag === 9 ? node : graph.objects.get(number(node, -1));
export const prop = (graph: Graph, owner: Value | undefined, key: string): Value | undefined => object(graph, field(owner?.body, key));
export function plain(node: Value | undefined): unknown {
  if (!node) return null;
  if (node.tag === 8) return node.text;
  if (node.entries) return Object.fromEntries(node.entries.map(([k, v]) => [k.text ?? String(k.value), plain(v)]));
  if (node.items) return node.items.map(plain);
  if (node.values) return node.values;
  return node.value ?? null;
}
export function parseProject(data: Buffer): { graphs: Graph[]; records: RpRecord[]; sha256: string } {
  const container = parseRp9Container(data);
  const graphs: Graph[] = [];
  for (const record of container.records) {
    if (!record.inner) continue;
    const parsed = parseRp9Payload(record.payload.subarray(record.inner.payloadStart), record.inner.strings);
    const objects = new Map<number, Value>();
    const view = (node: Rp9Node): Value => {
      const value: Value = { tag: node.tag };
      if ('value' in node) value.value = node.value;
      if (node.tag === 8) value.text = record.inner!.strings[node.value - 1];
      if (node.tag === 6) value.value = Buffer.from(node.rawHex, 'hex').readDoubleLE();
      if (node.tag === 29) value.value = node.rawHex;
      if (node.tag === 25) value.value = !!node.byte;
      if (node.tag === 4) value.value = node.base64;
      if ('values' in node) value.values = node.values;
      if (node.tag === 1) value.entries = node.entries.map(([k, v]) => [view(k), view(v)]);
      if (node.tag === 2) value.items = node.items.map(view);
      if (node.tag === 9) {
        value.id = node.id; value.className = record.inner!.strings[node.classIndex - 1];
        value.body = view(node.body); objects.set(node.id, value);
      }
      return value;
    };
    const roots = parsed.roots.map(view);
    const root = objects.get(number(roots.find(n => n.tag === 15), -1));
    graphs.push({ record, roots, objects, root, className: root?.className ?? '',
      guids: (roots.find(n => n.tag === 30)?.values ?? []) as string[] });
  }
  return { graphs, records: container.records, sha256: container.sha256 };
}
