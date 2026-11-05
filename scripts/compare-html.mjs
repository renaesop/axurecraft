import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Usage: node scripts/compare-html.mjs comparison.json output/comparison [candidate-override]
// Inputs are real pages: reference is an Axure export, candidate is our output.
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(process.argv[4])config.candidate=process.argv[4];
const output=resolve(process.argv[3]??'output/html-comparison');
mkdirSync(output,{recursive:true});
const url=value=>/^(https?|file):/.test(value)?value:pathToFileURL(resolve(value)).href;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu','--force-color-profile=srgb']});
const comparisons=[];
try{
 for(const viewport of config.viewports??[{width:900,height:600}]){
  for(const [index,state] of (config.states??[{name:'initial',hash:''}]).entries()){
   const name=`${viewport.width}x${viewport.height}-${index+1}`;
   const captures=[];
   for(const kind of ['reference','candidate']){
    // A fresh context avoids sharing cookies, globals, navigation history or storage.
    const context=await browser.newContext({viewport,deviceScaleFactor:1,colorScheme:'light',reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC'});
    const page=await context.newPage();const errors=[],imageFailures=new Set();page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',request=>{if(request.resourceType()==='image')imageFailures.add(request.url());});
    page.on('response',response=>{if(response.status()>=400&&response.request().resourceType()==='image')imageFailures.add(response.url());});
    const target=url(config[kind])+(state.hash??'');
    const response=await page.goto(target,{waitUntil:'networkidle',timeout:60000});
    if(response&&response.status()>=400)errors.push(`Main document HTTP ${response.status()}`);
    if(config.readySelector)await page.locator(config.readySelector[kind]).waitFor();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
    for(const step of state.steps??[]){
      if(step.action==='hover')await page.mouse.move(step.x,step.y);
      else if(step.action==='click')await page.mouse.click(step.x,step.y);
      else if(step.action==='scroll')await page.evaluate(({x,y})=>window.scrollTo(x,y),step);
      else if(step.action==='fill'){const selector=typeof step.selector==='string'?step.selector:step.selector[kind];await page.locator(selector).fill(step.value);}
      else throw new Error(`Unknown comparison action ${step.action}`);
      if(step.waitMs)await page.waitForTimeout(step.waitMs);
    }
    if(config.settleMs)await page.waitForTimeout(config.settleMs);
    const failedImages=[...imageFailures,...await page.evaluate(()=>[...document.images].filter(image=>!image.complete||image.naturalWidth===0).map(image=>image.getAttribute('src')))];
    const filename=`${name}-${kind}.png`;
    const bytes=await page.screenshot({path:join(output,filename),animations:'disabled'});
    captures.push({kind,url:target,filename,errors,failedImages,png:PNG.sync.read(bytes)});
    await context.close();
   }
   const [a,b]=captures.map(c=>c.png);
   if(a.width!==b.width||a.height!==b.height)throw new Error('Screenshot dimensions differ');
   const diff=new PNG({width:a.width,height:a.height}),pair=new PNG({width:a.width*2,height:a.height});
   let differentPixels=0,maxChannelDifference=0,totalDifference=0;const tiles=new Map();
   for(let p=0;p<a.width*a.height;p++){
    let changed=false;
    for(let c=0;c<4;c++){
     const d=Math.abs(a.data[p*4+c]-b.data[p*4+c]);changed||=d!==0;maxChannelDifference=Math.max(maxChannelDifference,d);totalDifference+=d;
    }
    if(changed){
      differentPixels++;const x=p%a.width,y=Math.floor(p/a.width),key=`${Math.floor(x/64)},${Math.floor(y/64)}`;
      const tile=tiles.get(key)??{x:Math.floor(x/64)*64,y:Math.floor(y/64)*64,width:64,height:64,differentPixels:0};tile.differentPixels++;tiles.set(key,tile);
    }
    diff.data.set(changed?[235,35,75,255]:[255,255,255,255],p*4);
   }
   PNG.bitblt(a,pair,0,0,a.width,a.height,0,0);PNG.bitblt(b,pair,0,0,b.width,b.height,a.width,0);
   writeFileSync(join(output,`${name}-diff.png`),PNG.sync.write(diff));
   writeFileSync(join(output,`${name}-pair.png`),PNG.sync.write(pair));
   comparisons.push({name,state:state.name,viewport,captures:captures.map(({png,...c})=>c),differentPixels,totalPixels:a.width*a.height,maxChannelDifference,meanChannelDifference:totalDifference/a.data.length,largestDifferenceRegions:[...tiles.values()].sort((a,b)=>b.differentPixels-a.differentPixels).slice(0,20)});
  }
 }
 const report={scope:'Axure-exported HTML versus converted HTML; full viewport, exact RGBA comparison, no crop or tolerance',browser:browser.version(),platform:process.platform,source:config.source??null,comparisons};
 writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 writeFileSync(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>AxureCraft · HTML comparison</title><style>body{font:16px system-ui;margin:40px;background:#f4f6f9;color:#17243b}article{background:white;padding:24px;margin:24px 0;border-radius:12px}img{max-width:100%;border:1px solid #d9deea}a{color:#315bea}summary{cursor:pointer}</style><h1>Axure HTML ↔ AxureCraft HTML</h1><p>Left: Axure original. Right: converted HTML. Red pixels in the difference image indicate any RGBA difference.</p>${comparisons.map(c=>`<article><h2>${escape(c.state)} · ${c.viewport.width} × ${c.viewport.height}</h2><p>${c.differentPixels.toLocaleString()} / ${c.totalPixels.toLocaleString()} pixels differ · browser errors: ${c.captures.reduce((n,x)=>n+x.errors.length,0)}</p><a href="${c.name}-pair.png"><img src="${c.name}-pair.png"></a><details><summary>Difference image</summary><img src="${c.name}-diff.png"></details></article>`).join('')}`);
 console.log(JSON.stringify(comparisons.map(({captures,...c})=>c),null,2));
 if(process.env.GITHUB_STEP_SUMMARY){
  const lines=['## Native HTML screenshot comparison','','Browser: '+report.browser+' · '+report.platform,
   '', '| Viewport | State | Different pixels | Ratio |', '| --- | --- | ---: | ---: |',
   ...comparisons.map(c=>`| ${c.viewport.width} × ${c.viewport.height} | ${c.state} | ${c.differentPixels} / ${c.totalPixels} | ${(100*c.differentPixels/c.totalPixels).toFixed(4)}% |`),
   '', 'Pixel differences are reported, not gated. Success means capture completed without page errors or broken images; it does not establish UI equivalence.',
   'Download the native-html-comparison artifact to view index.html and the paired/difference images.', ''];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));
 }
 if(comparisons.some(c=>c.captures.some(capture=>capture.errors.length||capture.failedImages.length)))throw new Error('Page errors or broken images detected; see report.json');
}finally{await browser.close();}
