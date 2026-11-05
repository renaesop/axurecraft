import {pageStyle} from './page-layout.ts';
import {materializePage,flattenWidgets} from './repeater-model.ts';
import {describeWidgets} from './widget-state.ts';
import {widgetElement,type ElementNode} from './render-tree.ts';
import type { Widget, Page, GlobalVariable } from './model.ts';
export const escapeHtml = (s: unknown):string => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const cssText = (css:Record<string,string>):string => Object.entries(css).map(([k,v])=>`${k}:${v}`).join(';');
const voidElements=new Set(['img','input','br','hr','meta','link']);
export function elementHtml(node:ElementNode|string):string {
  if(typeof node==='string')return escapeHtml(node);
  const attrs=Object.entries(node.attrs).filter(([,v])=>v!==undefined&&v!==false).map(([key,value])=>value===true?` ${key}`:` ${key}="${escapeHtml(value)}"`).join('');
  const style=node.css?` style="${escapeHtml(cssText(node.css))}"`:'';
  return `<${node.tag}${attrs}${style}>`+(voidElements.has(node.tag)?'':node.children.map(elementHtml).join('')+`</${node.tag}>`);
}
export function widgetHtml(w:Widget):string {return elementHtml(widgetElement(w));}
export const baseCss = `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif}.rp-page{position:relative;overflow:hidden}.rp-widget{box-sizing:border-box}.rp-widget>svg,.rp-widget>.rp-image,.rp-content>svg,.rp-content>.rp-image{position:absolute;left:0;top:0;width:100%;height:100%;display:block}.rp-image{border-radius:inherit}.rp-widget[data-kind="ImageBox"] .rp-image{clip-path:inset(calc(var(--rp-image-border-width,0px)/2) round max(0px,calc(var(--rp-image-radius,0px) - var(--rp-image-border-width,0px)/2)))}.rp-widget[data-kind="ImageBox"]::after{content:"";position:absolute;inset:0;border:var(--rp-image-border-width,0px) var(--rp-image-border-style,solid) var(--rp-image-border-color,transparent);border-radius:inherit;pointer-events:none}.rp-text{position:absolute;inset:0;display:flex;flex-direction:column;white-space:pre-wrap;overflow-wrap:break-word;pointer-events:none}.rp-text p{margin:0;width:100%}.rp-state{position:relative;width:100%;height:100%}[hidden]{display:none!important}.rp-widget input,.rp-widget textarea,.rp-widget select{font:inherit;color:inherit;width:100%;height:100%;box-sizing:border-box;border:0;background:transparent;outline-offset:1px}.rp-widget[data-kind="ImageMapRegion"]{cursor:pointer}.rp-widget[data-click]{cursor:pointer}.rp-selection{display:flex;align-items:center;width:100%;height:100%}.rp-selection>.rp-text{position:static;flex:1;padding:0!important}`;
export function pageHtml(page:Page,variables:GlobalVariable[]=[]):string {
  const variableJson=JSON.stringify({definitions:variables,pageName:page.name}).replace(/</g,'\\u003c');
  const repeaters=Object.fromEntries(flattenWidgets(page.widgets).filter(w=>w.repeater).map(w=>[w.id,w.repeater]));
  const repeaterJson=JSON.stringify(repeaters).replace(/</g,'\\u003c');
  page=materializePage(page);
  const widgetsJson=JSON.stringify(describeWidgets(page.widgets)).replace(/</g,'\\u003c');
  const behaviors: Record<string, unknown> = { '$page':page.behaviors };
  const walk=(widgets:Widget[])=>{for(const w of widgets){if(w.behaviors.length)behaviors[w.id]=w.behaviors;if(w.children)walk(w.children);for(const s of w.states??[])walk(s.widgets);}};walk(page.widgets);
  const json=JSON.stringify(behaviors).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.name)}</title><style>${baseCss}</style><script defer src="runtime.js"></script></head><body style="background:${escapeHtml(page.background)}"><main class="rp-page" style="${escapeHtml(cssText(pageStyle(page)))}">${page.widgets.map(widgetHtml).join('')}</main><script type="application/json" id="rp-behaviors">${json}</script><script type="application/json" id="rp-repeaters">${repeaterJson}</script><script type="application/json" id="rp-widgets">${widgetsJson}</script><script type="application/json" id="rp-variables">${variableJson}</script></body></html>`;
}
