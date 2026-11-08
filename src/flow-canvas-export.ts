import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import type {Project} from './model.ts';
import {baseCss} from './html.ts';
import {parseSemanticProject} from './semantic.ts';

/** Experimental offline entry. Does not replace HTML/React prototype exports. */
export async function writeFlowCanvas(project:Project,output:string,assets=new Map<string,Buffer>()) {
 const root=resolve(output),source=dirname(fileURLToPath(import.meta.url)),req=createRequire(import.meta.url);
 mkdirSync(root,{recursive:true});
 for(const [name,bytes] of assets){const path=resolve(root,name);if(!path.startsWith(root+'/assets/'))throw new Error('Invalid asset path');mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {FlowCanvas} from './flow-canvas.tsx';import '@xyflow/react/dist/style.css';
 const project=${JSON.stringify(project)};
 function App(){const [id,setId]=React.useState(project.pages[0].id);const page=project.pages.find(p=>p.id===id);return <><div className="page-picker"><label>页面 <select aria-label="页面" value={id} onChange={e=>setId(e.target.value)}>{project.pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><span>验证版：拖动对象后保存画布；切页前请保存。复杂状态对象暂为只读。</span></div><FlowCanvas key={id} page={page} sourceSha256={project.sourceSha256}/></>};createRoot(document.getElementById('root')).render(<App/>);`;
 await build({stdin:{contents:entry,resolveDir:source,loader:'tsx'},bundle:true,outfile:join(root,'app.js'),platform:'browser',target:'es2022',jsx:'automatic',nodePaths:[dirname(req.resolve('react/package.json'))+'/..'],sourcemap:true});
 writeFileSync(join(root,'canvas.css'),baseCss+`.page-picker,.flow-toolbar{display:flex;gap:12px;align-items:center;padding:8px;font:14px system-ui;background:#f4f6fa;border-bottom:1px solid #ddd}.page-picker span{color:#556}.flow-toolbar input{max-width:180px}.flow-toolbar button{padding:4px 10px}.flow-surface{height:calc(100vh - 90px);min-height:500px}.react-flow__node-widget.selected{outline:1px dashed #4678df}.react-flow__node-widget .rp-widget{pointer-events:none!important}.react-flow__edge svg{overflow:visible}`);
 writeFileSync(join(root,'index.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>React 画布验证版</title><link rel="stylesheet" href="app.css"><link rel="stylesheet" href="canvas.css"><script defer src="app.js"></script></head><body><div id="root"></div></body></html>');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('Usage: tsx src/flow-canvas-export.ts PROJECT.json OUTPUT');
 const project=parseSemanticProject(readFileSync(input,'utf8')),assets=new Map<string,Buffer>();
 const json=JSON.stringify(project),names=new Set(json.match(/assets\/[a-f\d]{24}\.(?:png|jpg|gif|svg)/g)??[]);
 for(const name of names)assets.set(name,readFileSync(join(dirname(resolve(input)),name)));
 await writeFlowCanvas(project,output,assets);
}
