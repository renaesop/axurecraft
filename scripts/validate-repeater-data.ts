import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';import {emitProject} from '../src/emit.ts';import {parseSemanticProject} from '../src/semantic.ts';import type {Action,Widget,RepeaterAction} from '../src/model.ts';
const project=parseSemanticProject(readFileSync('examples/hello.project.json','utf8')),page=project.pages[0],base=page.widgets[0];project.pages=[page];
const make=(id:string,x:number,y:number):Widget=>({...structuredClone(base),id,name:id,x,y,width:100,height:30,kind:'shape',type:'VectorShape',css:{background:'white'},content:[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:id,css:{}}]}]}],behaviors:[],variants:undefined,source:{...base.source,guid:id}});
const dataAction=(r:RepeaterAction):Action=>({kind:'repeater-data',target:'list',repeaterAction:r});
const label=make('name',0,0),mark=make('mark',110,0),field=make('field',220,0);field.kind='control';field.type='TextBox';field.content=[{kind:'control',control:'text',label:'row input',value:'',placeholder:'',disabled:false,readOnly:false}];
mark.behaviors=[{event:'click',actions:[dataAction({operation:'mark',selection:'this',mark:true})]}];
const list=make('list',20,150);list.kind='repeater';list.type='Repeater';list.content=[];list.width=400;list.height=200;
list.repeater={itemLoad:[{event:'itemload',actions:[{kind:'branch',branches:[{condition:{kind:'binary',operator:'==',left:{kind:'row-index'},right:{kind:'literal',value:2}},actions:[{kind:'set-text',target:'field',expression:{kind:'concat',parts:[{kind:'column',columnId:1},{kind:'literal',value:'/'},{kind:'row-index'}]}}]}]}]}],columns:[{id:1,name:'Name'}],rows:['Ada','Bob','Cid'].map((value,i)=>({id:String(i),cells:{'1':{kind:'text',value}}})),bindings:[{targetGuid:'name',property:'text',expression:{kind:'column',columnId:1}}],template:[label,mark,field],isolateRadioGroups:true,templateSource:list.source,layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:10,pageSize:0,startPage:1,wrap:0,paddingLeft:0,paddingTop:0}};
const button=(id:string,x:number,actions:Action[])=>({...make(id,x,30),kind:'control' as const,type:'Button',content:[{kind:'control' as const,control:'button' as const,label:id,value:id,placeholder:'',disabled:false,readOnly:false}],behaviors:[{event:'click',actions}]});
page.widgets=[list,button('Broadcast',540,[{kind:'set-text',target:'field',expression:{kind:'literal',value:'All rows'}}]),button('Filter',10,[dataAction({operation:'filter',label:'hideBob',condition:{kind:'binary',operator:'!=',left:{kind:'column',columnId:1},right:{kind:'literal',value:'Bob'}}})]),button('Clear',115,[dataAction({operation:'remove-filter',clear:true})]),button('Update',220,[dataAction({operation:'update',selection:'marked',values:{'1':{kind:'text',value:'Changed'}}})]),button('Delete',325,[dataAction({operation:'delete',selection:'marked'})]),button('Add',430,[dataAction({operation:'add',rows:[{'1':{kind:'text',value:'New'}}]})])];page.width=700;page.height=500;page.behaviors=[];
const out=resolve('output/repeater-data-check');await emitProject(parseSemanticProject(JSON.stringify(project)),new Map(),out,'original-repeater-mutations.json');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),results:unknown[]=[],errors:string[]=[];
try{const tab=await browser.newPage();tab.on('pageerror',e=>errors.push(e.message));
for(const renderer of ['','react']){
 await tab.goto(pathToFileURL(join(out,renderer,page.file)).href,{waitUntil:'networkidle'});
 const names=()=>tab.locator('#list > [data-name="name"]').allTextContents();const click=(name:string)=>tab.getByRole('button',{name,exact:true}).click();
 assert.deepEqual(await names(),['Ada','Bob','Cid']);assert.equal(await tab.locator('#list-row1-field input').inputValue(),'Bob/2');
 await tab.locator('#list-row0-field input').fill('Keep me');await tab.locator('#list-row0-mark').click();assert.equal(await tab.locator('#list-row0-field input').inputValue(),'Keep me');
 await click('Update');assert.deepEqual(await names(),['Changed','Bob','Cid']);
 await click('Filter');assert.deepEqual(await names(),['Changed','Cid']);await tab.waitForFunction(()=>document.querySelector<HTMLInputElement>('#list-row2-field input')?.value==='Cid/2');assert.equal(await tab.locator('#list-row2-field input').inputValue(),'Cid/2');
 await click('Delete');assert.deepEqual(await names(),['Cid']);
 await click('Clear');assert.deepEqual(await names(),['Bob','Cid']);
 await click('Add');assert.deepEqual(await names(),['Bob','Cid','New']);await click('Broadcast');await tab.waitForFunction(()=>[...document.querySelectorAll<HTMLInputElement>('#list input')].every(e=>e.value==='All rows'));assert.deepEqual(await tab.locator('#list input').evaluateAll(es=>es.map(e=>(e as HTMLInputElement).value)),['All rows','All rows','All rows']);
 results.push({renderer:renderer||'html',markPreservesInput:true,update:true,filter:true,delete:true,clear:true,add:true});
}assert.deepEqual(errors,[]);writeFileSync(join(out,'validation.json'),JSON.stringify({results,errors},null,2));console.log(results);
}finally{await browser.close();}
