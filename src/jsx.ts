import {reactStyle,reactAttribute as attributeName} from './react-props.ts';
import {materializeTables} from './repeater-model.ts';
import {describeWidgets} from './widget-state.ts';
export {reactStyle} from './react-props.ts';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import type { Page, Widget, Project, Css, GlobalVariable } from './model.ts';
import { contentElements, widgetStyle, type ElementNode } from './render-tree.ts';
import { baseCss, escapeHtml } from './html.ts';
import type { PageDefinition } from './react-runtime.tsx';

const json=(value:unknown):string=>JSON.stringify(value);
export function elementJsx(node:ElementNode|string,ownerId:string,level=0):string {
  const indent='  '.repeat(level);
  if(typeof node==='string')return indent+`{${json(node)}}`;
  const control=['input','textarea','select','button'].includes(node.tag);
  const richText=node.attrs.class==='rp-text',inlineLink=node.attrs.class==='rp-inline-link',image=node.tag==='image'||node.tag==='img'&&node.attrs.class==='rp-image',imageFrame=node.attrs.class==='rp-framed-image';
  const tag=control?'RpControl':richText?'RpText':inlineLink?'RpLink':image?'RpImage':imageFrame?'RpImageFrame':node.tag;
  const attrs={...node.attrs};
  if(node.tag==='option')delete attrs.selected; // The select owns defaultValue in React.
  if(inlineLink)delete attrs['data-rp-link'];
  let children=node.children;
  if(node.tag==='textarea'){attrs.value=node.children.filter(v=>typeof v==='string').join('');children=[];}
  const selectedValues=node.tag==='select'&&node.attrs.multiple?node.children.flatMap(c=>typeof c!=='string'&&c.attrs.selected?[String(c.attrs.value??'')]:[]):undefined;
  const parts=Object.entries(attrs).filter(([,v])=>v!==undefined).map(([key,value])=>`${node.tag==='option'&&key==='value'?'value':attributeName(key)}={${json(value)}}`);
  if(selectedValues)parts.push(`defaultValue={${json(selectedValues)}}`);
  if(control)parts.unshift(`ownerId={${json(ownerId)}}`,`as={${json(node.tag)}}`);
  if(image)parts.unshift(`ownerId={${json(ownerId)}}`,`as={${json(node.tag)}}`);
  if(imageFrame){const child=node.children.find(c=>typeof c!=='string'&&c.tag==='image');parts.unshift(`ownerId={${json(ownerId)}}`,`asset={${json(child&&typeof child!=='string'?child.attrs.href??null:null)}}`);}
  if(inlineLink)parts.unshift(`ownerId={${json(ownerId)}}`,`behaviors={${String(node.attrs['data-rp-link']??'[]')}}`);
  if(richText)parts.unshift(`ownerId={${json(ownerId)}}`);
  if(node.css)parts.push(`style={${json(reactStyle(node.css))}}`);
  const head=`${indent}<${tag}${parts.length?' '+parts.join(' '):''}`;
  return children.length?head+'>\n'+children.map(c=>elementJsx(c,ownerId,level+1)).join('\n')+`\n${indent}</${tag}>`:head+' />';
}
function widgetJsx(w:Widget,level:number,ref?:string):string {
  const indent='  '.repeat(level),id=ref?`${ref}.id`:json(w.id);
  const disabledStyle=w.variants?.disabled?` disabledStyle={${ref?`widgetDisabledCss(${ref})`:json(reactStyle(w.variants.disabled.css))}}`:'';
  const selectedStyle=w.variants?.selected?` selectedStyle={${ref?`widgetSelectedCss(${ref})`:json(reactStyle(w.variants.selected.css))}}`:'';
  const pointerStyle=w.variants?.hover||w.variants?.pressed?` pointerStyles={${ref?`widgetPointerCss(${ref})`:json(Object.fromEntries(Object.entries(w.variants).filter(([key])=>key==='hover'||key==='pressed').map(([key,v])=>[key,reactStyle(v.css)])))}}`:'';
  const props=`${w.propagateStyles?'propagateStyles={true} ':''}${w.menu?`menu={${ref?`${ref}.menu`:json(w.menu)}} `:''}${w.tree?`tree={${ref?`${ref}.tree`:json(w.tree)}} `:''}id={${id}} type={${json(w.type)}} name={${json(w.name)}} style={${ref?`widgetCss(${ref})`:json(reactStyle(widgetStyle(w)))}}${disabledStyle}${selectedStyle}${pointerStyle} behaviors={${ref?`${ref}.behaviors`:json(w.behaviors)}}`;
  const paints=Object.entries(w.variants??{}).filter(([,value])=>value.content);
  const content=w.adaptive&&!ref?[`${indent}  <RpContent ownerId={${id}} content={${json(w.content)}} variants={${json(w.variants)}} />`]:ref?[`${indent}  <RpContent ownerId={${id}} content={${ref}.content} variants={${ref}.variants} />`]:paints.length?[
    `${indent}  <RpAppearance ownerId={${id}} variants={${json(Object.keys(w.variants!))}}>{(variant) =>`,
    ...paints.flatMap(([name,value])=>[
      `${indent}    variant === ${json(name)} ? <>`,
      ...value.content!.flatMap(contentElements).map(c=>elementJsx(c,w.id,level+3)),
      `${indent}    </> :`,
    ]),
    `${indent}    <>`,
    ...w.content.flatMap(contentElements).map(c=>elementJsx(c,w.id,level+3)),
    `${indent}    </>`,
    `${indent}  }</RpAppearance>`,
  ]:w.content.flatMap(contentElements).map(c=>elementJsx(c,w.id,level+1));
  const repeated=w.repeater?[`${indent}  <RpRepeater ownerId={${id}} data={definition.repeaters[${json(w.id)}]}>
${indent}    {(row) => <>
${w.repeater.template.map((c,i)=>widgetJsx(c,level+3,`row.widgets[${i}]`)).join('\n')}
${indent}    </>}
${indent}  </RpRepeater>`]:[];
  const childJsx=(w.children??[]).map((c,i)=>widgetJsx(c,level+1,ref?`(${ref}.children ?? [])[${i}]`:undefined));
  const descendants=w.table?w.table.rowHeights.map((_,i)=>`${indent}  <div role="row" style={{display:'contents'}}>\n${childJsx.slice(i*w.table!.columnWidths.length,(i+1)*w.table!.columnWidths.length).join('\n')}\n${indent}  </div>`):childJsx;
  const children=[...content,...repeated,...descendants,...(w.states??[]).map((s,i)=>`${indent}  <RpState ownerId={${id}} id={${ref?`(${ref}.states ?? [])[${i}].id`:json(s.id)}} name={${json(s.name)}} initial={${i===0}} style={${json(reactStyle(s.css??{}))}}>
${s.widgets.map((c,j)=>widgetJsx(c,level+2,ref?`(${ref}.states ?? [])[${i}].widgets[${j}]`:undefined)).join('\n')}
${indent}  </RpState>`)];
  return `${indent}<RpWidget ${props}>
${children.join('\n')}
${indent}</RpWidget>`;
}
function flatten(widgets:Widget[]):Widget[]{return widgets.flatMap(w=>[w,...flatten(w.children??[]),...(w.states??[]).flatMap(s=>flatten(s.widgets))]);}
export function pageDefinition(page:Page,variables:GlobalVariable[]=[]):PageDefinition {
  return {id:page.id,adaptive:page.adaptive,name:page.name,alignment:page.alignment,contentLeft:page.contentLeft,variables,width:page.width,height:page.height,background:page.background,behaviors:page.behaviors,repeaters:Object.fromEntries(flatten(page.widgets).filter(w=>w.repeater).map(w=>[w.id,w.repeater!])),widgets:describeWidgets(materializeTables(page.widgets)).map(({appearance,...state})=>state)};
}
/** Emits concrete, editable JSX elements; no innerHTML, iframe or serialized HTML string. */
export function pageToJsx(page:Page,componentName='Prototype',variables:GlobalVariable[]=[]):string {
  page={...page,widgets:materializeTables(page.widgets)};
  if(!/^[A-Z][A-Za-z0-9_]*$/.test(componentName))throw new Error('Invalid component name');
  return `import { PrototypePage, RpWidget, RpState, RpControl, RpText, RpLink, RpImage, RpImageFrame, RpRepeater, RpContent, RpAppearance, widgetCss, widgetDisabledCss, widgetSelectedCss, widgetPointerCss } from './runtime';\n\nconst definition = ${JSON.stringify(pageDefinition(page,variables),null,2)};\n\nexport default function ${componentName}() {\n  return (\n    <PrototypePage definition={definition}>\n${page.widgets.map(w=>widgetJsx(w,3)).join('\n')}\n    </PrototypePage>\n  );\n}\n`;
}
/** Both .jsx and .tsx exports are compiled from the same semantic project. */
export async function writeReactProject(project:Project,assets:Map<string,Buffer>,output:string):Promise<void> {
  const root=join(output,'react'),source=join(root,'source');mkdirSync(source,{recursive:true});mkdirSync(join(root,'assets'),{recursive:true});
  for(const [name,bytes]of assets)writeFileSync(join(root,name),bytes);
  for(let i=0;i<project.pages.length;i++){
    const code=pageToJsx(project.pages[i],`Page${i+1}`,project.variables);
    writeFileSync(join(source,`Page${i+1}.jsx`),code);writeFileSync(join(source,`Page${i+1}.tsx`),code.replace('const definition =','const definition: import("./runtime").PageDefinition ='));
  }
  const src=fileURLToPath(new URL('.',import.meta.url));
  copyFileSync(join(src,'react-runtime.tsx'),join(source,'runtime.tsx'));copyFileSync(join(src,'model.ts'),join(source,'model.ts'));
  for(const file of ['rich-text.ts','pointer.ts','menu.ts','popups.ts','input-events.ts','adaptive.ts','compression.ts','images.ts','groups.ts','expression-methods.ts','tree.ts','repeater-actions.ts','panel.ts','transition.ts','motion.ts','navigation.ts','controls.ts','table.ts','repeater-model.ts','react-props.ts','render-tree.ts','widget-state.ts','expression.ts','behavior-runtime.ts','widget-dom.ts','dom-content.ts','selection.ts','variables.ts','page-layout.ts'])copyFileSync(join(src,file),join(source,file));
  const entry=project.pages.map((_,i)=>`import Page${i+1} from './Page${i+1}.jsx';`).join('\n')+`\nimport {createRoot} from 'react-dom/client';\nconst pages={${project.pages.map((p,i)=>`${json(p.file)}:Page${i+1}`).join(',')}};\nconst Page=pages[decodeURIComponent(location.pathname.split('/').pop())]??Page1;\ncreateRoot(document.getElementById('root')).render(<Page/>);\n`;
  writeFileSync(join(source,'main.jsx'),entry);
  const req=createRequire(import.meta.url);
  await build({entryPoints:[join(source,'main.jsx')],outfile:join(root,'app.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',jsx:'automatic',sourcemap:true,nodePaths:[fileURLToPath(new URL('../node_modules',import.meta.url))]});
  writeFileSync(join(root,'styles.css'),baseCss);
  for(const p of project.pages)writeFileSync(join(root,p.file),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(p.name)} · React</title><link rel="stylesheet" href="styles.css"><script defer src="app.js"></script></head><body style="background:${escapeHtml(p.background)}"><div id="root"></div></body></html>`);
  writeFileSync(join(root,'project.json'),JSON.stringify(project,null,2)+'\n');
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'generated-axure-react',version:'1.0.0',private:true,type:'module',scripts:{build:'node build.mjs',typecheck:'tsc --noEmit'},dependencies:{react:req('react/package.json').version,'react-dom':req('react-dom/package.json').version},devDependencies:{esbuild:req('esbuild/package.json').version,typescript:req('typescript/package.json').version,'@types/react':req('@types/react/package.json').version,'@types/react-dom':req('@types/react-dom/package.json').version}},null,2)+'\n');
  writeFileSync(join(root,'build.mjs'),`import {build} from 'esbuild';\nawait build({entryPoints:['source/main.jsx'],outfile:'app.js',bundle:true,format:'iife',platform:'browser',target:'es2022',jsx:'automatic',sourcemap:true});\n`);
  writeFileSync(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',strict:true,jsx:'react-jsx',noEmit:true,allowImportingTsExtensions:true,skipLibCheck:true,lib:['ES2022','DOM','DOM.Iterable']},include:['source/**/*.ts','source/**/*.tsx']},null,2)+'\n');
}
