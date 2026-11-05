import type { ElementNode } from './render-tree.ts';

export function createNode(node: ElementNode | string, svg = false): Node {
  if (typeof node === 'string') return document.createTextNode(node);
  svg = svg || node.tag === 'svg';
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', node.tag) : document.createElement(node.tag);
  applyAttributes(el, node);
  for (const child of node.children) el.appendChild(createNode(child, svg));
  return el;
}

function applyAttributes(el: Element, node: ElementNode): void {
  const attributes = Object.fromEntries(Object.entries(node.attrs).filter(([,value]) => value !== undefined && value !== false).map(([key,value]) => [key,value === true ? '' : String(value)]));
  // Preserve input nodes and only change attributes that differ. In particular,
  // do not assign .value/.checked: those hold the user's current editing state.
  for (const attr of [...el.attributes]) if (attr.name !== 'style' && !(attr.name in attributes)) el.removeAttribute(attr.name);
  for (const [key, value] of Object.entries(attributes)) if (el.getAttribute(key) !== value) el.setAttribute(key, value);
  const style = (el as HTMLElement | SVGElement).style;
  for (const key of [...style]) if (!(key in (node.css ?? {}))) style.removeProperty(key);
  for (const [key, value] of Object.entries(node.css ?? {})) if (style.getPropertyValue(key) !== value) style.setProperty(key, value);
}

/** Patch only paint content. Stateful controls keep their DOM identity and edits. */
export function patchContent(parent: Element, children: (ElementNode | string)[]): void {
  const svg = parent.namespaceURI === 'http://www.w3.org/2000/svg';
  for (let i = 0; i < children.length; i++) {
    const next = children[i], current = parent.childNodes[i];
    if (!current) { parent.appendChild(createNode(next, svg)); continue; }
    if (typeof next === 'string' && current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next) current.nodeValue = next;
    } else if (typeof next !== 'string' && current instanceof Element && current.localName === next.tag) {
      applyAttributes(current, next); patchContent(current, next.children);
    } else parent.replaceChild(createNode(next, svg), current);
  }
  while (parent.childNodes.length > children.length) parent.lastChild!.remove();
}
