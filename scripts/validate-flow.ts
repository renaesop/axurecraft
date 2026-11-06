import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';import {chromium} from 'playwright-core';import {PNG} from 'pngjs';
import {emitProject} from '../src/emit.ts';import {parseSemanticProject} from '../src/semantic.ts';import {instantiateMaster} from '../src/master.ts';import {flowCases,flowEndingCase,flowAttachmentCase} from '../tests/fixtures/flow.ts';import {flowStructure} from '../src/flow.ts';import type {Widget,Page} from '../src/model.ts';
import {parseConnector} from '../src/connector.ts';import type {Graph,Value} from '../src/graph.ts';
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8')),cases=flowCases();
// Original synthetic reproduction: the segment reaches the target while the
// unresolved endpoint cache points far away. Exercise both emitted renderers.
const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:v!==null&&typeof v==='object'?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:{tag:3,value:v as number};
const stale:Page={...cases.flowChain,id:'flow-stale-endpoints',name:'flow-stale-endpoints',file:'flow-stale-endpoints.html',widgets:[]};
for(const type of [0,1]){
 const y=100+type*160,id='stale-'+type;
 const source:Widget={...structuredClone(cases.flowChain.widgets.find(w=>w.id==='start')!),id:id+'-source',x:40,y:y-44};
 const target:Widget={...structuredClone(source),id:id+'-target',x:40,y:y+23};
 const g={guids:[],objects:new Map([[1,{tag:9,body:value({'from-x':110,'from-y':y,'to-x':110,'to-y':y+23})}]])} as unknown as Graph;
 const c=parseConnector(g,{tag:9,body:value({'connector-type':type,'end-point-x':700,'end-point-y':550,segments:[1]})},new Map([[101,value({X:110,Y:y})],[15,value(2)]]),id)!;
 const {graphic,...geometry}=c;
 const line:Widget={...structuredClone(source),...geometry,id,type:'Connector',css:{},content:[graphic],connection:{routing:type===0?'rounded':'orthogonal',start:{target:source.id},end:{target:target.id}}};
 stale.widgets.push(line,source,target);
}
const status:Widget={...structuredClone(cases.flowChain.widgets.find(w=>w.id==='start')!),id:'status',name:'Status',x:30,y:530,width:300,height:40,css:{},content:[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'ready',css:{}}]}]}]};
for(const p of Object.values(cases)){
 for(const w of p.widgets.filter(w=>w.connection))w.behaviors=[{event:'click',actions:[{kind:'set-text',target:'status',expression:{kind:'literal',value:w.id}}]}];p.widgets.push(structuredClone(status));
}
const source=flowCases().flowChain.widgets;
const copies:Page={...cases.flowChain,id:'flow-copies',name:'flow-copies',file:'flow-copies.html',width:1000,widgets:['left--','right--'].map((prefix,i):Widget=>({...status,id:prefix+'group',name:prefix,kind:'group',type:'ReferenceDiagramObject',x:i*500,y:0,width:440,height:300,css:{},content:[],children:instantiateMaster(source,prefix)}))};
const endings=flowEndingCase();endings.widgets=['circle-left--','circle-right--'].map((prefix,i):Widget=>({...copies.widgets[0],id:prefix+'group',name:prefix,x:i*500,children:instantiateMaster(flowEndingCase().widgets,prefix)}));endings.width=1000;
project.pages=[...Object.values(cases),copies,endings,flowAttachmentCase(),stale];const out=resolve('output/flow-check');await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-flow-fixtures.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),results:unknown[]=[],errors:string[]=[];
try{const tab=await browser.newPage({viewport:{width:1000,height:620}});tab.on('pageerror',e=>errors.push(e.message));for(const page of project.pages){const shots:Buffer[]=[];
 for(const renderer of ['','react']){
  await tab.goto(pathToFileURL(join(out,renderer,page.file)).href,{waitUntil:'networkidle'});
  const topology=flowStructure(page.widgets);assert.equal(await tab.locator('[data-kind="Connector"]').count(),topology.edges.length);assert.equal(await tab.locator('canvas,iframe,img').count(),0);
  const rendering=await tab.locator('[data-kind="Connector"] > svg').evaluateAll(es=>es.map(el=>{
   const svg=el as SVGSVGElement,rect=svg.getBoundingClientRect(),paths=[...svg.querySelectorAll<SVGPathElement>(':scope > path')];return {id:svg.parentElement!.id,width:rect.width,height:rect.height,length:paths.reduce((n,p)=>n+p.getTotalLength(),0),markers:paths.flatMap(p=>['marker-start','marker-end'].flatMap(attr=>{const id=p.getAttribute(attr)?.match(/^url\(#(.+)\)$/)?.[1];return id?[{id,count:[...document.querySelectorAll('[id]')].filter(e=>e.id===id).length}]:[];}))};
  }));
  assert.equal(rendering.length,topology.edges.length);for(const r of rendering){assert.ok(r.width>0&&r.height>0,r.id+' needs a paintable SVG viewport');assert.ok(r.length>0,r.id+' has a path');for(const m of r.markers)assert.equal(m.count,1,'unique marker '+m.id);}
  // Measure actual browser path endpoints against the target widgets. This
  // detects common errors even when HTML and React produce identical images.
  const measureEndpoints=()=>tab.evaluate(edges=>edges.flatMap(edge=>{
   const path=document.getElementById(edge.id)!.querySelector<SVGPathElement>('svg > path')!;
   return (['start','end'] as const).flatMap(side=>{
    const id=edge[side]?.target;if(!id)return [];
    const rect=document.getElementById(id)!.getBoundingClientRect(),p=path.getPointAtLength(side==='start'?0:path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
    const distance=Math.min(...[[rect.left,rect.top+rect.height/2],[rect.right,rect.top+rect.height/2],[rect.left+rect.width/2,rect.top],[rect.left+rect.width/2,rect.bottom]].map(([x,y])=>Math.hypot(p.x-x,p.y-y)));
    return [{connector:edge.id,side,target:id,distance}];
   });
  }),topology.edges);
  const endpoints=await measureEndpoints();
  for(const end of endpoints)assert.ok(end.distance<.05,`${page.id}/${renderer||'html'} ${end.connector} ${end.side}: gap ${end.distance}px`);
  assert.equal(await tab.locator('[id]').evaluateAll(es=>new Set(es.map(e=>e.id)).size),await tab.locator('[id]').count());
  if(page.id==='flow-chain'){
   await tab.mouse.click(230,82);assert.equal(await tab.locator('#status').textContent(),'start-process');await tab.mouse.click(370,170);assert.equal(await tab.locator('#status').textContent(),'process-end');
  }
  await tab.mouse.move(990,610);const shot=await tab.screenshot({path:join(out,page.id+'-'+(renderer||'html')+'.png')});shots.push(shot);
  if(page.id==='flow-endings'){
   const png=PNG.sync.read(shot),rgb=(x:number,y:number)=>[...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3)];
   for(const dx of [0,500]){
    assert.deepEqual(rgb(60+dx,80),[43,92,136],'filled circle center');
    assert.deepEqual(rgb(220+dx,80),[247,247,247],'hollow ending does not show the shaft');
    assert.deepEqual(rgb(340+dx,40),[247,247,247],'hollow start does not show the shaft');
    assert.deepEqual(rgb(340+dx,180),[43,92,136],'filled vertical ending');
    assert.deepEqual(rgb(223+dx,80),[43,92,136],'circle ring is visible');
   }
   assert.deepEqual(rgb(480,480),[247,247,247],'page background paints once');
   assert.deepEqual(rgb(480,610),[247,247,247],'document background covers outside page bounds');
  }
  if(page.id==='flow-chain'){
   const png=PNG.sync.read(shot);for(const [x,y]of [[230,82],[370,170]])assert.deepEqual([...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3)],[43,92,136],'straight line pixels');
   // Demonstrate this regression fixture detects the old zero-axis SVG sizing.
   const old=await tab.addStyleTag({content:'.rp-widget[data-kind="Connector"] .ax-vector{min-width:0;min-height:0}'});const bad=PNG.sync.read(await tab.screenshot());assert.deepEqual([...bad.data.subarray((82*bad.width+230)*4,(82*bad.width+230)*4+3)],[255,255,255]);await old.evaluate(el=>el.remove());
  }
  if(page.id==='flow-attachments'){
   await tab.evaluate(()=>{document.documentElement.style.zoom='1.1';});
   const zoomed=await measureEndpoints();for(const end of zoomed)assert.ok(end.distance<.05,`110% ${end.connector} ${end.side}: ${end.distance}px`);
   // Reintroduce the former SVG fit mode: rounding a 2px viewport width
   // scales its entire 310px height and visibly detaches the endpoints.
   await tab.locator('#thin > svg').evaluate(svg=>svg.setAttribute('preserveAspectRatio','xMidYMid meet'));
   assert.ok((await measureEndpoints()).some(e=>e.connector==='thin'&&e.distance>.75),'detect old SVG letterboxing');
   await tab.locator('#thin > svg').evaluate(svg=>svg.setAttribute('preserveAspectRatio','none'));
   await tab.screenshot({path:join(out,`${page.id}-${renderer||'html'}-zoom1.1.png`)});
   await tab.evaluate(()=>{document.documentElement.style.zoom='1';});
   results.push({page:page.id,renderer:renderer||'html',zoom:1.1,endpoints:zoomed,detectsOldAspectRatioBug:true});
  }
  results.push({page:page.id,renderer:renderer||'html',nodes:topology.nodes.length,edges:topology.edges.length,branches:topology.branches,merges:topology.merges,hasCycle:topology.hasCycle,paintablePaths:true,uniqueMarkers:true,endpoints});
 }
 const a=PNG.sync.read(shots[0]),b=PNG.sync.read(shots[1]);let differentPixels=0;for(let i=0;i<a.data.length;i+=4)if(!a.data.subarray(i,i+4).equals(b.data.subarray(i,i+4)))differentPixels++;assert.equal(differentPixels,0,page.id+' HTML/React screenshot');results.push({page:page.id,differentPixels});
}assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log({results,errors});}finally{await browser.close();}
