import {translateGeometry} from './connector-geometry.ts';
import type { Widget } from './model.ts';

/**
 * RP diagrams contain groups and their members in one flat paint-order list.
 * Rebuild the tree without using the group's stale saved location. Geometry in
 * the resulting tree is relative to its parent, just like panel contents.
 */
export function nestGroups(flat: Widget[], members: ReadonlyMap<string, readonly string[]>): Widget[] {
  const byId = new Map(flat.map(widget => [widget.id, widget]));
  const parent = new Map<string, string>();
  for (const [groupId, children] of members) {
    if (byId.get(groupId)?.kind !== 'group') throw new Error(`Invalid group owner: ${groupId}`);
    for (const childId of children) {
      if (!byId.has(childId)) throw new Error(`Missing group member: ${groupId} → ${childId}`);
      if (parent.has(childId)) throw new Error(`Group member has multiple owners: ${childId}`);
      parent.set(childId, groupId);
    }
  }

  const children = new Map<string, Widget[]>();
  for (const widget of flat) {
    const owner = parent.get(widget.id);
    if (owner) {
      const siblings = children.get(owner) ?? [];
      siblings.push(widget);
      children.set(owner, siblings);
    }
  }
  const built = new Map<string, Widget>();
  const active = new Set<string>();
  const build = (widget: Widget): Widget => {
    const cached = built.get(widget.id);
    if (cached) return cached;
    if (active.has(widget.id)) throw new Error(`Cyclic group membership: ${widget.id}`);
    if (active.size > 64) throw new Error('Group nesting exceeds 64');
    active.add(widget.id);
    let result = widget;
    if (members.has(widget.id)) {
      const contents = (children.get(widget.id) ?? []).map(build);
      const x = contents.length ? Math.min(...contents.map(w => w.x)) : 0;
      const y = contents.length ? Math.min(...contents.map(w => w.y)) : 0;
      const right = contents.length ? Math.max(...contents.map(w => w.x + w.width)) : 0;
      const bottom = contents.length ? Math.max(...contents.map(w => w.y + w.height)) : 0;
      result = {
        ...widget, x, y, width: right - x, height: bottom - y,
        children: contents.map(w => ({ ...w, x: w.x - x, y: w.y - y, ...(w.connection?.geometry ? {connection:{...w.connection,geometry:translateGeometry(w.connection.geometry,-x,-y)}} : {}) })),
      };
    }
    active.delete(widget.id);
    built.set(widget.id, result);
    return result;
  };
  // Also visit components with no root so a cycle cannot silently disappear.
  for (const widget of flat) build(widget);
  const roots = flat.filter(w => !parent.has(w.id)).map(build);
  const order = (widgets: Widget[]): string[] => widgets.flatMap(w => [w.id, ...(members.has(w.id) ? order(w.children ?? []) : [])]);
  if (order(roots).some((id, index) => id !== flat[index].id)) {
    throw new Error('Group membership interleaves paint order; cannot preserve it as a DOM tree');
  }
  return roots;
}

/** Connector text can extend outside a zero-width/height shaft. Keep the shaft
 * geometry unchanged; include the text panels only when measuring paint bounds. */
function connectorTextBounds(w:Widget):{left:number;right:number;bottom:number} {
  let left=0,right=w.width,bottom=w.height;
  if(w.type==='Connector')for(const content of [w.content,...Object.values(w.variants??{}).flatMap(v=>v.content?[v.content]:[])])for(const c of content){
    if(c.kind!=='text'||c.css.display==='none')continue;
    const values=['left','top','width','height'].map(key=>c.css[key]?.endsWith('px')?parseFloat(c.css[key]):NaN);
    if(!values.every(Number.isFinite))continue;
    const [x,y,width,height]=values;
    left=Math.min(left,x);right=Math.max(right,x+width);bottom=Math.max(bottom,y+height);
  }
  return {left,right,bottom};
}

/** Groups do not paint a rectangle; only visible descendants enlarge the page. */
export function visibleDiagramBounds(widgets: Widget[], x = 0, y = 0): { right: number; bottom: number } {
  let right = 1, bottom = 1;
  for (const w of widgets) {
    if (w.css.display === 'none') continue;
    const paint=connectorTextBounds(w);
    const bounds = w.kind === 'group'
      ? visibleDiagramBounds(w.children ?? [], x + w.x, y + w.y)
      : { right: x + w.x + paint.right, bottom: y + w.y + paint.bottom };
    right = Math.max(right, bounds.right);
    bottom = Math.max(bottom, bounds.bottom);
  }
  return { right, bottom };
}

/** Left edge of visible content, used by native centered-page layout. */
export function visibleDiagramLeft(widgets: Widget[], x = 0): number {
  const edges = widgets.filter(w => w.css.display !== 'none').flatMap(w =>
    w.kind === 'group' ? (w.children?.length ? [visibleDiagramLeft(w.children, x + w.x)] : []) : [x + w.x + connectorTextBounds(w).left]);
  return edges.length ? Math.min(...edges) : 0;
}
