import {materializePage} from '../src/repeater-model.ts';
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]??'output/campus');
const project=JSON.parse(readFileSync(join(root,'project.json'),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu','--force-color-profile=srgb']});
const page=await browser.newPage({viewport:{width:900,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
mkdirSync(join(root,'screenshots'),{recursive:true});
const result=[];
const flatten=widgets=>widgets.flatMap(w=>[w,...flatten(w.children??[]),...(w.states??[]).flatMap(s=>flatten(s.widgets))]);
try{
for(const p of project.pages.map(p=>materializePage(p))){
  const url=pathToFileURL(join(root,p.file)).href;
  await page.goto(url);await page.locator('.rp-page').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  const checks=await page.evaluate(()=>({
    brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),
    ids:[...document.querySelectorAll('[id]')].map(e=>e.id),
    widgets:document.querySelectorAll('.rp-widget').length,
    badGeometry:[...document.querySelectorAll('.rp-widget')].filter(e=>/NaN|Infinity/.test(e.getAttribute('style')??'')).map(e=>e.id)
  }));
  assert.equal(checks.brokenImages.length,0,p.file+' broken images');
  assert.equal(checks.ids.length,new Set(checks.ids).size,p.file+' duplicate IDs');
  assert.equal(checks.badGeometry.length,0,p.file+' invalid geometry');
  assert.equal(checks.widgets,flatten(p.widgets).length);
  await page.locator('.rp-page').screenshot({path:join(root,'screenshots',p.file.replace('.html','.png'))});
  const behaviors=flatten(p.widgets).flatMap(w=>w.behaviors.filter(b=>b.event==='click').map(b=>({id:w.id,actions:b.actions})));
  let navigation=0,states=0,visibility=0;
  // Dispatch exact target events: verifies handler/ID wiring, not pointer hit testing.
  for(const entry of behaviors){
    if(entry.actions.length!==1)continue;
    const a=entry.actions[0];
    if(!['link','state','show','hide','toggle'].includes(a.kind))continue;
    if(a.kind==='link'&&!/^page-\d+\.html$/.test(a.value))continue;
    await page.goto(url);
    if(a.kind==='state'){
      const before=await page.evaluate(id=>[...document.getElementById(id)?.querySelectorAll(':scope > .rp-state')??[]].map(s=>({id:s.dataset.state,hidden:s.hidden})),a.target);
      if(!before.length)continue;
      await page.locator('[id="'+entry.id+'"]').dispatchEvent('click');
      const after=await page.evaluate(id=>[...document.getElementById(id).querySelectorAll(':scope > .rp-state')].filter(s=>!s.hidden).map(s=>s.dataset.state),a.target);
      const index=before.findIndex(s=>!s.hidden);
      const expected=a.value==='next'?before[(index+1)%before.length].id:a.value==='previous'?before[(index+before.length-1)%before.length].id:a.value;
      assert.deepEqual(after,[expected]);states++;
    }else if(a.kind==='link'){
      await Promise.all([page.waitForURL('**/'+a.value),page.locator('[id="'+entry.id+'"]').dispatchEvent('click')]);navigation++;
    }else{
      const target=page.locator('[id="'+a.target+'"]');if(!await target.count())continue;
      const before=await target.evaluate(e=>getComputedStyle(e).display);
      await page.locator('[id="'+entry.id+'"]').dispatchEvent('click');
      const after=await target.evaluate(e=>getComputedStyle(e).display);
      assert.equal(after==='none',a.kind==='hide'||a.kind==='toggle'&&before!=='none');visibility++;
    }
  }
  result.push({file:p.file,widgets:checks.widgets,brokenImages:0,duplicateIds:0,navigation,states,visibility});
}
assert.deepEqual(errors,[]);
writeFileSync(join(root,'browser-validation.json'),JSON.stringify({pages:result,errors,scope:'Headless Chromium; dispatched event wiring, assets and geometry. No native Axure screenshot parity or pointer hit testing asserted.'},null,2));
console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
