import { field, items, number, object, str, type Graph, type Value } from './graph.ts';
import type { ConversionIssue, Page, PageTreeNode } from './model.ts';

/** The site tree, not package storage order, defines the navigation hierarchy. */
export function readPageTree(doc: Graph, pages: Page[], issues: ConversionIssue[]): PageTreeNode[] | undefined {
  const sitemap = object(doc, field(doc.root?.body, 'sitemap'));
  if (!sitemap) return undefined;
  const root = object(doc, field(sitemap.body, 'tree'));
  const table = new Map((field(sitemap.body, 'node-table')?.entries ?? []).map(([k, v]) => [number(k, Number(k.text)), v]));
  const byId = new Map(pages.map(p => [p.id, p])), seen = new Set<number>(), included = new Set<string>();
  const report = (detail: string) => issues.push({ feature: 'page-directory', detail });
  const visit = (refs: Value[], depth = 0): PageTreeNode[] => refs.flatMap(ref => {
    const node = object(doc, ref), id = node?.id;
    if (id === undefined) { report('Missing sitemap node'); return []; }
    if (seen.has(id) || depth >= 64) { report(`Repeated or excessively nested sitemap node ${id}`); return []; }
    seen.add(id);
    const target = table.get(id), pair = target?.values;
    const pageId = pair ? doc.guids[Number(pair[1]) - 1] : undefined;
    const page = pageId ? byId.get(pageId) : undefined;
    const folder = pair ? undefined : object(doc, target);
    // Mark the parent before visiting its descendants to reject duplicate page references.
    const duplicate = page && included.has(page.id);
    if (page && !duplicate) included.add(page.id);
    const children = visit(items(field(node?.body, 'children')), depth + 1);
    if (page && !duplicate) return [{ id: doc.guids[id - 1] ?? `node-${id}`, name: page.name, pageId: page.id, children }];
    if (folder?.className === 'Axure:MasterTreeFolder') return [{ id: doc.guids[id - 1] ?? `node-${id}`, name: str(field(folder.body, 'name')), children }];
    report(`Unresolved or duplicate sitemap target at node ${id}`);
    return children;
  });
  if (!root) report('Missing sitemap root');
  const tree = root ? visit(items(field(root.body, 'children'))) : [];
  // Some team snapshots contain pages absent from the saved document sitemap.
  // Retain those pages without inventing a parent or changing their file identity.
  for (const page of pages) if (!included.has(page.id)) tree.push({ id: `unlisted-${page.id}`, name: page.name, pageId: page.id, children: [] });
  return tree;
}

export function pageDirectory(project: { pages: Page[]; pageTree?: PageTreeNode[] }): PageTreeNode[] {
  return project.pageTree ?? project.pages.map(p => ({ id: p.id, name: p.name, pageId: p.id, children: [] }));
}
export function firstDirectoryPage(nodes: PageTreeNode[]): string | undefined {
  for (const node of nodes) { const id = node.pageId ?? firstDirectoryPage(node.children); if (id) return id; }
  return undefined;
}
