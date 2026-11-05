import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {parseSemanticProject} from '../src/semantic.ts';
import {emitProject} from '../src/emit.ts';
import {flattenWidgets} from '../src/repeater-model.ts';
const input=resolve('output/campus'),output=resolve('output/semantic-edit-check');
const project=parseSemanticProject(readFileSync(join(input,'project.json'),'utf8'));
project.pages=project.pages.slice(0,1);
const widget=project.pages[0].widgets.find(w=>w.content.some(c=>c.kind==='text'))!;
const content=widget.content.find(c=>c.kind==='text')!;
const expected='语义修改 <b>不是 HTML</b> {JSX} & 中文';content.paragraphs[0].runs[0].text=expected;widget.x+=7;
// Regeneration consumes only saved JSON and referenced assets; no .rp read in this test.
const restored=parseSemanticProject(JSON.stringify(project));
const assets=new Map<string,Buffer>();
for(const w of flattenWidgets(project.pages[0].widgets))for(const c of [w.content,...Object.values(w.variants??{}).map(v=>v.content??[])].flat())if(c.kind==='image')assets.set(c.asset,readFileSync(join(input,c.asset)));
await emitProject(restored,assets,output,'semantic-edit.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu','--force-color-profile=srgb']});
try{
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const variant of ['','react/']){
   await page.goto(pathToFileURL(join(output,variant,'page-1.html')).href);
   const target=page.locator('[id="'+widget.id+'"]');await target.waitFor();
   await page.evaluate(async()=>{await Promise.all([...document.images].map(image=>image.decode()));});
   assert.ok((await target.textContent())?.includes(expected));
   assert.equal(await target.locator('b').count(),0);
   assert.equal(await target.evaluate(e=>(e as HTMLElement).style.left),widget.x+'px');
 }
 assert.deepEqual(errors,[]);
 writeFileSync(join(output,'validation.json'),JSON.stringify({passed:true,scope:'Edit semantic text and geometry, regenerate without RP, verify literal text and position in HTML and React browser DOM',errors},null,2));
 console.log('Semantic JSON edit → HTML and React browser validation passed');
}finally{await browser.close();}
