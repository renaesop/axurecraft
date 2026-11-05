import{readFileSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';import assert from'node:assert/strict';import{chromium}from'playwright-core';
import{parseSemanticProject}from'../src/semantic.ts';import{emitProject}from'../src/emit.ts';import{flattenWidgets}from'../src/repeater-model.ts';import type{Widget}from'../src/model.ts';
const root=resolve('output/campus'),out=resolve('output/repeater-edit-check');
const project=parseSemanticProject(readFileSync(join(root,'project.json'),'utf8'));
const food=project.pages[4].widgets.find(w=>w.repeater)!,f=food.repeater!;
f.rows[0].cells['263']={kind:'text',value:'修改菜名 <b>纯文本</b>'};f.rows[0].cells['252']=structuredClone(f.rows[1].cells['252']);
const nameGuid=f.bindings.find(b=>b.property==='text'&&b.expression.kind==='column'&&b.expression.columnId===263)!.targetGuid;
flattenWidgets(f.template).find(w=>w.source.guid===nameGuid)!.x+=9;
const comments=flattenWidgets(project.pages[5].widgets).find(w=>w.repeater?.rows.length===0)!;
comments.repeater!.rows.push({id:'new',cells:{'58':{kind:'text',value:'语义用户'},'61':{kind:'text',value:'空中继器新增数据后生成的评论'}}});
const assets=new Map<string,Buffer>();
const asset=(path:string)=>assets.set(path,readFileSync(join(root,path)));
function collect(ws:Widget[]):void{for(const w of ws){for(const c of [w.content,...Object.values(w.variants??{}).map(v=>v.content??[])].flat())if(c.kind==='image')asset(c.asset);if(w.repeater){collect(w.repeater.template);for(const row of w.repeater.rows)for(const cell of Object.values(row.cells))if(cell.kind==='image'&&cell.asset)asset(cell.asset);}collect(w.children??[]);for(const state of w.states??[])collect(state.widgets);}}
for(const p of project.pages)collect(p.widgets);
await emitProject(parseSemanticProject(JSON.stringify(project)),assets,out,'edited-semantic.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu','--force-color-profile=srgb']});
try{
 const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const variant of['','react/']){
  await page.goto(pathToFileURL(join(out,variant,'page-5.html')).href);const title=page.locator(`[id="${food.id}-row0-w-${nameGuid}"]`);await title.waitFor();assert.equal(await title.textContent(),'修改菜名 <b>纯文本</b>');assert.equal(await title.locator('b').count(),0);assert.equal(await title.evaluate(e=>(e as HTMLElement).style.left),flattenWidgets(f.template).find(w=>w.source.guid===nameGuid)!.x+'px');
  const img=page.locator(`[id="${food.id}-row0-w-${f.bindings.find(b=>b.property==='image')!.targetGuid}"] img`);assert.equal(await img.getAttribute('src'),f.rows[0].cells['252'].kind==='image'?f.rows[0].cells['252'].asset:'');
  await page.goto(pathToFileURL(join(out,variant,'page-6.html')).href);const list=page.locator('[id="'+comments.id+'"]');await list.waitFor();assert.ok((await list.textContent())?.includes('语义用户'));assert.ok((await list.textContent())?.includes('空中继器新增数据后生成的评论'));
 }
 assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({passed:true,scope:'No RP read: modify semantic row text/image/template geometry and populate initially empty dataset; regenerate and check actual HTML and React DOM',errors},null,2));console.log('Repeater semantic edit → HTML and JSX verified in browser');
}finally{await browser.close();}
