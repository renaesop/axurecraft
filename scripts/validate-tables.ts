import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {emitProject} from '../src/emit.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import type {Widget,RichText} from '../src/model.ts';

// Authored fixture, independent of downloaded RP documents and Axure runtime.
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8'));
const page=project.pages[0],base=page.widgets[0];project.pages=[page];
const text=(value:string):RichText=>({kind:'text',css:{'justify-content':'center','padding-left':'8px','padding-right':'8px','font-size':'14px'},paragraphs:[{css:{},runs:[{text:value,css:{}}]}]});
const table:Widget={...structuredClone(base),id:'table',name:'Release checks',kind:'table',type:'Table',x:40,y:40,width:1,height:1,css:{},content:[],behaviors:[],variants:undefined,table:{rowHeights:[30,50,40],columnWidths:[80,160,100]},children:[]};
for(let i=0;i<9;i++){
 const css:Record<string,string>={background:'white','border-style':'solid','border-width':'0px',color:'#222'};
 for(const side of ['left','top','right','bottom']){css[`--rp-cell-${side}-width`]='1px';css[`--rp-cell-${side}-color`]='#797979';}
 table.children!.push({...structuredClone(base),id:`cell${i}`,name:`Cell ${i}`,kind:'shape',type:'TableCell',x:0,y:0,width:1,height:1,css,content:[text(i===4?'Long text wraps within the cell':i===7?'':`Cell ${i}`)],behaviors:[],variants:undefined});
}
table.children![4].variants={selected:{css:{...table.children![4].css,background:'#d3e8ff'}}};
table.children![4].behaviors=[{event:'click',actions:[{kind:'set-text',target:'cell7',expression:{kind:'literal',value:'Updated'}},{kind:'set-selected',target:'cell4',expression:{kind:'literal',value:true}}]}];
const select:Widget={...structuredClone(base),id:'select',kind:'control',type:'ComboBox',x:40,y:200,width:160,height:30,css:{},content:[{kind:'control',control:'select',label:'Review status',value:'ready',placeholder:'',disabled:false,readOnly:false,options:[{label:'Pending review',value:'pending'},{label:'Ready to ship',value:'ready'}]}],behaviors:[],variants:undefined};
Object.assign(page,{widgets:[table,select],width:500,height:300,behaviors:[]});
const out=resolve('output/tables-check');
await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-table-fixture.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors:string[]=[],results:unknown[]=[];
try{
 const tab=await browser.newPage({viewport:{width:600,height:350},deviceScaleFactor:1});tab.on('pageerror',e=>errors.push(e.message));
 for(const renderer of ['','react']){
  await tab.goto(pathToFileURL(join(out,renderer,page.file)).href,{waitUntil:'networkidle'});
  assert.equal(await tab.getByRole('table').count(),1);assert.equal(await tab.getByRole('row').count(),3);assert.equal(await tab.getByRole('cell').count(),9);
  const bounds=await tab.locator('#cell4').boundingBox();assert.deepEqual(bounds,{x:120,y:70,width:160,height:50});
  assert.equal(await tab.locator('#select select').inputValue(),'ready');await tab.locator('#select select').selectOption('pending');assert.equal(await tab.locator('#select select').inputValue(),'pending');
  const image=PNG.sync.read(await tab.screenshot({path:join(out,(renderer||'html')+'-initial.png')}));
  const pixel=(x:number,y:number)=>[...image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+3)];
  assert.deepEqual(pixel(120,75),[121,121,121]);assert.deepEqual(pixel(119,75),[255,255,255]);assert.deepEqual(pixel(121,75),[255,255,255]);
  await tab.locator('#cell4').click();await tab.waitForFunction(()=>document.getElementById('cell7')?.textContent==='Updated');assert.equal(await tab.locator('#cell4').getAttribute('aria-selected'),'true');
  await tab.screenshot({path:join(out,(renderer||'html')+'-clicked.png')});results.push({renderer:renderer||'html',bounds,singlePixelSharedBorder:true,cellClickSetTextAndSelected:true,selectOptions:true});
 }
 assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log(results);
}finally{await browser.close();}
