import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasObjectsCase} from './fixtures/canvas-objects.ts';
import {canvasIndex,editCanvas,saveCanvasState,restoreCanvasState} from '../src/flow-canvas-model.ts';
import {createCanvasObject,duplicateCanvasObjects,deleteCanvasObjects,type CanvasTool} from '../src/canvas-objects.ts';
const empty={moves:[],texts:[]};
test('palette creates editable static widgets with unique identities and roundtrips',()=>{
 const page=canvasObjectsCase(),before=structuredClone(page);
 for(const tool of ['text','rectangle','ellipse','decision','button'] as CanvasTool[]){
  const state=createCanvasObject(page,empty,'new-'+tool,tool),w=canvasIndex(editCanvas(page,state)).get('new-'+tool)!.widget;
  assert.equal(w.source.className,'CanvasCreated');assert.equal(w.x,80);
  const saved=saveCanvasState(page,'source',state);
  assert.deepEqual(restoreCanvasState(JSON.stringify(saved),page,'source'),state);
  assert.throws(()=>createCanvasObject(page,state,'new-'+tool,tool),/Duplicate/);
 }
 assert.deepEqual(page,before);
});
test('copy retains edited paint and source, not IDs, and does not replace literal text',()=>{
 const page=canvasObjectsCase();let counter=0;
 const state={moves:[{id:'isolated',x:900,y:100}],texts:[],sizes:[{id:'isolated',width:300,height:60}]};
 const copy=duplicateCanvasObjects(page,state,['isolated'],()=> 'copy-'+counter++);
 const w=canvasIndex(editCanvas(page,copy.state)).get(copy.ids[0])!.widget,old=canvasIndex(page).get('isolated')!.widget;
 assert.deepEqual(w.source,old.source);assert.equal(w.width,300);assert.equal(w.x,920);
 const text=w.content.find(c=>c.kind==='text')!;assert.equal(text.paragraphs[0].runs[0].text,'isolated');
 assert.deepEqual(page,canvasObjectsCase());
});
test('group copy remaps child endpoints and SVG marker IDs and moves local geometry once',()=>{
 const page=canvasObjectsCase();let counter=0;
 const copy=duplicateCanvasObjects(page,empty,['group','start'],()=> 'copy-'+counter++);
 assert.equal(copy.ids.length,1);
 const all=canvasIndex(editCanvas(page,copy.state)),group=all.get(copy.ids[0])!.widget,old=canvasIndex(page).get('group')!.widget;
 assert.equal(group.x,old.x+20);assert.equal(group.y,old.y+20);
 const edge=group.children!.find(w=>w.connection)!,original=old.children!.find(w=>w.connection)!;
 assert.ok(edge.connection!.start.target!.startsWith('copy-'));
 assert.deepEqual(edge.connection!.geometry,original.connection!.geometry);
 const vector=edge.content.find(c=>c.kind==='vector')!;
 assert.ok(vector.markers.every(m=>m.id.startsWith('copy-')));
 assert.equal(new Set(all.keys()).size,all.size);
 const saved=saveCanvasState(page,'s',copy.state);assert.deepEqual(editCanvas(page,restoreCanvasState(JSON.stringify(saved),page,'s')),editCanvas(page,copy.state));
});
test('delete removes connected edges, prunes stale edits and restores exactly through snapshots',()=>{
 const page=canvasObjectsCase(),state={moves:[{id:'entry',x:330,y:50}],texts:[],sizes:[{id:'entry',width:200,height:90}]};
 const saved=saveCanvasState(page,'s',state),deleted=deleteCanvasObjects(page,state,['entry']),index=canvasIndex(editCanvas(page,deleted));
 assert.equal(index.has('entry'),false);assert.equal(index.has('entry-check'),false);assert.equal(index.has('free-end'),false);
 assert.deepEqual(deleted.moves,[]);assert.deepEqual(deleted.sizes,[]);
 assert.deepEqual(editCanvas(page,restoreCanvasState(JSON.stringify(saved),page,'s')),editCanvas(page,state));
 let created=createCanvasObject(page,empty,'fresh','rectangle');
 created=deleteCanvasObjects(page,created,['fresh']);
 assert.equal(canvasIndex(editCanvas(page,restoreCanvasState(JSON.stringify(saveCanvasState(page,'s',created)),page,'s'))).has('fresh'),false);
});
test('malformed structural documents and referenced or dynamic deletions fail atomically',()=>{
 const page=canvasObjectsCase();page.behaviors=[{event:'load',actions:[{kind:'show',target:'entry'}]}];
 assert.throws(()=>deleteCanvasObjects(page,empty,['entry']),/behavior reference/);
 const state=createCanvasObject(page,empty,'fresh','text'),saved=saveCanvasState(page,'s',state);
 for(const objects of [null,{added:[null],removed:[]},{added:[],removed:['unknown']},{added:state.objects!.added,removed:['fresh','fresh']}]){
  assert.throws(()=>restoreCanvasState(JSON.stringify({...saved,objects}),page,'s'));
 }
 assert.throws(()=>restoreCanvasState(JSON.stringify(saved),page,'other'),/conflict/);
 const dynamic=canvasIndex(page).get('entry')!.widget;dynamic.states=[];
 assert.throws(()=>duplicateCanvasObjects(page,empty,['entry'],()=> 'copy'),/Unsupported/);
 assert.throws(()=>deleteCanvasObjects(page,empty,['entry']),/Read-only/);
});
test('copy inside a previously moved/resized group keeps current local size and offset',()=>{
 const page=canvasObjectsCase(),group=canvasIndex(page).get('group')!.widget;
 const state={moves:[{id:'group',x:100,y:100}],texts:[],sizes:[{id:'group',width:group.width*2,height:group.height*2}]};
 const current=canvasIndex(editCanvas(page,state)),old=current.get('start')!.widget;
 let counter=0;const copy=duplicateCanvasObjects(page,state,['start'],()=> 'child-copy-'+counter++);
 const result=canvasIndex(editCanvas(page,copy.state)),w=result.get(copy.ids[0])!.widget;
 assert.equal(result.get(copy.ids[0])!.parent,'group');
 assert.equal(w.width,old.width);assert.equal(w.height,old.height);assert.equal(w.x,old.x+20);assert.equal(w.y,old.y+20);
});

test('copy remaps internal behavior references without rewriting authored literal values',()=>{
 const page=canvasObjectsCase(),index=canvasIndex(page),start=index.get('start')!.widget,process=index.get('process')!.widget;
 start.behaviors=[{event:'click',actions:[{kind:'show',target:process.id,popup:{mode:'flyout',source:start.id}},{kind:'set-text',target:start.id,expression:{kind:'literal',value:start.id}}]}];
 let n=0;const result=duplicateCanvasObjects(page,empty,['group'],()=> 'behavior-copy-'+n++);
 const group=canvasIndex(editCanvas(page,result.state)).get(result.ids[0])!.widget;
 const copiedStart=group.children!.find(w=>w.name===start.name)!,copiedProcess=group.children!.find(w=>w.name===process.name)!;
 assert.equal(copiedStart.behaviors[0].actions[0].target,copiedProcess.id);
 assert.equal(copiedStart.behaviors[0].actions[0].popup!.source,copiedStart.id);
 assert.deepEqual(copiedStart.behaviors[0].actions[1].expression,{kind:'literal',value:'start'});
});
