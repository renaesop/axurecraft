import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {emitProject} from '../src/emit.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import type {RichText} from '../src/model.ts';

// Original semantic fixture: empty text receives a URL variable, then its
// selected content is replaced. The text must stay visible and centered.
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8'));
const page=project.pages[0],widget=page.widgets[0];
project.pages=[page];project.variables=[{name:'text',defaultValue:''},{name:'color',defaultValue:''}];
Object.assign(page,{width:400,height:220,alignment:'center',contentLeft:130,widgets:[widget]});
Object.assign(widget,{x:130,y:120,width:270,height:100,css:{'font-size':'13px',background:'white'},behaviors:[]});
const text:RichText={kind:'text',css:{'justify-content':'center','text-align':'center'},paragraphs:[{css:{},runs:[{text:'',css:{}}]}]};
widget.content=[text];widget.variants={selected:{css:{...widget.css,background:'#99d2f2'},content:[structuredClone(text)]}};
page.behaviors=[{event:'load',actions:[{kind:'set-text',target:widget.id,expression:{kind:'variable',name:'text'}},
 {kind:'branch',branches:[{condition:{kind:'binary',operator:'==',left:{kind:'variable',name:'color'},right:{kind:'literal',value:'blue'}},actions:[{kind:'set-selected',target:widget.id,expression:{kind:'literal',value:true}}]}]}]}];
const out=resolve('output/variables-check');
await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-variable-fixture.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results:unknown[]=[],errors:string[]=[];
try{
 const tab=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});tab.on('pageerror',e=>errors.push(e.message));
 for(const renderer of ['', 'react']){
  await tab.goto(pathToFileURL(join(out,renderer,page.file)).href+'#text=hello&color=blue',{waitUntil:'networkidle'});
  await tab.waitForFunction(id=>document.getElementById(id)?.textContent==='hello',widget.id);
  const geometry=await tab.locator('#'+widget.id).evaluate(el=>{
   const bounds=el.getBoundingClientRect(),text=el.querySelector('.rp-text')!,run=text.querySelector('span')!.getBoundingClientRect();
   return {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,textPosition:getComputedStyle(text).position,
    textCenter:[run.x+run.width/2,run.y+run.height/2],selected:el.getAttribute('aria-selected')};
  });
  assert.equal(geometry.x,315);assert.equal(geometry.y,120);assert.equal(geometry.textPosition,'absolute');assert.equal(geometry.selected,'true');
  assert.ok(Math.abs(geometry.textCenter[0]-450)<1);assert.ok(Math.abs(geometry.textCenter[1]-170)<1);
  await tab.screenshot({path:join(out,(renderer||'html')+'.png')});results.push({renderer:renderer||'html',...geometry});
 }
 assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
