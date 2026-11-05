import{chromium}from'playwright-core';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';import assert from'node:assert/strict';
const root=resolve('output/campus'),project=JSON.parse(readFileSync(join(root,'project.json'),'utf8'));
const pageModel=project.pages[4],rep=pageModel.widgets.find(w=>w.repeater),data=rep.repeater;
const titleBinding=data.bindings.find(b=>b.property==='text'&&b.expression.columnId===263),imageBinding=data.bindings.find(b=>b.property==='image');
const actions=pageModel.widgets.flatMap(w=>w.behaviors.flatMap(b=>b.actions.map(a=>({id:w.id,...a}))));
const sortUp=actions.find(a=>a.kind==='repeater-sort'&&a.sort.ascending),sortDown=actions.find(a=>a.kind==='repeater-sort'&&!a.sort.ascending),next=actions.find(a=>a.kind==='repeater-page'&&a.value==='next'),previous=actions.find(a=>a.kind==='repeater-page'&&a.value==='previous');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu','--force-color-profile=srgb']});
const result=[];
try{
 const page=await browser.newPage({viewport:{width:900,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const variant of ['','react/']){
  await page.goto(pathToFileURL(join(root,variant,'page-5.html')).href);await page.locator('.rp-page').waitFor();
  const titles=()=>page.locator(`[id="${rep.id}"] [id$="-w-${titleBinding.targetGuid}"]`).allTextContents();
  const check=async(expected)=>{
    await page.waitForFunction(({id,guid,expected})=>JSON.stringify([...document.querySelectorAll(`[id="${id}"] [id$="-w-${guid}"]`)].map(e=>e.textContent))===JSON.stringify(expected),{id:rep.id,guid:titleBinding.targetGuid,expected});
    assert.deepEqual(await titles(),expected);
    const images=await page.locator(`[id="${rep.id}"] [id$="-w-${imageBinding.targetGuid}"] img`).evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')));
    const expectedImages=expected.map(name=>data.rows.find(r=>r.cells['263'].value===name).cells['252'].asset);assert.deepEqual(images,expectedImages);
    const ids=await page.locator('[id]').evaluateAll(els=>els.map(e=>e.id));assert.equal(ids.length,new Set(ids).size);
  };
  await check(['芦笋','三文鱼','蛋糕']);
  const click=async(a)=>page.locator('[id="'+a.id+'"]').click();
  await page.locator('[id="'+rep.id+'"] input').first().fill('7');
  await click(sortDown);await check(['三文鱼','芦笋','土豆']);
  assert.deepEqual(await page.locator('[id="'+rep.id+'"] input').evaluateAll(inputs=>inputs.map(i=>i.value)),['1','1','1']);
  await click(sortUp);await check(['意面','蛋糕','沙拉']);
  await click(next);await check(['土豆','芦笋','三文鱼']);
  await click(next);await check(['土豆','芦笋','三文鱼']);
  await click(sortDown);await check(['沙拉','蛋糕','意面']);
  await click(previous);await check(['三文鱼','芦笋','土豆']);
  await click(previous);await check(['三文鱼','芦笋','土豆']);
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  const directory=join(root,variant,'screenshots');mkdirSync(directory,{recursive:true});await page.locator('.rp-page').screenshot({path:join(directory,'repeater-sorted.png')});
  result.push({variant:variant||'html',passed:true,checks:8,scope:'Real pointer clicks; row text, matching image assets, order, pagination limits, sort while on second page, native refresh resets input state, unique IDs'});
 }
 assert.deepEqual(errors,[]);writeFileSync(join(root,'repeater-browser-validation.json'),JSON.stringify({results:result,errors},null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
