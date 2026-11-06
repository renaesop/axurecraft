import { useState, type ReactNode, type SyntheticEvent } from 'react';
import type { PageTreeNode } from './model.ts';

const stopPreviewEvent = (event: SyntheticEvent) => event.stopPropagation();

interface PreviewPage { id: string; name: string; file: string }
const previewCss = `.rp-preview-tools{position:fixed;top:12px;right:12px;z-index:2147483647;font:14px system-ui;color:#17212e}.rp-preview-tools button{float:right;padding:10px 16px;border:1px solid #dce1e7;border-radius:8px;background:#fff;color:inherit;cursor:pointer;box-shadow:0 2px 12px #16223822}.rp-preview-panel{clear:both;position:relative;top:8px;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 80px);overflow:auto;background:#fff;border:1px solid #dce1e7;border-radius:8px;padding:16px;box-shadow:0 8px 36px #16223822}.rp-preview-panel nav{width:max-content;min-width:100%;white-space:nowrap}.rp-preview-panel ul{list-style:none;margin:0;padding:0}.rp-preview-panel ul ul{padding-left:16px}.rp-preview-panel summary{cursor:pointer}.rp-preview-panel a,.rp-preview-panel .folder{display:block;padding:10px;text-decoration:none;color:inherit;border-radius:6px}.rp-preview-panel summary a,.rp-preview-panel summary .folder{display:inline-block}.rp-preview-panel a:hover,.rp-preview-panel a[aria-current=page]{background:#e9f0ff;color:#245ac3}`;

function DirectoryEntries({ nodes, pages, activePageId }: { nodes: PageTreeNode[]; pages: Map<string, PreviewPage>; activePageId: string }) {
  return <ul>{nodes.map(node => {
    const page = node.pageId ? pages.get(node.pageId) : undefined;
    const label = page
      ? <a href={`?page=${encodeURIComponent(page.file)}`} data-page-id={page.id} aria-current={page.id === activePageId ? 'page' : undefined}>{node.name}</a>
      : <span className="folder">{node.name}</span>;
    return <li key={node.id}>{node.children.length
      ? <details open><summary>{label}</summary><DirectoryEntries nodes={node.children} pages={pages} activePageId={activePageId} /></details>
      : label}</li>;
  })}</ul>;
}

/** Keep the prototype in this document so DevTools, coordinates and DOM events
 * all refer to the same React root. The directory overlays rather than offsets it. */
export function PrototypePreview({ directory, pages, activePageId, children }: { directory: PageTreeNode[]; pages: PreviewPage[]; activePageId: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return <>
    {children}
    <style>{previewCss}</style>
    <section className="rp-preview-tools" aria-label="原型预览工具" onClick={stopPreviewEvent} onDoubleClick={stopPreviewEvent} onPointerDown={stopPreviewEvent} onPointerMove={stopPreviewEvent} onPointerUp={stopPreviewEvent} onMouseDown={stopPreviewEvent} onMouseMove={stopPreviewEvent} onMouseUp={stopPreviewEvent} onKeyDown={stopPreviewEvent} onKeyUp={stopPreviewEvent} onContextMenu={stopPreviewEvent}>
      <button type="button" aria-expanded={open} aria-controls="rp-preview-directory" onClick={() => setOpen(value => !value)}>页面目录</button>
      <div id="rp-preview-directory" className="rp-preview-panel" hidden={!open}>
        <nav aria-label="页面目录"><DirectoryEntries nodes={directory} pages={new Map(pages.map(page => [page.id, page]))} activePageId={activePageId} /></nav>
      </div>
    </section>
  </>;
}
