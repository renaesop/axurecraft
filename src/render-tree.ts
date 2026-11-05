import type { Css, Widget, WidgetContent, RichText } from './model.ts';
/** Target-independent element tree, derived from semantic content only at code generation. */
export interface ElementNode { tag:string; attrs:Record<string,string|number|boolean|undefined>; css?:Css; children:(ElementNode|string)[] }
export const element=(tag:string,attrs:ElementNode['attrs']={},children:ElementNode['children']=[],css?:Css):ElementNode=>({tag,attrs,children,css});
const textElement=(text:RichText):ElementNode=>element('div',{class:'rp-text'},text.paragraphs.map(p=>element('p',{},p.runs.length?p.runs.map(run=>element('span',{},[run.text],run.css)):[element('br')],p.css)),text.css);
export function contentElements(content:WidgetContent):ElementNode[]{
  switch(content.kind){
    case 'text':return [textElement(content)];
    case 'image':return [element('img',{class:'rp-image',src:content.asset,alt:content.alt})];
    case 'vector':{
      const defs:ElementNode[]=[...content.gradients.map(g=>element('linearGradient',{id:g.id,x1:g.from.x,y1:g.from.y,x2:g.to.x,y2:g.to.y},g.stops.map(s=>element('stop',{offset:s.offset,'stop-color':s.color,'stop-opacity':s.opacity})))),...content.markers.map(m=>element('marker',{id:m.id,markerWidth:6,markerHeight:6,refX:6,refY:3,viewBox:'0 0 6 6',orient:'auto-start-reverse',markerUnits:'strokeWidth'},[element('path',{d:m.data,fill:m.filled?m.color:'none',stroke:m.color,'stroke-width':1})]))];
      const paths=content.paths.map(p=>element('path',{d:p.data,fill:p.fill,'fill-opacity':p.fillOpacity,...(p.stroke===undefined?{}:{stroke:p.stroke,'stroke-opacity':p.strokeOpacity,'stroke-width':p.strokeWidth,'stroke-linejoin':'miter','stroke-dasharray':p.dashArray,'marker-start':p.markerStart?`url(#${p.markerStart})`:undefined,'marker-end':p.markerEnd?`url(#${p.markerEnd})`:undefined})}));
      return [element('svg',{class:'ax-vector',xmlns:'http://www.w3.org/2000/svg',width:content.width,height:content.height,viewBox:`0 0 ${Math.max(content.width,0.001)} ${Math.max(content.height,0.001)}`,'aria-hidden':'true'},[...(defs.length?[element('defs',{},defs)]:[]),...paths],{position:'absolute',inset:'0',overflow:'visible','pointer-events':'none'})];
    }
    case 'control':{
      const c=content;
      const attrs={'aria-label':c.label,disabled:c.disabled,readonly:c.readOnly};
      if(c.control==='textarea')return [element('textarea',{...attrs,placeholder:c.placeholder},[c.value])];
      if(c.control==='radio'||c.control==='checkbox')return [element('label',{class:'rp-selection'},[element('input',{type:c.control,name:c.group,checked:c.checked,disabled:c.disabled},[],{width:'13px',height:'13px',margin:'0 3px 0 0','flex-shrink':'0'}),...(c.richLabel?[textElement(c.richLabel)]:[c.value])])];
      if(c.control==='button')return [element('button',{disabled:c.disabled},[c.value],{width:'100%',height:'100%',font:'inherit'})];
      if(c.control==='select')return [element('select',attrs,(c.options??[]).map(o=>element('option',{value:o.value},[o.label])))];
      return [element('input',{...attrs,value:c.value,placeholder:c.placeholder})];
    }
  }
}
export function widgetStyle(w:Widget):Css {
  // Native group wrappers have zero size: only descendants participate in hits.
  // Semantic width/height still describe member bounds for layout and editing.
  return {...w.css,position:'absolute',left:`${w.x}px`,top:`${w.y}px`,width:`${w.kind==='group'?0:w.width}px`,height:`${w.kind==='group'?0:w.height}px`};
}
export function widgetElement(w:Widget):ElementNode {
  const states=w.states?.map((s,i)=>element('div',{class:'rp-state','data-state':s.id,hidden:i>0},s.widgets.map(widgetElement),s.css))??[];
  const content=w.content.flatMap(contentElements);
  return element('div',{class:'rp-widget',id:w.id,'data-kind':w.type,'data-name':w.name,'aria-selected':w.selected===undefined?undefined:String(w.selected)},[...(Object.values(w.variants??{}).some(v=>v.content)?[element('div',{class:'rp-content'},content,{display:'contents'})]:content),...(w.children??[]).map(widgetElement),...states],widgetStyle(w));
}
