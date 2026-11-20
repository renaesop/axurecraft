import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasLayersCase} from './fixtures/canvas-layers.ts';
import {reorderLayers,setLayerFlag} from '../src/canvas-layer-actions.ts';
import {canvasIndex,editCanvas,saveCanvasState,restoreCanvasState,resizeCanvasState} from '../src/flow-canvas-model.ts';
import {translateSelection,arrangeSelection} from '../src/canvas-selection.ts';
import {createCanvasObject,deleteCanvasObjects,duplicateCanvasObjects} from '../src/canvas-objects.ts';
const empty={moves:[],texts:[]};
const order=(page:ReturnType<typeof canvasLayersCase>)=>page.widgets.map(w=>w.id).filter(id=>id.startsWith('layer-'));
test('sibling layer operations preserve relative selection order, coordinates and source',()=>{
 const page=canvasLayersCase(),before=structuredClone(page);
 for(const [command,expected] of [
  ['front',['layer-blue','layer-green','layer-red']],['back',['layer-red','layer-blue','layer-green']],
  ['forward',['layer-blue','layer-red','layer-green']],['backward',['layer-red','layer-blue','layer-green']]
 ] as const){
  const result=editCanvas(page,reorderLayers(page,empty,['layer-red'],command));assert.deepEqual(order(result),expected);
  assert.deepEqual(canvasIndex(result).get('layer-red')!.widget,canvasIndex(page).get('layer-red')!.widget);
 }
 const both=editCanvas(page,reorderLayers(page,empty,['layer-blue','layer-red'],'front'));
 assert.deepEqual(order(both),['layer-green','layer-red','layer-blue']);
 const nested=editCanvas(page,reorderLayers(page,empty,['start'],'front'));
 assert.deepEqual(nested.widgets.map(w=>w.id),page.widgets.map(w=>w.id));
 assert.equal(canvasIndex(nested).get('group')!.widget.children!.at(-1)!.id,'start');
 assert.deepEqual(page,before);
});
test('editor hiding and locks roundtrip without erasing existing geometry or native hiding',()=>{
 const page=canvasLayersCase(),moved={moves:[{id:'entry',x:330,y:50}],texts:[]};
 let state=setLayerFlag(page,moved,['group'],'hidden',true);state=setLayerFlag(page,state,['entry'],'locked',true);
 const saved=saveCanvasState(page,'s',state),restored=restoreCanvasState(JSON.stringify(saved),page,'s');
 assert.deepEqual(restored,state);assert.deepEqual(editCanvas(page,restored),editCanvas(page,state));
 assert.equal(canvasIndex(editCanvas(page,state)).get('group')!.widget.css.display,'none');
 state=setLayerFlag(page,state,['group'],'hidden',false);
 assert.deepEqual(canvasIndex(editCanvas(page,state)).get('group')!.widget.css,canvasIndex(page).get('group')!.widget.css);
 assert.equal(canvasIndex(editCanvas(page,state)).get('hidden-group')!.widget.css.display,'none');
});
test('locks block direct and ancestor mutations, including delete cascades, until unlocked',()=>{
 const page=canvasLayersCase(),state=setLayerFlag(page,empty,['start'],'locked',true),group=canvasIndex(page).get('group')!.widget;
 for(const action of [
  ()=>translateSelection(page,state,['group'],1,1),
  ()=>resizeCanvasState(page,state,{id:'group',width:group.width*2,height:group.height*2}),
  ()=>arrangeSelection(page,state,['start','entry'],'left'),
  ()=>deleteCanvasObjects(page,state,['group']),
  ()=>duplicateCanvasObjects(page,state,['group'],()=> 'copy'),
  ()=>reorderLayers(page,state,['group'],'front')
 ])assert.throws(action,/Unlock/);
 const unlocked=setLayerFlag(page,state,['start'],'locked',false);
 assert.doesNotThrow(()=>translateSelection(page,unlocked,['group'],1,1));
 const lockedEdge=setLayerFlag(page,empty,['entry-check'],'locked',true);
 assert.throws(()=>deleteCanvasObjects(page,lockedEdge,['entry']),/Unlock/);
});
test('layer permutations reconcile after object operations and reject malformed files',()=>{
 const page=canvasLayersCase();let state=reorderLayers(page,empty,['layer-red'],'front');
 state=createCanvasObject(page,state,'new-box','rectangle');
 assert.equal(editCanvas(page,state).widgets.at(-1)!.id,'new-box');
 state=deleteCanvasObjects(page,state,['layer-blue']);
 assert.equal(canvasIndex(editCanvas(page,state)).has('layer-blue'),false);
 const saved=saveCanvasState(page,'s',state);
 assert.deepEqual(saveCanvasState(page,'s',restoreCanvasState(JSON.stringify(saved),page,'s')),saved);
 for(const layers of [null,{locked:['missing']},{hidden:['entry','entry']},{order:[{ids:['entry']}]},{order:[{parent:'table',ids:[]}]}]){
  assert.throws(()=>restoreCanvasState(JSON.stringify({...saved,layers}),page,'s'));
 }
 const legacy={...saved,schema:'axurecraft-canvas@4'};delete (legacy as {layers?:unknown}).layers;
 assert.equal(restoreCanvasState(JSON.stringify(legacy),page,'s').layers,undefined);
});

test('copying editor-hidden objects preserves an independently reversible visibility flag',()=>{
 const page=canvasLayersCase(),state=setLayerFlag(page,empty,['isolated'],'hidden',true);let n=0;
 const copy=duplicateCanvasObjects(page,state,['isolated'],()=> 'hidden-copy-'+n++);
 assert.equal(canvasIndex(editCanvas(page,copy.state)).get(copy.ids[0])!.widget.css.display,'none');
 const shown=setLayerFlag(page,copy.state,copy.ids,'hidden',false),index=canvasIndex(editCanvas(page,shown));
 assert.notEqual(index.get(copy.ids[0])!.widget.css.display,'none');
 assert.equal(index.get('isolated')!.widget.css.display,'none');
});
