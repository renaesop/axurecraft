import type { Css, Widget, WidgetContent, RichText } from './model.ts';
import {panelCss} from './panel.ts';
import {layoutTable,tableRows} from './table.ts';
/** Target-independent element tree, derived from semantic content only at code generation. */
export interface ElementNode { tag:string; attrs:Record<string,string|number|boolean|undefined>; css?:Css; children:(ElementNode|string)[] }
export const element=(tag:string,attrs:ElementNode['attrs']={},children:ElementNode['children']=[],css?:Css):ElementNode=>({tag,attrs,children,css});
const textElement=(text:RichText):ElementNode=>element('div',{class:'rp-text'},text.paragraphs.map(p=>element('p',{},p.runs.length?p.runs.map(run=>element('span',run.link?{class:'rp-inline-link',role:'link',tabindex:0,'data-rp-link':JSON.stringify(run.link.behaviors)}:{},[run.text],run.link?{...run.css,'pointer-events':'auto',cursor:'pointer'}:run.css)):[element('br')],p.css)),text.css);
/** Axure image masks use cubic corners with a .555 tangent, not CSS circular arcs. */
export function imageFramePath(width:number,height:number,radius:number,borderWidth:number):string {
  const inset=Math.min(borderWidth/2,width/2,height/2),l=inset,t=inset,r=width-inset,b=height-inset;
  const rx=Math.max(0,Math.min(radius,width/2,height/2)-inset),ry=rx,kx=rx*.555,ky=ry*.555;
  return `M ${l+rx} ${b} C ${l+rx-kx} ${b} ${l} ${b-ry+ky} ${l} ${b-ry} L ${l} ${t+ry} C ${l} ${t+ry-ky} ${l+rx-kx} ${t} ${l+rx} ${t} L ${r-rx} ${t} C ${r-rx+kx} ${t} ${r} ${t+ry-ky} ${r} ${t+ry} L ${r} ${b-ry} C ${r} ${b-ry+ky} ${r-rx+kx} ${b} ${r-rx} ${b} Z`;
}
export function contentElements(content:WidgetContent):ElementNode[]{
  switch(content.kind){
    case 'frame':return [element('iframe',{src:content.src,name:content.name,title:content.title,scrolling:content.scrolling},[],{width:'100%',height:'100%',border:content.border?'1px solid #797979':'0',display:'block'})];
    case 'text':return [textElement(content)];
    case 'image':{
      const f=content.frame;
      if(!f)return [element('img',{class:'rp-image',src:content.asset??undefined,alt:content.alt,hidden:!content.asset})];
      const d=imageFramePath(f.width,f.height,f.radius,f.borderWidth);
      return [element('svg',{class:'rp-framed-image',hidden:!content.asset,width:f.width,height:f.height,viewBox:`0 0 ${f.width} ${f.height}`,role:'img','aria-label':content.alt},[
        element('defs',{},[element('mask',{id:f.id,maskUnits:'userSpaceOnUse',x:0,y:0,width:f.width,height:f.height},[element('path',{d,fill:'white','fill-rule':'evenodd'})])]),
        element('image',{href:content.asset??undefined,width:f.width,height:f.height,preserveAspectRatio:'none',mask:`url(#${f.id})`}),
        element('path',{d,fill:'none',stroke:f.borderColor,'stroke-width':f.borderWidth}),
      ])];
    }
    case 'vector':{
      const defs:ElementNode[]=[...content.gradients.map(g=>element('linearGradient',{id:g.id,x1:g.from.x,y1:g.from.y,x2:g.to.x,y2:g.to.y},g.stops.map(s=>element('stop',{offset:s.offset,'stop-color':s.color,'stop-opacity':s.opacity})))),...content.markers.map(m=>element('marker',{id:m.id,markerWidth:6,markerHeight:6,refX:6,refY:3,viewBox:'0 0 6 6',orient:'auto-start-reverse',markerUnits:'strokeWidth'},[element('path',{d:m.data,fill:m.filled?m.color:'none',stroke:m.color,'stroke-width':1})]))];
      const paths=content.paths.map(p=>element('path',{d:p.data,fill:p.fill,'fill-opacity':p.fillOpacity,...(p.stroke===undefined?{}:{stroke:p.stroke,'stroke-opacity':p.strokeOpacity,'stroke-width':p.strokeWidth,'stroke-linejoin':'miter','stroke-dasharray':p.dashArray,'marker-start':p.markerStart?`url(#${p.markerStart})`:undefined,'marker-end':p.markerEnd?`url(#${p.markerEnd})`:undefined})}));
      return [element('svg',{class:'ax-vector',xmlns:'http://www.w3.org/2000/svg',width:content.width,height:content.height,viewBox:`0 0 ${Math.max(content.width,0.001)} ${Math.max(content.height,0.001)}`,'aria-hidden':'true'},[...(defs.length?[element('defs',{},defs)]:[]),...paths],{position:'absolute',inset:'0',overflow:'visible','pointer-events':'none'})];
    }
    case 'control':{
      const c=content;
      const attrs={'aria-label':c.label,disabled:c.disabled,readonly:c.readOnly,maxlength:c.maxLength,'data-hide-hint-on-focus':c.hideHintOnFocus};
      if(c.control==='textarea')return [element('textarea',{...attrs,placeholder:c.placeholder},[c.value])];
      if(c.control==='radio'||c.control==='checkbox')return [element('label',{class:'rp-selection'},[element('input',{type:c.control,name:c.group,checked:c.checked,disabled:c.disabled,'data-custom-indicator':c.indicator?true:undefined},[],{...c.indicator,...(c.indicator?{appearance:'none',position:'relative'}:{}),width:'13px',height:'13px',margin:'0 3px 0 0','flex-shrink':'0'}),...(c.richLabel?[textElement(c.richLabel)]:[c.value])])];
      if(c.control==='button')return [element('button',{disabled:c.disabled},[c.value],{width:'100%',height:'100%',font:'inherit'})];
      if(c.control==='select')return [element('select',{...attrs,multiple:c.multiple,value:c.multiple?undefined:c.value,size:c.listBox?Math.max(2,c.options?.length??0):undefined},(c.options??[]).map((o,i)=>element('option',{value:o.value,selected:c.multiple?c.selectedValues?.includes(o.value):i===(c.options??[]).findIndex(o=>o.value===c.value)},[o.label])))];
      return [element('input',{...attrs,type:c.inputType??'text',value:c.inputType==='file'?undefined:c.value,placeholder:c.placeholder})];
    }
  }
}
export function widgetStyle(w:Widget):Css {
  // Native group wrappers have zero size: only descendants participate in hits.
  // Semantic width/height still describe member bounds for layout and editing.
  return {...w.css,position:'absolute',left:`${w.x}px`,top:`${w.y}px`,width:`${w.kind==='group'?0:w.width}px`,height:`${w.kind==='group'?0:w.height}px`,...panelCss(w)};
}
export function widgetElement(w:Widget):ElementNode {
  w=layoutTable(w);
  const states=w.states?.map((s,i)=>element('div',{class:'rp-state','data-state':s.id,'data-state-name':s.name,hidden:i>0},s.widgets.map(widgetElement),s.css))??[];
  const content=w.content.flatMap(contentElements);
  const children=w.table?tableRows(w).map(row=>element('div',{role:'row'},row.map(widgetElement),{display:'contents'})):(w.children??[]).map(widgetElement);
  return element('div',{class:'rp-widget',id:w.id,inert:w.type==='SnapshotSurface'?true:undefined,'data-kind':w.type,'data-name':w.name,role:w.tree?w.tree.root?'tree':'treeitem':w.table?'table':w.type==='TableCell'?'cell':undefined,'aria-expanded':w.tree?.nodes.length&&!w.tree.root?String(w.tree.expanded):undefined,'aria-label':w.table?w.name||'Table':undefined,'aria-selected':w.selected===undefined?undefined:String(w.selected)},[...(w.adaptive||Object.values(w.variants??{}).some(v=>v.content)?[element('div',{class:'rp-content'},content,{display:'contents'})]:content),...children,...states],widgetStyle(w));
}
