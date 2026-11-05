import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {parseSemanticProject} from '../src/semantic.ts';
import {emitProject} from '../src/emit.ts';
import {flattenWidgets,materializePage} from '../src/repeater-model.ts';
import type {Widget,Action,WidgetContent} from '../src/model.ts';
const source=resolve('output/campus'),out=resolve('output/selection-check');
const original=parseSemanticProject(readFileSync(join(source,'project.json'),'utf8'));
const realPage=original.pages.find(p=>flattenWidgets(materializePage(p).widgets).some(w=>w.instance&&w.variants?.selected))!;
const materialized=flattenWidgets(materializePage(realPage).widgets);
const sourceImage=materialized.find(w=>w.source.objectId===207&&w.instance?.rowId==='0')!;
const normal=sourceImage.content.find(c=>c.kind==='image')!.asset;
const selected=sourceImage.variants!.selected!.content!.find(c=>c.kind==='image')!.asset;
const cloneImage=(id:string,x:number):Widget=>{
  const w=structuredClone(sourceImage);delete w.instance;
  return {...w,id,x,y:20,selected:true,behaviors:[{event:'click',actions:[{kind:'set-selected',target:id,expression:{kind:'literal',value:'toggle'}}]}]};
};
const choice=cloneImage('choice',20),retain=cloneImage('retain',80);
choice.variants!.disabled={css:{...choice.css,opacity:'0.35'}};
const textContent=(value:string):WidgetContent[]=>[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:value,css:{color:'#111111'}}]}]}];
const rich:Widget={...cloneImage('rich',150),kind:'shape',type:'VectorShape',width:130,height:35,selected:false,content:textContent('initial'),behaviors:[]};
const red=structuredClone(rich.content);if(red[0].kind==='text')red[0].paragraphs[0].runs[0].css.color='#ff0000';
rich.variants={selected:{css:{...rich.css,color:'#ff0000'},content:red},disabled:{css:{...rich.css,opacity:'0.4'}}};
const status:Widget={...rich,id:'status',x:320,selected:false,variants:undefined,content:textContent('no event')};
const checkbox:Widget={...rich,id:'checkbox',kind:'control',type:'Checkbox',x:20,y:90,selected:true,width:120,
  content:[{kind:'control',control:'checkbox',label:'Check',value:'Check',placeholder:'',disabled:false,readOnly:false,checked:false}],
  variants:{selected:{css:{...rich.css,background:'#ff0000'}},disabled:{css:{...rich.css,background:'#999999'}}},
  behaviors:[{event:'select',actions:[{kind:'set-text',target:'status',expression:{kind:'literal',value:'selected'}}]},{event:'unselect',actions:[{kind:'set-text',target:'status',expression:{kind:'literal',value:'unselected'}}]}],
};
const select=(target:string,value:boolean):Action=>({kind:'set-selected',target,expression:{kind:'literal',value}});
const enable=(target:string,value:boolean):Action=>({kind:'enable',target,value});
const controls:[string,Action[]][]=[
  ['disable',['choice','retain','rich','checkbox'].map(id=>enable(id,false))],
  ['enable',['choice','retain','rich','checkbox'].map(id=>enable(id,true))],
  ['clear',['choice','retain','checkbox'].map(id=>select(id,false))],
  ['select',['choice','retain','checkbox'].map(id=>select(id,true))],
  ['edit',[{kind:'set-text',target:'rich',expression:{kind:'literal',value:'edited'}},select('rich',true)]],
];
const buttons=controls.map(([id,actions],i):Widget=>({...rich,id,x:20+i*125,y:160,width:110,height:35,selected:false,variants:undefined,content:textContent(id),css:{background:'#cde'},behaviors:[{event:'click',actions}]}));
const repeater=structuredClone(realPage.widgets.find(w=>w.repeater)!);
const rowImage=structuredClone(flattenWidgets(repeater.repeater!.template).find(w=>w.source.objectId===207)!);
Object.assign(rowImage,{x:0,y:0});rowImage.behaviors=[{event:'click',actions:[{kind:'set-selected',target:rowImage.id,expression:{kind:'literal',value:'toggle'}}]}];
Object.assign(repeater,{id:'selection-repeater',x:20,y:230,width:50,height:50});
repeater.repeater!.template=[rowImage];repeater.repeater!.bindings=[];repeater.repeater!.rows=repeater.repeater!.rows.slice(0,2);
repeater.repeater!.layout={...repeater.repeater!.layout,pageSize:1,startPage:1,paddingLeft:0,paddingTop:0};
const paging=['next','previous'].map((value,i):Widget=>({...buttons[0],id:value,x:100+i*125,y:230,content:textContent(value),behaviors:[{event:'click',actions:[{kind:'repeater-page',target:repeater.id,value}]}]}));
const project=structuredClone(original);project.pages=[{id:'selection',name:'Selection fixture',file:'selection.html',width:700,height:340,background:'#fff',widgets:[choice,retain,rich,status,checkbox,...buttons,repeater,...paging],behaviors:[]}];
const assets=new Map(readdirSync(join(source,'assets')).map(name=>['assets/'+name,readFileSync(join(source,'assets',name))]));
await emitProject(parseSemanticProject(JSON.stringify(project)),assets,out,'semantic-selection-fixture.json');
const regenerated=join(out,'regenerated');
execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','src/generate.ts',join(out,'project.json'),regenerated],{cwd:resolve('.'),stdio:'pipe'});
assert.ok(readFileSync(join(regenerated,selected)).equals(assets.get(selected)!),'variant-only asset must survive semantic regeneration');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results:unknown[]=[],errors:string[]=[];
try{
  const page=await browser.newPage({viewport:{width:1000,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const selector=(id:string)=>'[id="'+id+'"]';
  for(const renderer of ['','react']){
    await page.goto(pathToFileURL(join(source,renderer,realPage.file)).href);
    const image=page.locator(selector(sourceImage.id)+' img');await image.waitFor();
    assert.equal(await image.getAttribute('src'),normal);
    await image.evaluate(el=>{(window as any).savedImage=el;});
    await image.click();assert.equal(await image.getAttribute('src'),selected);
    await image.evaluate(async el=>{await(el as HTMLImageElement).decode();});
    await image.screenshot({path:join(out,(renderer||'html')+'-selected.png')});
    const other=materialized.find(w=>w.source.objectId===207&&w.instance?.rowId==='1')!;
    assert.equal(await page.locator(selector(other.id)+' img').getAttribute('src'),normal);
    await image.click();assert.equal(await image.getAttribute('src'),normal);
    assert.ok(await image.evaluate(el=>el===(window as any).savedImage));
    const staticPage=original.pages.find(p=>flattenWidgets(p.widgets).some(w=>w.variants?.selected))!;
    const staticImage=flattenWidgets(staticPage.widgets).find(w=>w.variants?.selected)!;
    await page.goto(pathToFileURL(join(source,renderer,staticPage.file)).href);
    const staticNode=page.locator(selector(staticImage.id)+' img');await staticNode.click();
    assert.equal(await staticNode.getAttribute('src'),selected);await staticNode.click();assert.equal(await staticNode.getAttribute('src'),normal);
    results.push({renderer:renderer||'html',originalCampus:'Actual pointer toggles both source selected images, independent repeater rows, image DOM identity',passed:true});
    await page.goto(pathToFileURL(join(regenerated,renderer,'selection.html')).href);
    const main=page.locator('#choice img'),retained=page.locator('#retain img'),check=page.locator('#checkbox input'),label=page.locator('#status .rp-text');
    await main.waitFor();assert.equal(await main.getAttribute('src'),selected);assert.equal(await check.isChecked(),true,'Widget.selected overrides legacy checked');
    await page.locator('#edit').click();assert.equal(await page.locator('#rich .rp-text').textContent(),'edited');
    assert.equal(await page.locator('#rich .rp-text span').evaluate(el=>getComputedStyle(el).color),'rgb(255, 0, 0)');
    await page.locator('#disable').click();assert.equal(await main.getAttribute('src'),normal);assert.equal(await retained.getAttribute('src'),selected);
    assert.equal(await page.locator('#choice').evaluate(el=>getComputedStyle(el).opacity),'0.35');
    assert.equal(await page.locator('#rich .rp-text').textContent(),'edited');
    assert.equal(await page.locator('#rich .rp-text span').evaluate(el=>getComputedStyle(el).color),'rgb(17, 17, 17)');
    await page.locator('#clear').click();assert.equal(await page.locator('#choice').getAttribute('aria-selected'),'true','disabled image ignores selection assignment');
    assert.equal(await check.isChecked(),false,'disabled checkbox accepts checked property assignment');assert.equal(await label.textContent(),'no event');
    await page.locator('#enable').click();assert.equal(await main.getAttribute('src'),selected);assert.equal(await retained.getAttribute('src'),selected);
    assert.equal(await page.locator('#rich .rp-text').textContent(),'edited');
    assert.equal(await page.locator('#rich .rp-text span').evaluate(el=>getComputedStyle(el).color),'rgb(255, 0, 0)');
    assert.equal(await page.locator('#checkbox').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 0, 0)','native checkbox style cache survives disabled property writes');
    assert.equal(await check.isChecked(),false);
    await page.locator('#select').click();assert.equal(await check.isChecked(),true);assert.equal(await label.textContent(),'no event','unchanged style selection must not emit another select event');
    await page.locator('#clear').click();assert.equal(await main.getAttribute('src'),normal);assert.equal(await label.textContent(),'unselected');
    await check.check();assert.equal(await label.textContent(),'selected');await check.uncheck();assert.equal(await label.textContent(),'unselected');
    const row0=page.locator('[id="selection-repeater-row0-'+rowImage.id+'"] img');
    await row0.click();assert.equal(await row0.getAttribute('src'),selected);
    await page.locator('#next').click();assert.equal(await page.locator('[id="selection-repeater-row1-'+rowImage.id+'"] img').getAttribute('src'),normal);
    await page.locator('#previous').click();assert.equal(await row0.getAttribute('src'),normal,'native repeater refresh resets selection to template');
    const broken=await page.locator('img').evaluateAll(nodes=>nodes.filter(node=>!(node as HTMLImageElement).naturalWidth).length);assert.equal(broken,0);
    results.push({renderer:renderer||'html',semanticFixture:'variant-only asset regeneration, initial selection, disabled priority and retention, disabled write policy, selected/checked style cache, retained edited rich text, repeater selection reset',passed:true});
  }
  assert.deepEqual(errors,[]);
  writeFileSync(join(out,'validation.json'),JSON.stringify({passed:true,nativeVisualParity:false,results,errors},null,2));console.log(results);
}finally{await browser.close();}
