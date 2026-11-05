import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {emitProject} from '../src/emit.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import type {Action,Widget} from '../src/model.ts';
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8')),page=project.pages[0],base=page.widgets[0];project.pages=[page];
const make=(id:string,x:number,y:number):Widget=>({...structuredClone(base),id,name:id,x,y,width:100,height:60,kind:'shape',type:'VectorShape',css:{background:'#4285f4'},content:[],behaviors:[],variants:undefined});
const box=make('box',30,150),pin=make('pin',0,0);pin.kind='panel';pin.type='DynamicPanel';pin.panel={fixed:{horizontal:'right',vertical:'top',marginX:12,marginY:8,keepInFront:true},percentWidth:false};
const panel=make('panel',250,150);panel.kind='panel';panel.type='DynamicPanel';panel.panel={fitToContent:true};panel.states=[{id:'first',name:'first',widgets:[make('first-child',0,0)]},{id:'second',name:'second',widgets:[make('second-child',0,0)]}];
panel.states[1].widgets[0].width=180;panel.states[1].widgets[0].height=90;
const stateLog=make('state-log',250,260);stateLog.content=[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'waiting',css:{}}]}]}];panel.behaviors=[{event:'statechange',actions:[{kind:'set-text',target:'state-log',expression:{kind:'literal',value:'changed'}}]}];
const button=(id:string,x:number,actions:Action[])=>({...make(id,x,30),width:90,height:35,kind:'control' as const,type:'Button',content:[{kind:'control' as const,control:'button' as const,label:id,value:id,placeholder:'',disabled:false,readOnly:false}],behaviors:[{event:'click',actions}]});
const literal=(value:number)=>({kind:'literal' as const,value}),transition={show:5,hide:4,showDuration:120,hideDuration:120,bringToFront:true};
page.widgets=[box,panel,pin,stateLog,button('Move',20,[{kind:'move',target:'box',motion:{x:literal(35),y:literal(20),relative:true,duration:120,easing:2}}]),button('Resize',115,[{kind:'resize',target:'box',motion:{width:literal(140),height:literal(80),anchor:'center'}}]),button('Rotate',210,[{kind:'rotate',target:'box',motion:{angle:literal(90)}}]),button('Toggle',305,[{kind:'toggle',target:'box',transition}]),button('Next',400,[{kind:'state',target:'panel',value:'next',loop:false,transition}]),button('Race',495,[{kind:'hide',target:'box',transition},{kind:'wait',value:30},{kind:'show',target:'box',transition}])];page.width=900;page.height=2000;page.behaviors=[];
const out=resolve('output/motion-check');await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-motion-fixture.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const errors:string[]=[],results:unknown[]=[];
try{const tab=await browser.newPage({viewport:{width:900,height:600}});tab.on('pageerror',e=>errors.push(e.message));
 for(const renderer of ['','react']){
  await tab.goto(pathToFileURL(join(out,renderer,page.file)).href,{waitUntil:'networkidle'});
  const click=async(name:string)=>{await tab.getByRole('button',{name,exact:true}).click();};
  await click('Move');await tab.waitForTimeout(160);assert.deepEqual(await tab.locator('#box').boundingBox(),{x:65,y:170,width:100,height:60});
  await click('Resize');assert.deepEqual(await tab.locator('#box').boundingBox(),{x:45,y:160,width:140,height:80});
  await click('Rotate');assert.deepEqual(await tab.locator('#box').boundingBox(),{x:75,y:130,width:80,height:140});
  await click('Toggle');await tab.waitForTimeout(160);assert.equal(await tab.locator('#box').isVisible(),false);
  await click('Toggle');await tab.waitForTimeout(160);assert.equal(await tab.locator('#box').isVisible(),true);assert.ok(Number(await tab.locator('#box').evaluate(e=>getComputedStyle(e).zIndex))>1001);
  await click('Race');await tab.waitForTimeout(200);assert.equal(await tab.locator('#box').isVisible(),true,'cancelled hide must not hide the subsequent show');
  await click('Next');assert.equal(await tab.locator('#state-log').textContent(),'waiting');await tab.waitForTimeout(160);assert.equal(await tab.locator('#state-log').textContent(),'changed');assert.equal((await tab.locator('#panel').boundingBox())?.height,90);assert.equal(await tab.locator('#second-child').isVisible(),true);assert.equal(await tab.locator('#first-child').isVisible(),false);
  await click('Next');await tab.waitForTimeout(160);assert.equal(await tab.locator('#second-child').isVisible(),true,'non-looping next stops at final state');
  await tab.evaluate(()=>scrollTo(0,500));assert.deepEqual(await tab.locator('#pin').boundingBox(),{x:788,y:8,width:100,height:60});
  await tab.setViewportSize({width:1000,height:600});assert.equal((await tab.locator('#pin').boundingBox())?.x,888);await tab.setViewportSize({width:900,height:600});
  results.push({renderer:renderer||'html',motion:true,visibility:true,cancelledHide:true,panelTransition:true,pinScrollResize:true});
 }
 assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log(results);
}finally{await browser.close();}
