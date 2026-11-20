import {canvasSelectionKeysCase} from './fixtures/canvas-selection-keys.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasSelectionCase} from './fixtures/canvas-selection.ts';
import {selectAllCanvasObjects,arrangeSelection,translateSelection,selectionRoots,type CanvasArrange} from '../src/canvas-selection.ts';
import {canvasIndex,editCanvas,saveCanvasState,restoreCanvasState} from '../src/flow-canvas-model.ts';
const empty={moves:[],texts:[]},ids=['arrange-0','arrange-1','arrange-2'];
test('all alignments use page bounds and leave input and unrelated objects unchanged',()=>{
 const page=canvasSelectionCase(),before=structuredClone(page);
 const expected:Record<string,number[]>={left:[-80,-80,-80],center:[80,70,60],right:[240,220,200],top:[20,20,20],middle:[90,85,80],bottom:[160,150,140]};
 for(const mode of Object.keys(expected)){
  const index=canvasIndex(editCanvas(page,arrangeSelection(page,empty,ids,mode as CanvasArrange))),axis=['left','center','right'].includes(mode)?'x':'y';
  assert.deepEqual(ids.map(id=>index.get(id)!.absolute[axis]),expected[mode]);
  assert.deepEqual(index.get('entry')!.widget,canvasIndex(page).get('entry')!.widget);
 }
 assert.deepEqual(page,before);
});
test('distribution creates equal gaps for unequal sizes and keeps outer bounds',()=>{
 const page=canvasSelectionCase();
 for(const mode of ['horizontal','vertical'] as const){
  const index=canvasIndex(editCanvas(page,arrangeSelection(page,empty,ids,mode))),axis=mode==='horizontal'?'x':'y',size=axis==='x'?'width':'height',entries=ids.map(id=>index.get(id)!);
  const gaps=entries.slice(1).map((e,i)=>e.absolute[axis]-entries[i].absolute[axis]-entries[i].widget[size]);
  assert.equal(gaps[0],gaps[1]);assert.equal(entries[0].absolute[axis],axis==='x'?-80:20);
  assert.equal(entries[2].absolute[axis]+entries[2].widget[size],axis==='x'?280:190);
 }
});
test('nested selection deduplicates parents and converts page alignment to parent coordinates',()=>{
 const page=canvasSelectionCase(),before=canvasIndex(page);
 assert.deepEqual(selectionRoots(['group','start','group'],before),['group']);
 const state=translateSelection(page,empty,['group','start','entry'],10,-20),after=canvasIndex(editCanvas(page,state));
 assert.equal(after.get('start')!.absolute.x,before.get('start')!.absolute.x+10);
 assert.deepEqual(after.get('start')!.widget,before.get('start')!.widget);
 const aligned=canvasIndex(editCanvas(page,arrangeSelection(page,empty,['nested-arrange','arrange-0'],'left')));
 assert.equal(aligned.get('nested-arrange')!.absolute.x,-80);
 assert.equal(aligned.get('nested-arrange')!.widget.x,-80-before.get('nested-arrange')!.origin.x);
 assert.deepEqual(after.get('free-end')!.widget.connection!.geometry!.end,before.get('free-end')!.widget.connection!.geometry!.end);
 const saved=saveCanvasState(page,'source',state);assert.deepEqual(restoreCanvasState(JSON.stringify(saved),page,'source'),state);
});
test('invalid or partly read-only selections fail atomically',()=>{
 const page=canvasSelectionCase(),before=structuredClone(page);
 for(const selected of [[],['missing'],['entry','cell-0']])assert.throws(()=>translateSelection(page,empty,selected,5,5));
 assert.throws(()=>translateSelection(page,empty,ids,Infinity,0));
 assert.throws(()=>arrangeSelection(page,empty,ids.slice(0,2),'horizontal'));
 assert.throws(()=>arrangeSelection(page,empty,['rotated','entry'],'left'));
 assert.deepEqual(page,before);
});
test('alignment reconnects edges across containers and retains prior text and size edits',()=>{
 const page=canvasSelectionCase();
 const state={moves:[],texts:[{id:'isolated',content:0,paragraph:0,run:0,text:'kept'}],sizes:[{id:'entry',width:280,height:88}]};
 const initial=canvasIndex(editCanvas(page,state));
 const aligned=arrangeSelection(page,state,['entry','start'],'left'),after=canvasIndex(editCanvas(page,aligned));
 const delta=after.get('entry')!.absolute.x-initial.get('entry')!.absolute.x;
 const oldEdge=initial.get('entry-check')!.widget.connection!,newEdge=after.get('entry-check')!.widget.connection!;
 assert.deepEqual(newEdge.start,oldEdge.start);assert.deepEqual(newEdge.end,oldEdge.end);
 assert.equal(newEdge.geometry!.start.x,oldEdge.geometry!.start.x+delta);
 assert.deepEqual(newEdge.geometry!.end,oldEdge.geometry!.end);
 assert.deepEqual(aligned.texts,state.texts);assert.deepEqual(aligned.sizes,state.sizes);
 const saved=saveCanvasState(page,'source',aligned);
 assert.deepEqual(saveCanvasState(page,'source',restoreCanvasState(JSON.stringify(saved),page,'source')),saved);
});

test('select-all treats containers as units, omits hidden roots and preserves locked selection',()=>{
 const page=canvasSelectionKeysCase(),before=structuredClone(page);
 const state={...empty,layers:{hidden:['layer-blue'],locked:['entry']}};
 const ids=selectAllCanvasObjects(editCanvas(page,state));
 assert.ok(ids.includes('entry'));assert.ok(ids.includes('layer-red'));
 assert.ok(!ids.includes('group'));assert.ok(!ids.includes('start'));assert.ok(!ids.includes('layer-blue'));
 assert.ok(ids.includes('free-end'));
 assert.deepEqual(ids,selectionRoots(ids,canvasIndex(page)));
 assert.throws(()=>translateSelection(page,state,ids,1,0),/Unlock/);
 assert.deepEqual(selectAllCanvasObjects({...page,widgets:[]}),[]);
 assert.deepEqual(page,before);
});
