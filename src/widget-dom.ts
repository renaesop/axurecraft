import {readGeometry} from './motion.ts';
import type { Scalar,WidgetProperty,RichText } from './model.ts';
import {contentElements} from './render-tree.ts';
import {patchContent} from './dom-content.ts';

export function ownedElement<T extends Element>(widget: Element, selector: string): T | undefined {
  return [...widget.querySelectorAll<T>(selector)].find(el => el.closest('.rp-widget') === widget);
}
export function readWidgetValue(id: string, property: WidgetProperty): Scalar | undefined {
  const widget = document.getElementById(id);
  if (!widget) return undefined;
  if(['x','y','width','height','rotation'].includes(property))return readGeometry(id)?.[property as 'x'|'y'|'width'|'height'|'rotation'];
  if(['left','right','top','bottom'].includes(property)){const r=widget.getBoundingClientRect();return r[property as 'left'|'right'|'top'|'bottom']+(['left','right'].includes(property)?scrollX:scrollY);}
  if(property==='state'){const states=[...widget.querySelectorAll<HTMLElement>(':scope > .rp-state')];return (states.find(s=>s.dataset.state===widget.dataset.activeState)??states.find(s=>!s.hidden))?.dataset.stateName;}
  if(property==='visible')return getComputedStyle(widget).display!=='none';
  if(property==='disabled')return widget.getAttribute('aria-disabled')==='true';
  const input = ownedElement<HTMLInputElement>(widget, 'input,textarea,select');
  if (property === 'selected') return input && ['checkbox', 'radio'].includes(input.type) ? input.checked : widget.getAttribute('aria-selected') === 'true';
  if (input && !['checkbox', 'radio'].includes(input.type)) return input.value;
  const text = ownedElement<HTMLElement>(widget, '.rp-text');
  return text ? [...text.children].map(p => p.textContent ?? '').join('\n') : '';
}

export function writeWidgetText(id: string, value: string, richText?:RichText): void {
  const widget = document.getElementById(id); if (!widget) return;
  const input = ownedElement<HTMLInputElement>(widget, 'input,textarea,select');
  if (input && !['checkbox', 'radio'].includes(input.type)) { input.value = value; return; }
  const text = ownedElement<HTMLElement>(widget, '.rp-text');
  if (!text) return;
  if(richText){
    patchContent(text,contentElements(richText)[0].children);
    for(const [key,value]of Object.entries(richText.css))text.style.setProperty(key,value);
    return;
  }
  const paragraph = text.firstElementChild?.cloneNode(false) as HTMLElement | undefined ?? document.createElement('p');
  const run=document.createElement('span');
  run.style.cssText=(text.querySelector('span') as HTMLElement|null)?.style.cssText??'';
  run.style.removeProperty('pointer-events');run.style.removeProperty('cursor');
  run.textContent = value; paragraph.append(run); text.replaceChildren(paragraph);
}
export function writeWidgetSelected(id: string, value: boolean): void {
  const widget = document.getElementById(id); if (!widget) return;
  widget.setAttribute('aria-selected', String(value));
  const input = ownedElement<HTMLInputElement>(widget, 'input[type=checkbox],input[type=radio]');
  if (input) input.checked = value;
}
