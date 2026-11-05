import type {Widget, ConnectorInfo} from './model.ts';

/** Inspect authored topology once per template, without inferring edges from pixels. */
export function flowStructure(roots: Widget[]) {
  const widgets: Widget[] = [];
  const parents = new Map<string, string>();
  function walk(list: Widget[], parent?: string): void {
    for (const w of list) {
      widgets.push(w);
      if (parent) parents.set(w.id, parent);
      walk(w.children ?? [], w.id);
      for (const state of w.states ?? []) walk(state.widgets, w.id);
      walk(w.repeater?.template ?? [], w.id);
    }
  }
  walk(roots);

  const byId = new Map(widgets.map(w => [w.id, w]));
  const nodeIds = new Set<string>();
  const danglingTargets: {edge: string; end: 'start' | 'end'; target: string}[] = [];
  const edges = widgets
    .filter(w => w.connection || w.type === 'Connector')
    .map(w => ({id: w.id, name: w.name, ...w.connection}));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  let unattachedEnds = 0, missingMetadata = 0;

  for (const edge of edges) {
    if (!edge.routing) {
      missingMetadata++;
      continue;
    }
    for (const side of ['start', 'end'] as const) {
      const target = edge[side]?.target;
      if (!target) {
        unattachedEnds++;
      } else if (!byId.has(target)) {
        danglingTargets.push({edge: edge.id, end: side, target});
      } else {
        nodeIds.add(target);
      }
    }
    const from = edge.start?.target, to = edge.end?.target;
    if (from && to && byId.has(from) && byId.has(to)) {
      if (!outgoing.has(from)) outgoing.set(from, []);
      outgoing.get(from)!.push(to);
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
    }
  }

  // Kahn's algorithm detects cycles without recursively expanding connected nodes.
  const degree = new Map([...nodeIds].map(id => [id, incoming.get(id) ?? 0]));
  const queue = [...nodeIds].filter(id => !degree.get(id));
  let processed = 0;
  for (let i = 0; i < queue.length; i++) {
    processed++;
    for (const to of outgoing.get(queue[i]) ?? []) {
      degree.set(to, degree.get(to)! - 1);
      if (!degree.get(to)) queue.push(to);
    }
  }

  const nodes = [...nodeIds].map(id => ({
    id, name: byId.get(id)!.name, parent: parents.get(id),
    incoming: incoming.get(id) ?? 0, outgoing: outgoing.get(id)?.length ?? 0,
  }));
  const routingTypes: ConnectorInfo['routing'][] = ['straight', 'orthogonal', 'rounded', 'curve'];
  return {
    nodes, edges, danglingTargets, unattachedEnds, missingMetadata,
    branches: nodes.filter(n => n.outgoing > 1).length,
    merges: nodes.filter(n => n.incoming > 1).length,
    hasCycle: processed < nodeIds.size,
    routing: Object.fromEntries(routingTypes.map(type => [type, edges.filter(e => e.routing === type).length])),
  };
}
