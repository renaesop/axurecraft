import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {emitProject} from '../src/emit.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import type {Widget,Action} from '../src/model.ts';
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8')),page=project.pages[0],base=page.widgets[0];project.pages=[page];
const box=(id:string,x:number,y:number,width=100,height=40):Widget=>({...structuredClone(base),id,name:id,x,y,width,height,kind:'shape',type:'VectorShape',css:{background:'#4285f4'},content:[],behaviors:[],variants:undefined});
const compression={vertical:true,easing:2,duration:100};
const button=(id:string,x:number,actions:Action[]):Widget=>({...box(id,x,20,110,30),kind:'control',type:'Button',content:[{kind:'control',control:'button',label:id,value:id,placeholder:'',disabled:false,readOnly:false}],behaviors:[{event:'click',actions}]});
const source=box('source',40,100,100,80);source.kind='panel';source.type='DynamicPanel';source.states=[{id:'one',name:'one',widgets:[box('inside',0,120)]}];
const group=box('group',20,200,300,60);group.kind='group';group.type='Layer';group.children=[box('group-in',30,10),box('group-out',200,10)];
const pin=box('pinned',40,220);pin.kind='panel';pin.type='DynamicPanel';pin.panel={fixed:{horizontal:'left',vertical:'top',marginX:40,marginY:220,keepInFront:true}};
page.widgets=[source,box('below',40,300),box('edge',140,300),box('above',40,90),group,pin,button('Hide',20,[{kind:'hide',target:'source',compression}]),button('Show',140,[{kind:'show',target:'source',compression}]),button('Horizontal',260,[{kind:'hide',target:'horizontal',compression:{...compression,vertical:false}}]),box('horizontal',400,400,80,40),box('right',500,400),box('no-overlap',500,450)];page.width=900;page.height=700;page.behaviors=[];
const out=resolve('output/compression-check');await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-compression-fixture.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const errors:string[]=[],results:unknown[]=[];
try{const tab=await browser.newPage({viewport:{width:900,height:700}});tab.on('pageerror',e=>errors.push(e.message));
 for(const renderer of ['','react']){
  await tab.goto(pathToFileURL(join(out,renderer,page.file)).href,{waitUntil:'networkidle'});
  const y=async(id:string)=>(await tab.locator('#'+id).boundingBox())?.y;
  await tab.getByRole('button',{name:'Hide',exact:true}).click();await tab.waitForTimeout(140);
  assert.equal(await y('below'),220);assert.equal(await y('edge'),300);assert.equal(await y('above'),90);assert.equal(await y('group-in'),130);assert.equal(await y('group-out'),210);assert.equal(await y('pinned'),220);
  await tab.getByRole('button',{name:'Hide',exact:true}).click();await tab.waitForTimeout(140);assert.equal(await y('below'),220,'hiding twice cannot pull twice');
  await tab.getByRole('button',{name:'Show',exact:true}).click();await tab.waitForTimeout(140);assert.equal(await y('below'),300);assert.equal(await y('group-in'),210);assert.equal(await y('inside'),220,'panel descendants stay in their own state scope');
  await tab.getByRole('button',{name:'Horizontal',exact:true}).click();await tab.waitForTimeout(140);assert.equal((await tab.locator('#right').boundingBox())?.x,420);assert.equal((await tab.locator('#no-overlap').boundingBox())?.x,500);
  results.push({renderer:renderer||'html',vertical:true,horizontal:true,partialGroup:true,fixedExcluded:true,stateBoundary:true,idempotent:true});
 }
 assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log(results);
}finally{await browser.close();}
