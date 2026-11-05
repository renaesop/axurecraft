import {readGlobalVariables} from './native-variables.ts';
import {readTable,tableCellCss} from './native-table.ts';
import {layoutTable} from './table.ts';
import {inputTypes} from './controls.ts';
import {readLinkTarget} from './native-link.ts';
import {flattenWidgets,materializeWidgets} from './repeater-model.ts';
import { createHash } from 'node:crypto';
import { type Graph, type Value, parseProject, field, number, str, bool, items, object, prop } from './graph.ts';
import { P, resolveStyle, resolveStyleDelta, styleProperties, styleToCss, textRunToCss, fillToCss } from './styles.ts';
import {parseConnector} from './connector.ts';
import { parseVector, isCssRectangle } from './vector.ts';
import { readBehaviors } from './interactions.ts';
import { repeaterRows } from './repeater.ts';
import { nestGroups, visibleDiagramBounds, visibleDiagramLeft } from './groups.ts';
import type { Project, Widget, Page, ConversionIssue, RichText, FormControl, SourceReference, ImageContent } from './model.ts';

export interface Conversion { project:Project; assets:Map<string,Buffer> }
export function convertRp9(data:Buffer):Conversion {
  const source=parseProject(data);
  const doc=source.graphs.find(g=>g.className==='Axure:DesignDocument');
  if(!doc?.root)throw new Error('DesignDocument is missing');
  const variables=readGlobalVariables(doc);
  const issues:ConversionIssue[]=[];
  const assets=new Map<string,Buffer>();
  const imagesByHash=new Map<string,Value>();
  const collectImages=(node:Value):void=>{
    if(node.entries){
      const hash=str(field(node,'Hash'));
      if(hash&&field(node,'Stream')?.tag===4)imagesByHash.set(hash,node);
      for(const[k,v]of node.entries){collectImages(k);collectImages(v);}
    }
    for(const child of node.items??[])collectImages(child);
    if(node.body)collectImages(node.body);
  };
  for(const g of source.graphs)for(const root of g.roots)collectImages(root);
  const pageGraphs=source.graphs.filter(g=>g.className==='Axure:Page');
  const graphByGuid=new Map(source.graphs.map(g=>[g.guids[1],g]));
  const names=new Map<string,string>();
  for(const ref of items(field(doc.root.body,'PackageInfos'))){
    const info=object(doc,ref);const pair=field(info?.body,'package-id')?.values;
    if(pair)names.set(doc.guids[Number(pair[1])-1],str(field(info?.body,'package-name')));
  }
  const pageByGuid=new Map(pageGraphs.map((g,i)=>[g.guids[1],`page-${i+1}.html`]));
  const idFor=(g:Graph,w:Value)=>`w-${g.guids[(w.id??0)-1]??`${g.record.index}-${w.id}`}`;
  const asset=(image:Value|undefined):string|undefined=>{
    if(image&&field(image,'Stream')?.tag!==4)image=imagesByHash.get(str(field(image,'Hash')))??image;
    const stream=field(image,'Stream');
    if(stream?.tag!==4||typeof stream.value!=='string')return undefined;
    const bytes=Buffer.from(stream.value,'base64');
    // Identify bytes, never trust a document-supplied path or executable suffix.
    const ext=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'png':bytes[0]===255&&bytes[1]===216?'jpg':bytes.subarray(0,3).toString()==='GIF'?'gif':/^(?:\s*<\?xml[^>]*\?>)?\s*<svg[\s>]/.test(bytes.subarray(0,1024).toString())?'svg':null;
    if(!ext){issues.push({feature:'image-format',detail:'Unsupported embedded image format'});return undefined;}
    const filename=`assets/${createHash('sha256').update(bytes).digest('hex').slice(0,24)}.${ext}`;
    assets.set(filename,bytes);return filename;
  };
  const richText=(w:Value,props:Map<number,Value>,override?:string,textOverrides:Map<number,Value>=new Map()):RichText|undefined=>{
    const block=field(w.body,'RichTextBlock')??field(w.body,'TextBlock');
    const paragraphs=items(field(field(block,'attributed-string'),'Paragraphs'));
    const css=styleToCss(props);
    if(bool(field(w.body,'AutoFitWidth')))css['white-space']='pre';
    const overrideCss=styleToCss(textOverrides);
    const runKeys=['font-family','font-size','font-weight','font-style','color','letter-spacing','text-decoration'];
    const inlineRuns=(nodes:Value[]):Value[]=>nodes.flatMap(run=>field(run,'Inlines')?inlineRuns(items(field(run,'Inlines'))):[run]);
    const authoredRuns=paragraphs.flatMap(p=>inlineRuns(items(field(p,'Inlines')))).map(textRunToCss);
    // Uniform attributed-string values are the cached text baseline. Widget
    // style overrides (including named styles) are authoritative for those.
    const uniform=new Set(runKeys.filter(key=>authoredRuns.length>0&&authoredRuns.every(run=>run[key]===authoredRuns[0][key])));
    for(const key of Object.keys(css))if(key.startsWith('border')||['background','opacity','transform','box-shadow','display','box-sizing'].includes(key))delete css[key];
    const resolvedTextCss=css;
    if(paragraphs.length)return {kind:'text',css,paragraphs:(override===undefined?paragraphs:paragraphs.slice(0,1)).map(p=>{
      const align=['left','center','right','justify'][number(field(p,'HorizontalAlignment'))]??'left';
      const lineSpacing=number(field(p,'LineSpacing'));
      const css:Record<string,string>={'text-align':overrideCss['text-align']??align};if(lineSpacing>0)css['line-height']=`${lineSpacing*4/3}px`;
      const inlines=inlineRuns(items(field(p,'Inlines')));
      const runs=override===undefined?inlines.map(run=>({text:str(field(run,'Text')),css:textRunToCss(run)})):[{text:override,css:inlines[0]?textRunToCss(inlines[0]):{}}];
      for(const run of runs)for(const key of runKeys){if(uniform.has(key)&&resolvedTextCss[key]!==undefined)delete run.css[key];else if(overrideCss[key]!==undefined)run.css[key]=overrideCss[key];}
      return {css,runs};
    })};
    const text=override??str(field(block,'text'));
    return text||['Axure:DiagramObject:VectorShape','Axure:DiagramObject:TableCell'].includes(w.className??'')?{kind:'text',css,paragraphs:[{css:{},runs:[{text,css:{}}]}]}:undefined;
  };
  const sourceRef=(g:Graph,w:Value):SourceReference=>({record:g.record.index,objectId:w.id??-1,guid:g.guids[(w.id??0)-1]??'',className:w.className??''});
  // Paint image borders over the full-size image; CSS box borders would shrink
  // the raster by twice the border width, unlike the native SVG image export.
  const imageBoxCss=(css:Record<string,string>):void=>{
    css['--rp-image-border-width']=css['border-width']??'0px';
    css['--rp-image-border-color']=css['border-color']??'transparent';
    css['--rp-image-border-style']=css['border-style']??'solid';
    css['--rp-image-radius']=css['border-radius']??'0px';
    css['border-width']='0px';
    css.background='transparent';
    css['--rp-image-frame-display']='none';
  };
  const imageFrame=(css:Record<string,string>,width:number,height:number,id:string):ImageContent['frame']=>({id:id+'-image-mask',width,height,radius:parseFloat(css['--rp-image-radius'])||0,borderWidth:css['--rp-image-border-style']==='none'?0:parseFloat(css['--rp-image-border-width'])||0,borderColor:css['--rp-image-border-color']});
  let widgetCount=0,panelCount=0,repeaterCount=0;
  function diagram(g:Graph,d:Value|undefined,depth=0,prefix='',templateImages?:Set<string>):Widget[]{
    if(depth>20){issues.push({feature:'nesting',detail:'Diagram nesting exceeds 20'});return [];}
    const list=items(field(d?.body,'diagram-objects')).map(ref=>object(g,ref)).filter((w):w is Value=>!!w);
    const result:Widget[]=[];
    const groupMembers=new Map<string,string[]>();
    for(const w of list){
      const type=w.className?.replace('Axure:DiagramObject:','')??'unknown';
      const props=resolveStyle(g,w,doc);const textOverrides=styleProperties(prop(g,w,'MyStyle'));const pos=props.get(P.LOCATION),size=props.get(P.SIZE);
      const x=number(field(pos,'X')),y=number(field(pos,'Y'));
      const width=Math.max(0,number(field(size,'Width'))),height=Math.max(0,number(field(size,'Height')));
      const css=styleToCss(props);
      // Padding and text flex alignment belong to the overlay, not the outer geometry.
      for(const key of Object.keys(css))if(key.startsWith('padding')||key==='justify-content')delete css[key];
      if(!bool(field(w.body,'VisibleFromSettings'),true))css.display='none';
      const widget:Widget={id:prefix+idFor(g,w),type,name:str(field(field(w.body,'name-block'),'text')),x,y,width,height,css,content:[],source:sourceRef(g,w),kind:'unsupported',behaviors:readBehaviors(g,w,pageByGuid,issues,!!templateImages||type==='Repeater',variables,asset)};
      if(bool(field(w.body,'Disabled')))widget.disabled=true;
      if(items(field(w.body,'AdaptiveStyles')).some(ref=>styleProperties(object(g,ref),true).size))issues.push({widget:widget.id,feature:'adaptive-view',detail:'Base view retained; adaptive style overrides and breakpoint switching are not implemented'});
      const paragraphs=items(field(field(field(w.body,'RichTextBlock'),'attributed-string'),'Paragraphs'));
      if(paragraphs.some(p=>items(field(p,'Inlines')).some(run=>field(run,'Link'))))issues.push({widget:widget.id,feature:'inline-link',detail:'Inline hyperlink text and formatting retained; hyperlink-specific interactions are not implemented'});
      if(bool(field(w.body,'Selected')))widget.selected=true;
      const selectedStyle=object(g,field(props.get(P.IX_STYLES),'Selected'));
      const selectionGroup=str(field(w.body,'SelectedStyleGroup'));
      if(selectionGroup)widget.selectionGroup=prefix+selectionGroup;
      const disabledStyle=object(g,field(props.get(P.IX_STYLES),'Disabled'));
      widgetCount++;
      if(type==='Layer'){
        widget.kind='group';
        // A group has no painted background/border or inherited text style.
        widget.css=css.display==='none'?{display:'none'}:{};
        groupMembers.set(widget.id,items(field(w.body,'DiagramObjects')).map(ref=>{
          const member=object(g,ref);
          if(!member)throw new Error(`Unresolved group member in record ${g.record.index}, group ${w.id}`);
          return prefix+idFor(g,member);
        }));
        if(number(props.get(P.ROTATION))||number(props.get(P.OPACITY),1)!==1||bool(field(w.body,'Propagate'))){
          issues.push({widget:widget.id,feature:'group-style',detail:'Group rotation, opacity or propagated interaction styles require native verification; child geometry and styles retained'});
        }
      }else if(type==='InlineFrame'){
        widget.kind='frame';css.border='0';css.background='transparent';
        try{
          const target=readLinkTarget(g,w,prop(g,w,'DefaultTarget'),pageByGuid,variables);
          const src=target.kind==='link'&&typeof target.value==='string'?target.value:'about:blank';
          widget.content.push({kind:'frame',src:src||'about:blank',name:widget.id,title:widget.name||'Embedded page',border:bool(field(w.body,'ShowBorder')),scrolling:({0:'no',1:'auto',2:'yes'} as const)[number(field(w.body,'Scrollbars')) as 0|1|2]??'auto'});
          if(target.expression)widget.behaviors.unshift({event:'load',actions:[{...target,navigation:'frame',target:widget.id}]});
        }catch(error){issues.push({widget:widget.id,feature:'frame-target',detail:String(error)});}
      }else if(type==='MenuObject'){
        widget.kind='menu';css.background='transparent';css.border='0';
        widget.children=diagram(g,w,depth+1,prefix,templateImages);
        if(items(field(w.body,'submenus')).length)issues.push({widget:widget.id,feature:'menu-submenu',detail:'Top-level menu table retained; submenu opening and positioning are not implemented'});
      }else if(type==='Table'){
        widget.children=diagram(g,w,depth+1,prefix,templateImages);
        widget.css=css.display==='none'?{display:'none'}:{};
        try{
          const {table,cellIds}=readTable(g,w),byId=new Map(widget.children.map(c=>[c.source.objectId,c]));
          if(cellIds.length!==widget.children.length||cellIds.some(id=>!byId.has(id)))throw new Error('Table cells do not match diagram objects');
          widget.kind='table';widget.table=table;widget.children=cellIds.map(id=>byId.get(id)!);
          Object.assign(widget,layoutTable(widget));
        }catch(error){issues.push({widget:widget.id,feature:'table-structure',detail:String(error)});}
      }else if(type==='TableCell'){
        widget.kind='shape';tableCellCss(w,css);
        const text=richText(w,props,undefined,textOverrides);if(text)widget.content.push(text);
      }else if(type==='ImageMapRegion'){
        widget.kind='hotspot';
        css.background='transparent';css.border='0';
      }else if(type==='Connector'){
        widget.kind='shape';const connector=parseConnector(g,w,props,widget.id);
        if(connector){const {graphic,...geometry}=connector;Object.assign(widget,geometry);widget.css={...css,background:'transparent',border:'0'};widget.content.push(graphic);}
        else issues.push({widget:widget.id,feature:'connector',detail:'Connector geometry is incomplete'});
      }else if(type==='VectorShape'||type==='Line'){
        widget.kind='shape';
        const cssRectangle=isCssRectangle(w,props,width,height);
        const svg=cssRectangle?undefined:parseVector(w,props,width,height,widget.id);
        if(svg){delete css.background;delete css['border-width'];delete css['border-style'];delete css['border-color'];}
        else if(!cssRectangle)issues.push({widget:widget.id,feature:'vector',detail:`No path data for ${type}`});
        if(svg)widget.content.push(svg);
        const text=richText(w,props,undefined,textOverrides);if(text)widget.content.push(text);
      }else if(type==='ImageBox'){
        widget.kind='image';imageBoxCss(css);
        const src=asset(props.get(P.IMAGE));
        widget.content.push({kind:'image',asset:src??null,alt:widget.name,frame:imageFrame(css,width,height,widget.id)});
        if(!src&&!templateImages?.has(widget.source.guid))issues.push({widget:widget.id,feature:'image',detail:'Image Stream unavailable'});
        const text=richText(w,props,undefined,textOverrides);if(text)widget.content.push(text);
      }else if(type==='DynamicPanel'){
        widget.panel={percentWidth:bool(field(w.body,'is-percent-width')),fitToContent:bool(field(w.body,'fit-to-content'))};
        if(bool(field(w.body,'is-fixed')))widget.panel.fixed={horizontal:(['left','center','right'] as const)[number(field(w.body,'horizontal-pin-alignment'))]??'left',vertical:(['top','center','bottom'] as const)[number(field(w.body,'vertical-pin-alignment'))]??'top',marginX:number(field(w.body,'horizontal-pin-margin')),marginY:number(field(w.body,'vertical-pin-margin')),keepInFront:bool(field(w.body,'keep-pinned-in-front'))};
        if(bool(field(w.body,'propagate-styles')))issues.push({widget:widget.id,feature:'panel-style-propagation',detail:'Panel interaction style propagation is not implemented'});
        widget.kind='panel';panelCount++;css.background='transparent';css.border='0';css['overflow-x']=[1,3].includes(number(field(w.body,'scrollbars')))?'auto':'hidden';css['overflow-y']=[1,2].includes(number(field(w.body,'scrollbars')))?'auto':'hidden';
        widget.states=[];
        for(const ref of items(field(w.body,'panel-diagrams'))){
          const guid=g.guids[Number(ref.values?.[1])-1];const state=graphByGuid.get(guid);
          const stateDiagram=state&&[...state.objects.values()].find(o=>o.className==='Axure:PanelDiagram');
          if(state&&stateDiagram){
            const stateStyle=prop(state,stateDiagram,'PanelDiagramStyle');
            const stateCss=stateStyle?styleToCss(resolveStyle(state,stateStyle,doc)):{};
            widget.states.push({id:guid,name:str(field(stateDiagram.body,'Name')),css:stateCss,widgets:diagram(state,stateDiagram,depth+1,prefix,templateImages)});
          }
          else issues.push({widget:widget.id,feature:'panel-state',detail:`Missing state ${guid}`});
        }
        if(bool(field(w.body,'fit-to-content'))&&widget.states.length){
          const bounds=widget.states.map(s=>visibleDiagramBounds(s.widgets));
          widget.width=bounds[0].right;widget.height=bounds[0].bottom;
          if(!number(field(w.body,'scrollbars')))css.overflow='visible';
          if(bounds.some(b=>b.right!==bounds[0].right||b.bottom!==bounds[0].bottom))issues.push({widget:widget.id,feature:'panel-auto-fit',detail:'Initial state content bounds applied; resizing between differently sized states requires runtime support'});
        }
      }else if(type==='Repeater'||type==='Axure:Repeater'){
        widget.kind='repeater';repeaterCount++;css.background='transparent';css.border='0';
        const base=prop(g,w,'BaseDiagram');const dataset=prop(g,w,'Data');const rows=items(field(dataset?.body,'rows'));
        const rowData=repeaterRows(g,w,variables);
        for(const detail of rowData.issues)issues.push({widget:widget.id,feature:'repeater-data-binding',detail});
        const repStyle=styleProperties(prop(g,w,'RepeaterStyle'));
        const rawPageSize=number(repStyle.get(P.ITEMS_PER_PAGE),0xffffffff);
        const perPage=rawPageSize===0xffffffff?0:Math.max(0,Math.floor(rawPageSize));
        const template=diagram(g,base,depth+1,'',new Set(rowData.programs.filter(p=>p.kind==='image').map(p=>p.target)));
        const columns=items(field(dataset?.body,'columns')).map(ref=>{
          const column=object(g,ref);return {id:number(field(column?.body,'variable-id'),-1),name:str(field(column?.body,'name'))};
        });
        const bindings=rowData.programs.flatMap(program=>{
          const image=program.image?asset(program.image):undefined;
          const expression=program.expression??(image?{kind:'literal' as const,value:image}:undefined);
          return expression?[{targetGuid:program.target,property:program.kind,expression,sourceText:program.sourceText}]:[];
        });
        widget.repeater={columns,bindings,template,isolateRadioGroups:bool(field(w.body,'IsolateRadioGroups'),true),isolateSelectionGroups:bool(field(w.body,'IsolateSelectionGroups'),true),templateSource:sourceRef(g,base??w),layout:{direction:bool(repStyle.get(P.VERTICAL),true)?'vertical':'horizontal',horizontalSpacing:number(repStyle.get(P.HORIZONTAL_SPACING)),verticalSpacing:number(repStyle.get(P.VERTICAL_SPACING)),pageSize:perPage,startPage:Math.max(1,number(repStyle.get(P.START_PAGE),1)),wrap:number(repStyle.get(P.WRAP),0xffffffff)===0xffffffff?0:number(repStyle.get(P.WRAP)),paddingLeft:number(repStyle.get(P.PADDING_LEFT)),paddingTop:number(repStyle.get(P.PADDING_TOP))},rows:rows.map((ref,index)=>{
          const row=object(g,ref);
          const cells=Object.fromEntries(items(field(row?.body,'elements')).map(ref=>{
            const cell=object(g,ref),id=number(field(cell?.body,'column-id'),-1),type=number(field(cell?.body,'type'),-1);
            return [String(id),type===0?{kind:'text' as const,value:str(field(cell?.body,'value'))}:type===2?{kind:'image' as const,asset:asset(field(cell?.body,'value-image'))??null}:{kind:'unsupported' as const,type}];
          }));
          return {id:String(index),cells};
        })};
      }else if(['TextBox','TextArea','RadioButton','Checkbox','CheckBox','ComboBox','DropList','ListBox','Button'].includes(type)){
        widget.kind='control';
        const control:FormControl={kind:'control',control:type==='TextArea'?'textarea':type==='RadioButton'?'radio':type==='Checkbox'||type==='CheckBox'?'checkbox':type==='ComboBox'||type==='DropList'||type==='ListBox'?'select':type==='Button'?'button':'text',label:widget.name||'Text input',value:str(field(field(w.body,'TextBlock'),'text')),placeholder:str(field(w.body,'PlaceholderText')),disabled:bool(field(w.body,'Disabled')),readOnly:bool(field(w.body,'ReadOnly'))};
        if(control.control==='radio'||control.control==='checkbox'){
          css.border='0';css.background='transparent';
          const group=str(field(w.body,'radio-group'));
          control.group=group?prefix+group:undefined;control.checked=bool(field(w.body,'Selected'));control.richLabel=richText(w,props,undefined,textOverrides);
        }
        if(control.control==='select'){
          const options=items(field(w.body,'list-options')).map(ref=>object(g,ref));
          control.options=options.map(option=>{const label=str(field(option?.body,'object'));return {label,value:label};});
          const selected=options.findIndex(option=>bool(field(option?.body,'selected')));
          control.value=control.options[Math.max(0,selected)]?.value??'';
          if(type==='ListBox')control.listBox=true;
          if(bool(field(w.body,'multiple')))issues.push({widget:widget.id,feature:'form-multiselect',detail:'Multiple native selections are not implemented; first selected option retained'});
        }
        const maxLength=number(field(w.body,'MaxLength'),2147483647);
        if(maxLength>=0&&maxLength<2147483647)control.maxLength=maxLength;
        if(control.control==='text'){
          const inputType=inputTypes[number(field(w.body,'Type'))];
          if(inputType)control.inputType=inputType;
          else issues.push({widget:widget.id,feature:'form-input-type',detail:`Unknown native input type ${number(field(w.body,'Type'))}`});
        }
        if(bool(field(w.body,'HideHintOnFocus')))control.hideHintOnFocus=true;
        const hintStyle=object(g,field(props.get(P.IX_STYLES),'Hint'));
        if(hintStyle)css['--rp-hint-color']=styleToCss(resolveStyleDelta(g,hintStyle,doc)).color??'rgba(153,153,153,1)';
        widget.content.push(control);
      }else{
        const text=richText(w,props,undefined,textOverrides);if(text)widget.content.push(text);
        issues.push({widget:widget.id,feature:'widget-type',detail:`Unsupported widget ${type}`});
      }
      for(const [variant,variantStyle]of [['disabled',disabledStyle],['selected',selectedStyle]] as const){
        if(!variantStyle||!styleProperties(variantStyle,true).size)continue;
        if(!['shape','image','control'].includes(widget.kind)){
          issues.push({widget:widget.id,feature:variant+'-appearance',detail:`${variant} appearance for this container/widget kind requires native verification`});
        }else{
          const delta=resolveStyleDelta(g,variantStyle,doc),merged=new Map([...props,...delta]);
          const appearanceCss=styleToCss(merged);
          for(const key of Object.keys(appearanceCss))if(key.startsWith('padding')||key==='justify-content'||key==='display')delete appearanceCss[key];
          const content=structuredClone(widget.content);
          if(widget.kind==='shape'){
            const vector=isCssRectangle(w,merged,width,height)?undefined:parseVector(w,merged,width,height,widget.id+'-'+variant);
            const index=content.findIndex(c=>c.kind==='vector');
            if(vector){if(index>=0)content[index]=vector;else content.unshift(vector);}else if(index>=0)content.splice(index,1);
            if(vector){delete appearanceCss.background;delete appearanceCss['border-width'];delete appearanceCss['border-style'];delete appearanceCss['border-color'];}
          }
          if(widget.kind==='image'&&delta.has(P.IMAGE)){
            const src=asset(merged.get(P.IMAGE)),image=content.find(c=>c.kind==='image');
            if(src&&image)image.asset=src;
            else issues.push({widget:widget.id,feature:variant+'-appearance',detail:`${variant} image resource could not be resolved`});
          }
          const textCss=styleToCss(delta);
          if(delta.has(P.UNDERLINE)||delta.has(P.STRIKETHROUGH))textCss['text-decoration']=styleToCss(merged)['text-decoration']??'none';
          const runKeys=['color','font-family','font-size','font-weight','font-style','letter-spacing','text-decoration','text-transform'];
          const applyText=(text:RichText):void=>{
            const refreshed=richText(w,merged,undefined,textOverrides);
            if(refreshed)text.css=refreshed.css;
            for(const paragraph of text.paragraphs){
              for(const key of ['text-align','line-height'])if(textCss[key]!==undefined)paragraph.css[key]=textCss[key];
              for(const run of paragraph.runs)for(const key of runKeys)if(textCss[key]!==undefined)run.css[key]=textCss[key];
            }
          };
          for(const c of content){
            if(c.kind==='text')applyText(c);
            if(c.kind==='control'&&c.richLabel)applyText(c.richLabel);
            if(c.kind==='control'&&['radio','checkbox'].includes(c.control)){
              appearanceCss.border='0';appearanceCss.background='transparent';
              if(delta.has(P.FILL))issues.push({widget:widget.id,feature:variant+'-appearance-control',detail:'Radio/checkbox indicator uses the browser native state appearance; custom indicator fill requires a dedicated renderer'});
            }
          }
          if(delta.has(P.LOCATION)||delta.has(P.SIZE))issues.push({widget:widget.id,feature:variant+'-appearance-geometry',detail:`${variant} layout overrides are not applied; base widget geometry is retained`});
          if(widget.kind==='image'){
            imageBoxCss(appearanceCss);
            for(const c of content)if(c.kind==='image')c.frame=imageFrame(appearanceCss,width,height,widget.id+'-'+variant);
          }
          if(type==='TableCell'){
            tableCellCss(w,appearanceCss);
            for(const side of ['left','top','right','bottom']){
              if(delta.has(P.BORDER_WIDTH))appearanceCss[`--rp-cell-${side}-width`]=`${number(merged.get(P.BORDER_WIDTH))}px`;
              if(delta.has(P.BORDER_FILL))appearanceCss[`--rp-cell-${side}-color`]=fillToCss(merged.get(P.BORDER_FILL));
            }
          }
          widget.variants={...widget.variants,[variant]:{css:appearanceCss,...(JSON.stringify(content)===JSON.stringify(widget.content)?{}:{content})}};
        }
      }
      result.push(widget);
    }
    return nestGroups(result,groupMembers);
  }
  const pages:Page[]=pageGraphs.map((g,i)=>{
    const widgets=diagram(g,prop(g,g.root,'diagram'));
    const pageStyle=prop(g,g.root,'page-style');
    const props=pageStyle?resolveStyle(g,pageStyle,doc):new Map<number,Value>();
    const bounds=visibleDiagramBounds(widgets);
    return {id:g.guids[1],name:names.get(g.guids[1])??`Page ${i+1}`,file:pageByGuid.get(g.guids[1])!,width:Math.ceil(bounds.right),height:Math.ceil(bounds.bottom),background:fillToCss(props.get(P.FILL)),...(number(props.get(P.PAGE_ALIGNMENT))===1?{alignment:'center' as const,contentLeft:visibleDiagramLeft(widgets)}:{}),widgets,behaviors:readBehaviors(g,g.root!,pageByGuid,issues,false,variables)};
  });
  const rendered=pages.flatMap(p=>flattenWidgets(materializeWidgets(p.widgets)));
  widgetCount=rendered.length;panelCount=rendered.filter(w=>w.kind==='panel').length;repeaterCount=rendered.filter(w=>w.kind==='repeater').length;
  return {project:{schema:'axure-semantic',schemaVersion:2,sourceSha256:source.sha256,variables,pages,issues,stats:{pages:pages.length,widgets:widgetCount,panels:panelCount,repeaters:repeaterCount,assets:assets.size,issues:issues.length}},assets};
}
