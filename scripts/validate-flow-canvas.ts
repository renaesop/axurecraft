import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {flowCanvasCase} from '../tests/fixtures/flow-canvas.ts';
import {writeFlowCanvas} from '../src/flow-canvas-export.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import {canvasIndex,moveCanvas} from '../src/flow-canvas-model.ts';
import {convertRp9} from '../src/convert.ts';
import {connectorLabelsFile} from '../tests/fixtures/connector-labels.ts';
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8'));
const fixture=flowCanvasCase(),native=convertRp9(connectorLabelsFile()).project.pages[0];native.id='native';native.name='原生连线';
project.pages=[fixture,native];const out=resolve('output/flow-canvas-check');mkdirSync(out,{recursive:true});
await writeFlowCanvas(project,out);
writeFileSync(join(out,'project.json'),JSON.stringify(project,null,2));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1100},acceptDownloads:true}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
const externalRequests:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
await page.addInitScript(()=>{(window as any).__canvasRoots=[];(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(){return 1;},onCommitFiberRoot(_id:number,root:any){(window as any).__canvasRoots=[root];},onCommitFiberUnmount(){},onPostCommitFiberRoot(){}};});
try{
 await page.goto(pathToFileURL(join(out,'index.html')).href);
 await page.locator('[data-id="entry"]').waitFor();await page.locator('#entry-check svg > path').waitFor({state:'attached'});
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__edge').length>=8);
 assert.equal(await page.locator('iframe,canvas').count(),0);
 assert.ok(await page.evaluate(()=>{const pending=[...(window as any).__canvasRoots.map((r:any)=>r.current)];while(pending.length){const f=pending.pop();if(!f)continue;if(f.type?.name==='CanvasWidget')return true;pending.push(f.child,f.sibling);}return false;}),'actual inspectable React canvas widgets');
 const expected=canvasIndex(fixture);
 for(const id of [...expected.keys()].filter(id=>!id.startsWith('hidden-')))assert.equal(await page.locator(`[id="${id}"]`).count(),1,'retain whole canvas '+id);
 assert.equal(await page.locator('#table [role=cell]').count(),4);
 assert.equal(await page.locator('#hidden-note').count(),0,'hidden group must not expose its child');
 assert.equal(await page.getByRole('img',{name:'外部内容',exact:true}).count(),1);assert.deepEqual(externalRequests,[]);
 const surface=await page.locator('.flow-surface').boundingBox();assert.ok(surface);
 const verifyGeometry=async(model=fixture)=>{
  for(const entry of canvasIndex(model).values()){
   const w=entry.widget,g=w.connection?.geometry;if(!g)continue;
   const ends=await page.locator(`[id="${w.id}"] svg > path`).first().evaluate(p=>{const path=p as SVGPathElement;return [path.getPointAtLength(0),path.getPointAtLength(path.getTotalLength())].map(point=>{const q=point.matrixTransform(path.getScreenCTM()!);return {x:q.x,y:q.y};});});
   for(const [i,p] of [g.start,g.end].entries())assert.ok(Math.hypot(ends[i].x-surface.x-entry.origin.x-p.x,ends[i].y-surface.y-entry.origin.y-p.y)<.75,`${w.id} endpoint ${i}`);
  }
 };
 await verifyGeometry();const initial=PNG.sync.read(await page.screenshot({path:join(out,'initial.png')}));
 const at=(Math.round(surface.y+100)*initial.width+Math.round(surface.x+370))*4;assert.deepEqual([...initial.data.subarray(at,at+3)],[43,92,136],'vertical edge actually paints, not merely present in DOM');
 const drag=async(id:string,dx:number,dy:number,corner=false)=>{
  const node=page.locator(`.react-flow__node[data-id="${id}"]`),r=await node.boundingBox();assert.ok(r);
  const x=corner?r.x+8:r.x+r.width/2,y=corner?r.y+r.height-8:r.y+r.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();
  await page.waitForFunction(({id,x,y})=>{const r=document.querySelector(`.react-flow__node[data-id="${id}"]`)!.getBoundingClientRect();return Math.abs(r.x-x)<.75&&Math.abs(r.y-y)<.75;},{id,x:r.x+dx,y:r.y+dy});
 };
 await drag('entry',40,30);let moves=[{id:'entry',x:340,y:50}];await verifyGeometry(moveCanvas(fixture,moves));
 const group=expected.get('group')!.widget;await drag('group',50,-20,true);moves.push({id:'group',x:group.x+50,y:group.y-20});await verifyGeometry(moveCanvas(fixture,moves));
 await drag('isolated',-30,40);moves.push({id:'isolated',x:770,y:120});
 await drag('table',-20,35);moves.push({id:'table',x:760,y:235});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'保存画布',exact:true}).click();const download=await downloadPromise;await download.saveAs(join(out,'saved.canvas.json'));
 const saved=JSON.parse(readFileSync(join(out,'saved.canvas.json'),'utf8'));assert.deepEqual(saved.moves,moves);
 await page.screenshot({path:join(out,'edited.png')});
 await page.reload();await page.locator('#entry-check svg > path').waitFor({state:'attached'});await verifyGeometry();
 await page.getByLabel('打开画布',{exact:true}).setInputFiles(join(out,'saved.canvas.json'));await page.getByRole('status').filter({hasText:'画布已恢复'}).waitFor();await page.locator('#entry-check svg > path').waitFor({state:'attached'});await verifyGeometry(moveCanvas(fixture,moves));
 const reSave=page.waitForEvent('download');await page.getByRole('button',{name:'保存画布',exact:true}).click();await (await reSave).saveAs(join(out,'resaved.canvas.json'));assert.deepEqual(JSON.parse(readFileSync(join(out,'resaved.canvas.json'),'utf8')),saved);
 writeFileSync(join(out,'conflict.canvas.json'),JSON.stringify({...saved,sourceSha256:'other'}));
 await page.getByLabel('打开画布',{exact:true}).setInputFiles(join(out,'conflict.canvas.json'));await page.getByRole('status').filter({hasText:'baseline conflict'}).waitFor();await verifyGeometry(moveCanvas(fixture,moves));
 await page.getByRole('button',{name:'恢复原布局',exact:true}).click();await page.locator('#entry-check svg > path').waitFor({state:'attached'});await verifyGeometry();
 await page.getByLabel('页面',{exact:true}).selectOption('native');await page.locator(`[id="${native.widgets[0].id}"] svg > path`).waitFor({state:'attached'});await verifyGeometry(native);
 for(const w of native.widgets){const g=w.connection!.geometry!;if(!g.label)continue;const text=w.content.find(c=>c.kind==='text');if(!text)continue;const r=await page.locator(`[id="${w.id}"] .rp-text`).boundingBox();assert.ok(r);assert.ok(Math.abs(r.x+r.width/2-surface.x-g.label.x)<.75);assert.ok(Math.abs(r.y+r.height/2-surface.y-g.label.y)<.75);}
 assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);
 const report={wholeCanvasObjects:expected.size,reactComponents:true,initialGeometry:true,dragNode:true,dragGroup:true,freeEnd:true,isolatedObject:true,tableCells:4,saveReload:true,conflictRejected:true,nativeLabels:true,hiddenGroups:true,externalFramesInert:true,errors};
 writeFileSync(join(out,'validation.json'),JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
