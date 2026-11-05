import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {emitProject} from '../src/emit.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import type {Widget,FormControl} from '../src/model.ts';

const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8'));
const page=project.pages[0],base=page.widgets[0];project.pages=[page];project.variables=[{name:'destination',defaultValue:'https://navigation.test/opened'}];
const make=(id:string,x:number,y:number,content:Widget['content']):Widget=>({...structuredClone(base),id,name:id,x,y,width:180,height:36,kind:'control',type:'TextBox',css:{background:'white','font-size':'14px'},content,behaviors:[],variants:undefined});
const control:FormControl={kind:'control',control:'text',label:'Password',value:'',placeholder:'Enter secret',inputType:'password',hideHintOnFocus:true,maxLength:4,disabled:false,readOnly:false};
const password=make('password',30,30,[control]);
const frame=make('embedded',30,180,[{kind:'frame',src:'about:blank',name:'embedded',title:'Embedded preview',border:true,scrolling:'auto'}]);frame.kind='frame';frame.type='InlineFrame';frame.height=100;
const button=(id:string,y:number)=>make(id,30,y,[{kind:'control',control:'button',label:id,value:id,placeholder:'',disabled:false,readOnly:false}]);
const open=button('Open new window',80);open.behaviors=[{event:'click',actions:[{kind:'link',navigation:'new',expression:{kind:'variable',name:'destination'}}]}];
const load=button('Load frame',130);load.behaviors=[{event:'click',actions:[{kind:'link',navigation:'frame',target:'embedded',value:'frame-target.html'}]}];
Object.assign(page,{widgets:[password,open,load,frame],width:400,height:320,behaviors:[]});
const out=resolve('output/navigation-check');await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-navigation-fixture.json');
for(const renderer of ['','react'])writeFileSync(join(out,renderer,'frame-target.html'),'<!doctype html><title>Frame target</title><p id="result">Frame navigation works</p>');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors:string[]=[],results:unknown[]=[];
try{
 const context=await browser.newContext();await context.route('https://navigation.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Opened</title><p>Opened</p>'}));
 const tab=await context.newPage();tab.on('pageerror',e=>errors.push(e.message));
 for(const renderer of ['','react']){
  await tab.goto(pathToFileURL(join(out,renderer,page.file)).href,{waitUntil:'networkidle'});
  const field=tab.locator('#password input');assert.equal(await field.getAttribute('type'),'password');
  await field.focus();assert.equal(await field.evaluate(el=>getComputedStyle(el,'::placeholder').color),'rgba(0, 0, 0, 0)');
  await field.pressSequentially('123456');assert.equal(await field.inputValue(),'1234');
  const popupPromise=context.waitForEvent('page');await tab.getByRole('button',{name:'Open new window',exact:true}).click();const popup=await popupPromise;await popup.waitForURL('https://navigation.test/opened');await popup.close();
  await tab.getByRole('button',{name:'Load frame',exact:true}).click();await tab.frameLocator('#embedded iframe').locator('#result').waitFor();assert.equal(await tab.frameLocator('#embedded iframe').locator('#result').textContent(),'Frame navigation works');
  results.push({renderer:renderer||'html',password:true,maxLength:true,hideHintOnFocus:true,expressionNewWindow:true,namedFrameNavigation:true});
 }
 assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log(results);
}finally{await browser.close();}
