import type { Graph, Value } from '../../src/graph.ts';

/** Authored object graph matching issue #4's InteractionTarget, not a native RP file. */
export const zeroGuid = '00000000000000000000000000000000';
export const validGuid = '11111111111111111111111111111111';
export const absentGuid = '22222222222222222222222222222222';
export const value = (v: unknown): Value => Array.isArray(v) ? { tag: 2, items: v.map(value) }
  : v !== null && typeof v === 'object' ? { tag: 1, entries: Object.entries(v).map(([k, v]) => [value(k), value(v)]) }
  : typeof v === 'string' ? { tag: 8, text: v } : { tag: 3, value: v as number };
const object = (id: number, className: string, body: unknown): Value => ({ tag: 9, id, className, body: value(body) });
export function linkGraph(guid = zeroGuid, following = true): { graph: Graph; owner: Value; target: Value; pages: Map<string, string> } {
  const owner = object(1, 'Axure:DiagramObject:VectorShape', { InteractionMap: 2 });
  const map = object(2, 'Axure:InteractionMap', { tree: 3 });
  map.body!.entries!.push([value('node-table'), { tag: 1, entries: [[4, 5], [6, 7], [8, 9], [11, 12], [13, 14]].map(([k, v]) => [value(k), value(v)]) }]);
  const target = object(10, 'Axure:InteractionTarget', { 'target-type': 1, 'target-literal': 'https://example.test/unused-fallback' });
  target.body!.entries!.push([value('target-page-id'), { tag: 19, values: [1, 3] }]);
  const valid = object(15, 'Axure:InteractionTarget', { 'target-type': 1 });
  valid.body!.entries!.push([value('target-page-id'), { tag: 19, values: [1, 2] }]);
  const objects = [owner, map, object(3, 'node', { children: [4] }), object(4, 'node', { children: [6] }),
    object(5, 'event', { 'event-type': 16 }), object(6, 'node', { children: following ? [8, 11, 13] : [8] }), object(7, 'case', {}),
    object(8, 'node', {}), object(9, 'Axure:InteractionLinkWindowAction', { target: 10, 'link-type': 1 }), target,
    object(11, 'node', {}), object(12, 'Axure:InteractionWaitAction', { wait_time: 1 }),
    object(13, 'node', {}), object(14, 'Axure:InteractionLinkWindowAction', { target: 15, 'link-type': 1 }), valid];
  const graph = { guids: ['33333333333333333333333333333333', validGuid, guid], objects: new Map(objects.map(o => [o.id!, o])) } as Graph;
  return { graph, owner, target, pages: new Map([[validGuid, 'page-2.html']]) };
}
