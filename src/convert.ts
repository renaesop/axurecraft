import {nativeParagraphCss} from './native-rich-text.ts';
import {snapshotSurface,applySnapshotActions} from './snapshot.ts';
import {nativeBackground} from './native-background.ts';
import {instantiateMaster} from './master.ts';
import {adaptiveChain} from './adaptive.ts';
import {nativeViews,adaptiveStyle} from './native-adaptive.ts';
import {widgetStyle} from './render-tree.ts';
import {readGlobalVariables} from './native-variables.ts';
import {readTable,tableCellCss} from './native-table.ts';
import {layoutTable} from './table.ts';
import {layoutTree} from './tree.ts';
import type {NativeContext,NativeReference} from './native-reference.ts';
import {inputTypes} from './controls.ts';
import {readLinkTarget} from './native-link.ts';
import {flattenWidgets,materializeWidgets} from './repeater-model.ts';
import { createHash } from 'node:crypto';
import { type Graph, type Value, parseProject, field, number, str, bool, items, object, prop } from './graph.ts';
import { P, resolveStyle, resolveStyleDelta, styleProperties, styleToCss, textRunToCss, fillToCss } from './styles.ts';
import {parseConnector,connectorInfo} from './connector.ts';
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
  // Panel state records share their owning page's widget namespace. Other pages remain isolated.
  const contexts=new Map<Graph,NativeContext>();
  for(const page of pageGraphs){
    const graphs=new Set<Graph>();const collect=(g:Graph)=>{if(graphs.has(g))return;graphs.add(g);for(const w of g.objects.values()){const pair=field(w.body,'ReferredMaster')?.values,master=pair&&graphByGuid.get(g.guids[Number(pair[1])-1]);if(master)collect(master);}for(const w of g.objects.values())for(const ref of items(field(w.body,'panel-diagrams'))){const child=graphByGuid.get(g.guids[Number(ref.values?.[1])-1]);if(child)collect(child);}};collect(page);
    const references=new Map<string,NativeReference>();for(const g of graphs)for(const widget of g.objects.values())if(widget.className?.startsWith('Axure:DiagramObject:'))references.set(g.guids[widget.id!-1],{graph:g,widget});
    const stateNames=new Map<string,string>();for(const state of graphs)for(const o of state.objects.values())if(o.className==='Axure:PanelDiagram')stateNames.set(state.guids[1],str(field(o.body,'Name')));
    for(const g of graphs)contexts.set(g,{references,stateNames});
  }
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
  const richText=(w:Value,props:Map<number,Value>,override?:string,textOverrides:Map<number,Value>=new Map(),g?:Graph):RichText|undefined=>{
    const block=field(w.body,'RichTextBlock')??field(w.body,'TextBlock');
    const paragraphs=items(field(field(block,'attributed-string'),'Paragraphs'));
    const css=styleToCss(props);
    if(bool(field(w.body,'AutoFitWidth')))css['white-space']='pre';
    const overrideCss=styleToCss(textOverrides);
    const runKeys=['font-family','font-size','font-weight','font-style','color','letter-spacing','text-decoration'];
    const inlineRuns=(nodes:Value[],link?:Value):{run:Value;link?:Value}[]=>nodes.flatMap(run=>field(run,'Inlines')?inlineRuns(items(field(run,'Inlines')),g?object(g,field(run,'Link'))??link:link):[{run,link}]);
    const authoredRuns=paragraphs.flatMap(p=>inlineRuns(items(field(p,'Inlines')))).map(({run})=>textRunToCss(run));
    // Uniform attributed-string values are the cached text baseline. Widget
    // style overrides (including named styles) are authoritative for those.
    const uniform=new Set(runKeys.filter(key=>authoredRuns.length>0&&authoredRuns.every(run=>run[key]===authoredRuns[0][key])));
    for(const key of Object.keys(css))if(key.startsWith('border')||['background','opacity','transform','box-shadow','display','box-sizing'].includes(key))delete css[key];
    const resolvedTextCss=css;
    if(paragraphs.length)return {kind:'text',css,paragraphs:(override===undefined?paragraphs:paragraphs.slice(0,1)).map(p=>{
      const css=nativeParagraphCss(p);if(overrideCss['text-align'])css['text-align']=overrideCss['text-align'];
      const inlines=inlineRuns(items(field(p,'Inlines')));
      const runs=override===undefined?inlines.map(({run,link})=>({text:str(field(run,'Text')),css:textRunToCss(run),...(link&&g?{link:{behaviors:readBehaviors(g,link,pageByGuid,issues,false,variables,asset,contexts.get(g))}}:{})})):[{text:override,css:inlines[0]?textRunToCss(inlines[0].run):{}}];
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
  const snapshotStack=new Set<Graph>();
  let viewChain:string[]=[];
  let widgetCount=0,panelCount=0,repeaterCount=0;
  type MasterOverride={graph:Graph;value:Value};
  function diagram(g:Graph,d:Value|undefined,depth=0,prefix='',templateImages?:Set<string>,masterOverrides=new Map<string,MasterOverride>()):Widget[]{
    if(depth>20){issues.push({feature:'nesting',detail:'Diagram nesting exceeds 20'});return [];}
    const list=items(field(d?.body,'diagram-objects')).map(ref=>object(g,ref)).filter((w):w is Value=>!!w);
    const result:Widget[]=[];
    const groupMembers=new Map<string,string[]>();
    for(const w of list){
      const type=w.className?.replace('Axure:DiagramObject:','')??'unknown';
      const adaptiveDelta=adaptiveStyle(g,w,viewChain),props=new Map([...resolveStyle(g,w,doc),...adaptiveDelta]);const textOverrides=new Map([...styleProperties(prop(g,w,'MyStyle')),...adaptiveDelta]);const pos=props.get(P.LOCATION),size=props.get(P.SIZE);
      const x=number(field(pos,'X')),y=number(field(pos,'Y'));
      const width=Math.max(0,number(field(size,'Width'))),height=Math.max(0,number(field(size,'Height')));
      const css=styleToCss(props);
      // Padding and text flex alignment belong to the overlay, not the outer geometry.
      for(const key of Object.keys(css))if(key.startsWith('padding')||key==='justify-content')delete css[key];
      if(!bool(field(w.body,'VisibleFromSettings'),true))css.display='none';
      const widget:Widget={id:prefix+idFor(g,w),type,name:str(field(field(w.body,'name-block'),'text')),x,y,width,height,css,content:[],source:sourceRef(g,w),kind:'unsupported',behaviors:readBehaviors(g,w,pageByGuid,issues,!!templateImages||type==='Repeater',variables,asset,contexts.get(g))};
      if(bool(field(w.body,'Disabled')))widget.disabled=true;
      if(props.has(P.PLACED)&&number(props.get(P.PLACED),1)===0)css.display='none';
      const paragraphs=items(field(field(field(w.body,'RichTextBlock'),'attributed-string'),'Paragraphs'));
      if(bool(field(w.body,'Selected')))widget.selected=true;
      const selectedStyle=object(g,field(props.get(P.IX_STYLES),'Selected'));
      const selectionGroup=str(field(w.body,'SelectedStyleGroup'));
      if(selectionGroup)widget.selectionGroup=prefix+selectionGroup;
      const disabledStyle=object(g,field(props.get(P.IX_STYLES),'Disabled')),hoverStyle=object(g,field(props.get(P.IX_STYLES),'MouseOver')),pressedStyle=object(g,field(props.get(P.IX_STYLES),'MouseDown'));
      widgetCount++;
      if(type==='Layer'){
        widget.kind='group';widget.propagateStyles=bool(field(w.body,'Propagate'));
        // A group has no painted background/border or inherited text style.
        widget.css=css.display==='none'?{display:'none'}:{};
        groupMembers.set(widget.id,items(field(w.body,'DiagramObjects')).map(ref=>{
          const member=object(g,ref);
          if(!member)throw new Error(`Unresolved group member in record ${g.record.index}, group ${w.id}`);
          return prefix+idFor(g,member);
        }));
        if(number(props.get(P.ROTATION))||number(props.get(P.OPACITY),1)!==1){
          issues.push({widget:widget.id,feature:'group-style',detail:'Group rotation or opacity require native verification; child geometry and styles retained'});
        }
      }else if(type==='Screenshot'){
        widget.kind='shape';
        const pair=field(w.body,'reference-package-id')?.values,guid=pair?g.guids[Number(pair[1])-1]:undefined,reference=guid?graphByGuid.get(guid):undefined;
        if(!reference?.root){if(guid&&guid!=='00000000000000000000000000000000')issues.push({widget:widget.id,feature:'snapshot-reference',detail:'Referenced snapshot page is missing: '+guid});}
        else if(snapshotStack.has(reference))issues.push({widget:widget.id,feature:'snapshot-cycle',detail:'Recursive snapshot reference omitted'});
        else{
          snapshotStack.add(reference);const savedChain=viewChain;viewChain=[];
          try{
            const contents=diagram(reference,prop(reference,reference.root,'diagram'),depth+1);
            const pageStyle=prop(reference,reference.root,'page-style'),pageProps=pageStyle?resolveStyle(reference,pageStyle,doc):new Map<number,Value>();
            const size=pageProps.get(P.SIZE),padding=field(w.body,'Padding');
            const preview=readBehaviors(g,w,pageByGuid,issues,false,variables,asset,contexts.get(reference),prop(g,w,'PreviewMap'));
            applySnapshotActions(contents,preview.flatMap(b=>b.actions),new Map(variables.map(v=>[v.name.toLowerCase(),v.defaultValue])),detail=>issues.push({widget:widget.id,feature:'snapshot-preview',detail}));
            const originX=reference.className==='Axure:Master'?visibleDiagramLeft(contents):0,originY=reference.className==='Axure:Master'&&contents.length?Math.min(...contents.map(w=>w.y)):0;
            const bounds=visibleDiagramBounds(contents,-originX,-originY);
            Object.assign(widget,snapshotSurface(widget,contents,{originX,originY,width:Math.max(bounds.right,number(field(size,'Width'))),height:Math.max(bounds.bottom,number(field(size,'Height'))),background:nativeBackground(pageProps,asset),fit:bool(field(w.body,'ScaleToFit'),true),zoom:number(field(w.body,'Zoom'),1),panX:number(field(w.body,'PanX')),panY:number(field(w.body,'PanY')),padding:{left:number(field(padding,'Left')),top:number(field(padding,'Top')),right:number(field(padding,'Right')),bottom:number(field(padding,'Bottom'))},vertical:number(props.get(P.VERTICAL_ALIGNMENT),1) as 0|1|2}));
          }finally{snapshotStack.delete(reference);viewChain=savedChain;}
        }
      }else if(type==='ReferenceDiagramObject'){
        widget.kind='group';widget.css=css.display==='none'?{display:'none'}:{};
        const pair=field(w.body,'ReferredMaster')?.values,guid=pair?g.guids[Number(pair[1])-1]:undefined,master=guid?graphByGuid.get(guid):undefined;
        if(!master?.root){
          issues.push({widget:widget.id,feature:'master-reference',detail:`Referenced master ${guid??'(unknown GUID)'} is missing (instance ${JSON.stringify(widget.name||widget.id)})`});
          // A group has a zero-size DOM wrapper and contributes only its children
          // to page bounds. Missing contents need a painted box at the saved size.
          widget.kind='unsupported';
          widget.css={...widget.css,background:'#fff7ed',border:'1px dashed #b45309',overflow:'hidden'};
          widget.content.push({kind:'text',css:{'font-family':'Arial, sans-serif','font-size':'12px','line-height':'16px',color:'#78350f',padding:'2px 4px',overflow:'hidden'},
            paragraphs:[{css:{'white-space':'nowrap',overflow:'hidden','text-overflow':'ellipsis'},runs:[{text:`Missing master: ${widget.name||guid||widget.id}`,css:{}}]}]});
        }
        else{
          const ownOverride=masterOverrides.get(idFor(g,w)),overrideView=ownOverride?.graph.guids[number(field(ownOverride.value,'ViewId'))-1];
          const savedChain=viewChain,views=nativeViews(doc!,master),selected=overrideView&&overrideView!=='00000000000000000000000000000000'?overrideView:g.guids[number(props.get(P.MASTER_VIEW))-1],view=views?.views.find(v=>v.id===selected)??views?.views.find(v=>v.id===views.defaultId);
          viewChain=view&&views?adaptiveChain(views.views,view.id):[];
          const overrides=new Map<string,MasterOverride>(),entries=items(field(w.body,'ObjectOverrides'));
          for(let n=0;n+1<entries.length;n+=2){
            const path=object(g,entries[n]),guid=g.guids[number(field(path?.body,'object-id'))-1];
            const route=items(field(path?.body,'rdo-path')).map(ref=>'w-'+g.guids[number(ref)-1]+'--').join('');
            overrides.set(route+'w-'+guid,{graph:g,value:entries[n+1]});
          }
          // Outer-instance overrides take precedence over defaults in nested masters.
          for(const [id,value]of masterOverrides)if(id.startsWith(widget.id+'--'))overrides.set(id.slice(widget.id.length+2),value);
          let members:Widget[];
          try{members=diagram(master,prop(master,master.root,'diagram'),depth+1,'',templateImages,overrides);}finally{viewChain=savedChain;}
          const originX=members.length?Math.min(...members.map(c=>c.x)):0,originY=members.length?Math.min(...members.map(c=>c.y)):0;
          for(const child of members){child.x-=originX;child.y-=originY;}
          const ids=new Set(flattenWidgets(members).map(c=>c.id));
          for(const id of overrides.keys())if(!ids.has(id))issues.push({widget:widget.id,feature:'master-override',detail:'Master override target is missing: '+id});
          widget.children=instantiateMaster(members,widget.id+'--',{radio:bool(field(w.body,'IsolateRadioGroups'),true),selection:bool(field(w.body,'IsolateSelectionGroups'),true)});
          const bounds=visibleDiagramBounds(widget.children);widget.width=bounds.right;widget.height=bounds.bottom;
        }
      }else if(type==='InlineFrame'){
        widget.kind='frame';css.border='0';css.background='transparent';
        try{
          const target=readLinkTarget(g,w,prop(g,w,'DefaultTarget'),pageByGuid,variables);
          const src=target.kind==='link'&&typeof target.value==='string'?target.value:'about:blank';
          widget.content.push({kind:'frame',src:src||'about:blank',name:widget.id,title:widget.name||'Embedded page',border:bool(field(w.body,'ShowBorder')),scrolling:({0:'no',1:'auto',2:'yes'} as const)[number(field(w.body,'Scrollbars')) as 0|1|2]??'auto'});
          if(target.expression)widget.behaviors.unshift({event:'load',actions:[{...target,navigation:'frame',target:widget.id}]});
        }catch(error){issues.push({widget:widget.id,feature:'frame-target',detail:String(error)});}
      }else if(type==='TreeNodeObject'){
        widget.kind='tree';widget.css={background:'transparent',border:'0',overflow:'visible',...(css.display?{display:css.display}:{})};
        widget.children=diagram(g,w,depth+1,prefix,templateImages,masterOverrides);
        const root=prop(g,w,'rootnode'),isRoot=number(field(w.body,'rootnode'))===w.id;
        const childIds=new Set(items(field(w.body,'childnodes')).map(ref=>number(ref)));
        const label=widget.children.find(c=>c.source.objectId===number(field(w.body,'buttonshape'))),toggle=widget.children.find(c=>c.source.objectId===number(field(w.body,'plusminus')));
        const expanded=bool(field(w.body,'isexpanded'),true);
        widget.tree={root:isRoot,expanded,rowHeight:isRoot?0:height,nodes:widget.children.filter(c=>childIds.has(c.source.objectId)).map(c=>c.id),labelId:label?.id,toggleId:toggle?.id};
        if(label){label.x=bool(field(root?.body,'rootshowplusminus'),true)?20:0;label.y=0;label.width=Math.max(0,width-label.x);label.height=height;label.css.background='transparent';label.css.border='0';label.content=label.content.filter(c=>c.kind!=='vector');}
        if(toggle){
          const image=toggle.content.find(c=>c.kind==='image'),collapsed=asset(field(root?.body,'CollapsedImage')),open=asset(field(root?.body,'ExpandedImage'));
          if(image&&collapsed&&open){image.asset=collapsed;toggle.variants={...toggle.variants,selected:{css:toggle.css,content:[{...image,asset:open}]}};toggle.selected=expanded;}
          toggle.behaviors.push({event:'click',actions:[{kind:'tree-toggle',target:widget.id}]});
        }
        if(isRoot)Object.assign(widget,layoutTree(widget));
      }else if(type==='MenuObject'){
        widget.kind='menu';css.background='transparent';css.border='0';
        widget.children=diagram(g,w,depth+1,prefix,templateImages,masterOverrides);
        const entries=items(field(w.body,'submenus')),all=flattenWidgets(widget.children);
        for(let n=0;n+1<entries.length;n+=2){const trigger=all.find(c=>c.source.objectId===number(entries[n])),submenu=widget.children.find(c=>c.source.objectId===number(entries[n+1]));
          if(trigger&&submenu){submenu.menu={trigger:trigger.id};submenu.css.display='none';}
          else issues.push({widget:widget.id,feature:'menu-reference',detail:'Submenu or trigger cell reference is missing'});
        }
      }else if(type==='Table'){
        widget.children=diagram(g,w,depth+1,prefix,templateImages,masterOverrides);
        widget.css=css.display==='none'?{display:'none'}:{};
        try{
          const {table,cellIds}=readTable(g,w),byId=new Map(widget.children.map(c=>[c.source.objectId,c]));
          if(cellIds.length!==widget.children.length||cellIds.some(id=>!byId.has(id)))throw new Error('Table cells do not match diagram objects');
          widget.kind='table';widget.table=table;widget.children=cellIds.map(id=>byId.get(id)!);
          Object.assign(widget,layoutTable(widget));
        }catch(error){issues.push({widget:widget.id,feature:'table-structure',detail:String(error)});}
      }else if(type==='TableCell'){
        widget.kind='shape';tableCellCss(w,css);
        const text=richText(w,props,undefined,textOverrides,g);if(text)widget.content.push(text);
      }else if(type==='ImageMapRegion'){
        widget.kind='hotspot';
        css.background='transparent';css.border='0';
      }else if(type==='Connector'){
        widget.kind='shape';const connector=parseConnector(g,w,props,widget.id,target=>new Map([...resolveStyle(g,target,doc),...adaptiveStyle(g,target,viewChain)]));
        if(connector){
          const {graphic,...geometry}=connector;Object.assign(widget,geometry);widget.css={...css,background:'transparent',border:'0'};widget.content.push(graphic);widget.connection=connectorInfo(g,w,prefix);
          for(const side of ['start','end'] as const){const target=widget.connection[side].target;if(target&&!contexts.get(g)?.references?.has(target.slice(prefix.length+2)))issues.push({widget:widget.id,feature:'connector-reference',detail:`Unresolved ${side} node: ${target}`});}
        }
        else issues.push({widget:widget.id,feature:'connector',detail:'Connector geometry is incomplete'});
      }else if(type==='VectorShape'||type==='Line'){
        widget.kind='shape';
        const cssRectangle=isCssRectangle(w,props,width,height);
        const svg=cssRectangle?undefined:parseVector(w,props,width,height,widget.id);
        if(svg){delete css.background;delete css['border-width'];delete css['border-style'];delete css['border-color'];}
        else if(!cssRectangle)issues.push({widget:widget.id,feature:'vector',detail:`No path data for ${type}`});
        if(svg)widget.content.push(svg);
        const text=richText(w,props,undefined,textOverrides,g);if(text)widget.content.push(text);
      }else if(type==='ImageBox'){
        widget.kind='image';imageBoxCss(css);
        const src=asset(props.get(P.IMAGE));
        widget.content.push({kind:'image',asset:src??null,alt:widget.name,frame:imageFrame(css,width,height,widget.id)});
        if(!src&&!templateImages?.has(widget.source.guid))issues.push({widget:widget.id,feature:'image',detail:'Image Stream unavailable'});
        const text=richText(w,props,undefined,textOverrides,g);if(text)widget.content.push(text);
      }else if(type==='DynamicPanel'){
        widget.panel={percentWidth:bool(field(w.body,'is-percent-width')),fitToContent:bool(field(w.body,'fit-to-content'))};
        if(bool(field(w.body,'is-fixed')))widget.panel.fixed={horizontal:(['left','center','right'] as const)[number(field(w.body,'horizontal-pin-alignment'))]??'left',vertical:(['top','center','bottom'] as const)[number(field(w.body,'vertical-pin-alignment'))]??'top',marginX:number(field(w.body,'horizontal-pin-margin')),marginY:number(field(w.body,'vertical-pin-margin')),keepInFront:bool(field(w.body,'keep-pinned-in-front'))};
        widget.propagateStyles=bool(field(w.body,'propagate-styles'));
        widget.kind='panel';panelCount++;css.background='transparent';css.border='0';css['overflow-x']=[1,3].includes(number(field(w.body,'scrollbars')))?'auto':'hidden';css['overflow-y']=[1,2].includes(number(field(w.body,'scrollbars')))?'auto':'hidden';
        widget.states=[];
        for(const ref of items(field(w.body,'panel-diagrams'))){
          const guid=g.guids[Number(ref.values?.[1])-1];const state=graphByGuid.get(guid);
          const stateDiagram=state&&[...state.objects.values()].find(o=>o.className==='Axure:PanelDiagram');
          if(state&&stateDiagram){
            const stateStyle=prop(state,stateDiagram,'PanelDiagramStyle');
            const stateCss=stateStyle?styleToCss(resolveStyle(state,stateStyle,doc)):{};
            widget.states.push({id:guid,name:str(field(stateDiagram.body,'Name')),css:stateCss,widgets:diagram(state,stateDiagram,depth+1,prefix,templateImages,masterOverrides)});
          }
          else issues.push({widget:widget.id,feature:'panel-state',detail:`Missing state ${guid}`});
        }
        if(bool(field(w.body,'fit-to-content'))&&widget.states.length){
          const bounds=widget.states.map(s=>visibleDiagramBounds(s.widgets));
          widget.width=bounds[0].right;widget.height=bounds[0].bottom;
          if(!number(field(w.body,'scrollbars')))css.overflow='visible';
        }
      }else if(type==='Repeater'||type==='Axure:Repeater'){
        widget.kind='repeater';repeaterCount++;css.background='transparent';css.border='0';
        const base=prop(g,w,'BaseDiagram');const dataset=prop(g,w,'Data');const rows=items(field(dataset?.body,'rows'));
        const rowData=repeaterRows(g,w,variables);
        for(const detail of rowData.issues)issues.push({widget:widget.id,feature:'repeater-data-binding',detail});
        const repStyle=styleProperties(prop(g,w,'RepeaterStyle'));
        const rawPageSize=number(repStyle.get(P.ITEMS_PER_PAGE),0xffffffff);
        const perPage=rawPageSize===0xffffffff?0:Math.max(0,Math.floor(rawPageSize));
        const template=diagram(g,base,depth+1,'',new Set(rowData.programs.filter(p=>p.kind==='image').map(p=>p.target)),masterOverrides);
        const columns=items(field(dataset?.body,'columns')).map(ref=>{
          const column=object(g,ref);return {id:number(field(column?.body,'variable-id'),-1),name:str(field(column?.body,'name'))};
        });
        const bindings=rowData.programs.flatMap(program=>{
          const image=program.image?asset(program.image):undefined;
          const expression=program.expression??(image?{kind:'literal' as const,value:image}:undefined);
          return expression?[{targetGuid:program.target,property:program.kind,expression,sourceText:program.sourceText}]:[];
        });
        widget.repeater={itemLoad:widget.behaviors.filter(b=>b.event==='itemload'),columns,bindings,template,isolateRadioGroups:bool(field(w.body,'IsolateRadioGroups'),true),isolateSelectionGroups:bool(field(w.body,'IsolateSelectionGroups'),true),templateSource:sourceRef(g,base??w),layout:{direction:bool(repStyle.get(P.VERTICAL),true)?'vertical':'horizontal',horizontalSpacing:number(repStyle.get(P.HORIZONTAL_SPACING)),verticalSpacing:number(repStyle.get(P.VERTICAL_SPACING)),pageSize:perPage,startPage:Math.max(1,number(repStyle.get(P.START_PAGE),1)),wrap:number(repStyle.get(P.WRAP),0xffffffff)===0xffffffff?0:number(repStyle.get(P.WRAP)),paddingLeft:number(repStyle.get(P.PADDING_LEFT)),paddingTop:number(repStyle.get(P.PADDING_TOP))},rows:rows.map((ref,index)=>{
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
          const custom=[...textOverrides.keys(),...(selectedStyle?resolveStyleDelta(g,selectedStyle,doc).keys():[]),...(disabledStyle?resolveStyleDelta(g,disabledStyle,doc).keys():[])].some(key=>new Set<number>([P.FILL,P.BORDER_FILL,P.BORDER_WIDTH,P.CORNER_RADIUS]).has(key));
          if(custom)control.indicator={background:fillToCss(props.get(P.FILL)),'border-color':fillToCss(props.get(P.BORDER_FILL)),'border-width':number(props.get(P.BORDER_WIDTH),1)+'px','border-style':'solid','border-radius':control.control==='radio'?'50%':number(props.get(P.CORNER_RADIUS))+'px'};
          control.group=group?prefix+group:undefined;control.checked=bool(field(w.body,'Selected'));control.richLabel=richText(w,props,undefined,textOverrides,g);
        }
        if(control.control==='select'){
          const options=items(field(w.body,'list-options')).map(ref=>object(g,ref));
          control.options=options.map(option=>{const label=str(field(option?.body,'object'));return {label,value:label};});
          const selected=options.findIndex(option=>bool(field(option?.body,'selected')));
          control.value=control.options[Math.max(0,selected)]?.value??'';
          if(type==='ListBox')control.listBox=true;
          if(bool(field(w.body,'multiple'))){control.multiple=true;control.selectedValues=options.filter(option=>bool(field(option?.body,'selected'))).map(option=>str(field(option?.body,'object')));}
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
        const text=richText(w,props,undefined,textOverrides,g);if(text)widget.content.push(text);
        issues.push({widget:widget.id,feature:'widget-type',detail:`Unsupported widget ${type}`});
      }
      for(const [variant,variantStyle]of [['disabled',disabledStyle],['selected',selectedStyle],['hover',hoverStyle],['pressed',pressedStyle]] as const){
        if(!variantStyle||!styleProperties(variantStyle,true).size)continue;
        if(!['shape','image','control'].includes(widget.kind)){
          issues.push({widget:widget.id,feature:variant+'-appearance',detail:`${variant} appearance for this container/widget kind requires native verification`});
        }else{
          const delta=new Map([...(variant==='pressed'&&hoverStyle?resolveStyleDelta(g,hoverStyle,doc):[]),...resolveStyleDelta(g,variantStyle,doc)]),merged=new Map([...props,...delta]);
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
            const refreshed=richText(w,merged,undefined,textOverrides,g);
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
              if(c.indicator)c.indicator={...c.indicator,background:fillToCss(merged.get(P.FILL)),'border-color':fillToCss(merged.get(P.BORDER_FILL)),'border-width':number(merged.get(P.BORDER_WIDTH),1)+'px'};
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
      const override=masterOverrides.get(idFor(g,w));
      if(override){
        const image=asset(field(override.value,'Image')),text=field(override.value,'Text');
        for(const content of [widget.content,...Object.values(widget.variants??{}).flatMap(v=>v.content?[v.content]:[])])for(const c of content){
          if(c.kind==='image'&&image)c.asset=image;
          if(c.kind==='text'&&text){const p=c.paragraphs[0]??{css:{},runs:[]};c.paragraphs=[{css:p.css,runs:[{text:str(text),css:p.runs[0]?.css??{}}]}];}
        }
      }
      result.push(widget);
    }
    return nestGroups(result,groupMembers);
  }
  const pages:Page[]=pageGraphs.map((g,i)=>{
    const views=nativeViews(doc,g);viewChain=[];
    const widgets=diagram(g,prop(g,g.root,'diagram'));
    const pageStyle=prop(g,g.root,'page-style');
    const props=pageStyle?resolveStyle(g,pageStyle,doc):new Map<number,Value>();
    const bounds=visibleDiagramBounds(widgets);
    const page:Page={id:g.guids[1],name:names.get(g.guids[1])??`Page ${i+1}`,file:pageByGuid.get(g.guids[1])!,width:Math.ceil(Math.max(bounds.right,number(field(props.get(P.SIZE),'Width')))),height:Math.ceil(Math.max(bounds.bottom,number(field(props.get(P.SIZE),'Height')))),background:nativeBackground(props,asset),...(number(props.get(P.PAGE_ALIGNMENT))===1?{alignment:'center' as const,contentLeft:visibleDiagramLeft(widgets)}:{}),widgets,behaviors:readBehaviors(g,g.root!,pageByGuid,issues,false,variables,asset,contexts.get(g))};
    if(views&&views.views.length>1){
      const walk=(list:Widget[]):Widget[]=>list.flatMap(w=>[w,...walk(w.children??[]),...(w.states??[]).flatMap(s=>walk(s.widgets)),...walk(w.repeater?.template??[])]);
      const originals=walk(widgets),layouts:NonNullable<Page['adaptive']>['layouts']={};
      const paint=(w:Widget)=>({x:w.x,y:w.y,width:w.width,height:w.height,css:widgetStyle(w),content:w.content,variants:w.variants});
      for(const view of views.views){
        viewChain=adaptiveChain(views.views,view.id);
        const converted=view.id===views.defaultId?widgets:diagram(g,prop(g,g.root,'diagram')),byId=new Map(walk(converted).map(w=>[w.id,w]));
        const bounds=visibleDiagramBounds(converted),pageProps=new Map([...props,...adaptiveStyle(g,g.root!,viewChain)]);
        layouts[view.id]={width:Math.ceil(Math.max(bounds.right,number(field(pageProps.get(P.SIZE),'Width')))),height:Math.ceil(Math.max(bounds.bottom,number(field(pageProps.get(P.SIZE),'Height')))),contentLeft:visibleDiagramLeft(converted),alignment:number(pageProps.get(P.PAGE_ALIGNMENT))===1?'center':'left',background:nativeBackground(pageProps,asset)};
        for(const original of originals){const current=byId.get(original.id);if(current)original.adaptive={...original.adaptive,[view.id]:paint(current)};}
      }
      for(const original of originals)if(Object.values(original.adaptive??{}).every(p=>JSON.stringify(p)===JSON.stringify(paint(original))))delete original.adaptive;
      page.adaptive={...views,layouts};viewChain=[];
    }
    return page;
  });
  const deduplicated=[...new Map(issues.map(issue=>[JSON.stringify(issue),issue])).values()];issues.splice(0,issues.length,...deduplicated);
  const rendered=pages.flatMap(p=>flattenWidgets(materializeWidgets(p.widgets)));
  widgetCount=rendered.length;panelCount=rendered.filter(w=>w.kind==='panel').length;repeaterCount=rendered.filter(w=>w.kind==='repeater').length;
  return {project:{schema:'axure-semantic',schemaVersion:2,sourceSha256:source.sha256,variables,pages,issues,stats:{pages:pages.length,widgets:widgetCount,panels:panelCount,repeaters:repeaterCount,assets:assets.size,issues:issues.length}},assets};
}
