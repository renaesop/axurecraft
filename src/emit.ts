import {pageDirectory,firstDirectoryPage} from './page-directory.ts';
import {materializeWidgets} from './repeater-model.ts';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { pageHtml, escapeHtml } from './html.ts';
import { writeReactProject } from './jsx.ts';

import type { Project } from './model.ts';

export async function emitProject(project:Project,assets:Map<string,Buffer>,destination:string,input='project.rp'):Promise<void> {
const widgets:import('./model.ts').Widget[]=[];
const walk=(items:import('./model.ts').Widget[]):void=>{for(const w of items){widgets.push(w);walk(w.children??[]);for(const state of w.states??[])walk(state.widgets);}};
for(const page of project.pages)walk(materializeWidgets(page.widgets));
project={...project,stats:{pages:project.pages.length,widgets:widgets.length,panels:widgets.filter(w=>w.kind==='panel').length,repeaters:widgets.filter(w=>w.kind==='repeater').length,assets:assets.size,issues:project.issues.length}};
const output=resolve(destination);
await writeReactProject(project,assets,output);
mkdirSync(join(output,'assets'),{recursive:true});
mkdirSync(join(output,'source'),{recursive:true});
for(const [name,bytes] of assets)writeFileSync(join(output,name),bytes);
for(const page of project.pages)writeFileSync(join(output,page.file),pageHtml(page,project.variables));
const src=fileURLToPath(new URL('.',import.meta.url));
await build({entryPoints:[join(src,'runtime.ts')],outfile:join(output,'runtime.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',sourcemap:true});
for(const file of ['rich-text.ts','pointer.ts','menu.ts','popups.ts','input-events.ts','adaptive.ts','compression.ts','images.ts','groups.ts','expression-methods.ts','tree.ts','panel.ts','transition.ts','repeater-actions.ts','page-layout.ts','motion.ts','navigation.ts','controls.ts','table.ts','runtime.ts','repeater-model.ts','render-tree.ts','widget-state.ts','dom-content.ts','expression.ts','behavior-runtime.ts','widget-dom.ts','selection.ts','variables.ts'])copyFileSync(join(src,file),join(output,'source',file));
copyFileSync(join(src,'model.ts'),join(output,'source/model.ts'));
writeFileSync(join(output,'source/project.ts'),`import type { Project } from './model.ts';\nexport const project: Project = ${JSON.stringify(project,null,2)};\n`);
writeFileSync(join(output,'project.json'),JSON.stringify(project,null,2)+'\n');
writeFileSync(join(output,'conversion-report.json'),JSON.stringify({input:basename(input),sourceSha256:project.sourceSha256,stats:project.stats,issues:project.issues,validation:'Generated from native RP9 object graph; visual parity must be compared against native Axure output. Unsupported behavior is reported, not silently claimed equivalent.'},null,2)+'\n');
const directory=pageDirectory(project),firstPage=project.pages.find(p=>p.id===firstDirectoryPage(directory))??project.pages[0];
const pageById=new Map(project.pages.map(p=>[p.id,p]));
const links=(nodes:import('./model.ts').PageTreeNode[]):string=>'<ul>'+nodes.map(node=>{
  const page=node.pageId?pageById.get(node.pageId):undefined;
  const label=page?`<a href="${escapeHtml(page.file)}" target="preview" data-page-id="${escapeHtml(page.id)}"${page.id===firstPage?.id?' class="active" aria-current="page"':''}>${escapeHtml(node.name)}</a>`:`<span class="folder">${escapeHtml(node.name)}</span>`;
  return `<li>${node.children.length?`<details open><summary>${label}</summary>${links(node.children)}</details>`:label}</li>`;
}).join('')+'</ul>';
writeFileSync(join(output,'index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(basename(input))}</title><style>*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#e9edf2;color:#17212e;display:flex;height:100vh}aside{width:230px;flex-shrink:0;background:#fff;padding:24px 16px;overflow:auto;border-right:1px solid #dce1e7}h1{font-size:18px;margin:0 8px 24px}nav{width:max-content;min-width:100%;white-space:nowrap}nav ul{list-style:none;margin:0;padding:0}nav ul ul{padding-left:16px}nav summary{cursor:pointer}nav summary a,nav summary .folder{display:inline-block}nav .folder{padding:12px}nav li{margin:0}a{display:block;text-decoration:none;color:inherit;padding:12px;border-radius:8px;margin:4px 0}a:hover,a.active{background:#e9f0ff;color:#245ac3}main{flex:1;padding:28px;overflow:auto}iframe{display:block;border:0;background:white;width:${Math.max(...project.pages.map(p=>p.width))}px;height:${Math.max(...project.pages.map(p=>p.height))}px;box-shadow:0 8px 36px #16223822}</style></head><body><aside><h1>${escapeHtml(basename(input,'.rp'))}</h1><nav aria-label="页面目录">${links(directory)}</nav></aside><main><iframe title="原型页面" name="preview" src="${escapeHtml(firstPage?.file??'')}"></iframe></main><script>document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(link=>{link.classList.remove('active');link.removeAttribute('aria-current')});a.classList.add('active');a.setAttribute('aria-current','page')}));</script></body></html>`);
copyFileSync(join(output,'index.html'),join(output,'react/index.html'));
}
