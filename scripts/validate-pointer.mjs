import {materializePage} from '../src/repeater-model.ts';
import {chromium} from 'playwright-core';import{readFileSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
const root=resolve(process.argv[2]??'output/campus/react');const project=JSON.parse(readFileSync(join(root,'project.json'),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu','--force-color-profile=srgb']});
const page=await browser.newPage({viewport:{width:900,height:1000}});const results=[];
const flatten=ws=>ws.flatMap(w=>[w,...flatten(w.children??[]),...(w.states??[]).flatMap(s=>flatten(s.widgets))]);
try{
for(const p of project.pages.map(p=>materializePage(p))){const url=pathToFileURL(join(root,p.file)).href;
 for(const w of flatten(p.widgets))for(const b of w.behaviors){
  if(b.event!=='click'||b.actions.length!==1)continue;const a=b.actions[0];if(a.kind!=='link'||!/^page-\d+\.html$/.test(a.value))continue;
  await page.goto(url);await page.locator('.rp-page').waitFor();const target=page.locator('[id="'+w.id+'"]');if(!await target.isVisible())continue;
  try{await target.click({timeout:1500});await page.waitForURL('**/'+a.value,{timeout:1500});results.push({page:p.file,widget:w.id,result:'passed'});}catch(e){results.push({page:p.file,widget:w.id,result:'failed',reason:e.message.slice(0,600)});}
 }
}
writeFileSync(join(root,'pointer-validation.json'),JSON.stringify({scope:'Real pointer clicks on initially visible local navigation widgets',results},null,2));console.log(JSON.stringify({passed:results.filter(x=>x.result==='passed').length,failed:results.filter(x=>x.result==='failed')},null,2));
if(results.some(x=>x.result==='failed'))process.exitCode=1;
}finally{await browser.close();}
