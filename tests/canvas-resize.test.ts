import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasResizeCase} from './fixtures/canvas-resize.ts';
import {canvasIndex,canvasResizable,editCanvas,resizeCanvasState,saveCanvasState,restoreCanvasState} from '../src/flow-canvas-model.ts';

test('resize preserves port IDs and recomputes attached ends without moving free ends',()=>{
 const page=canvasResizeCase(),before=structuredClone(page),index=canvasIndex(page);
 const result=canvasIndex(editCanvas(page,{moves:[],texts:[],sizes:[{id:'entry',width:280,height:88}]}));
 const old=index.get('entry-check')!.widget.connection!,c=result.get('entry-check')!.widget.connection!;
 assert.deepEqual(c.start,old.start);
 assert.deepEqual(c.geometry!.start,{x:440,y:108});
 assert.deepEqual(c.geometry!.end,old.geometry!.end);
 assert.deepEqual(result.get('free-end')!.widget.connection!.geometry!.end,index.get('free-end')!.widget.connection!.geometry!.end);
 assert.deepEqual(page,before);
 assert.deepEqual(result.get('isolated')!.widget,index.get('isolated')!.widget);
});
test('group resize scales local geometry and children while cross-group endpoint stays attached',()=>{
 const page=canvasResizeCase(),index=canvasIndex(page),group=index.get('group')!.widget;
 const result=canvasIndex(editCanvas(page,{moves:[],texts:[],sizes:[{id:'group',width:group.width*2,height:group.height*2}]}));
 const old=index.get('start-process')!.widget.connection!.geometry!,g=result.get('start-process')!.widget.connection!.geometry!;
 assert.deepEqual(g.start,{x:old.start.x*2,y:old.start.y*2});assert.deepEqual(g.points,old.points.map(p=>({x:p.x*2,y:p.y*2})));
 const cross=result.get('cross-group')!.widget.connection!.geometry!,original=index.get('cross-group')!.widget.connection!.geometry!;
 assert.deepEqual(cross.start,original.start);
 assert.deepEqual(cross.end,{x:group.x+(original.end.x-group.x)*2,y:group.y+(original.end.y-group.y)*2});
 const oldChild=index.get('start')!.widget,child=result.get('start')!.widget;
 assert.equal(child.width,oldChild.width*2);assert.equal(child.x,oldChild.x*2);
});
test('size transactions compose with earlier child moves/sizes and save/reopen without drift',()=>{
 const page=canvasResizeCase(),index=canvasIndex(page),group=index.get('group')!.widget;
 const initial={moves:[{id:'start',x:20,y:30}],texts:[],sizes:[{id:'start',width:180,height:90}]};
 const state=resizeCanvasState(page,initial,{id:'group',width:group.width*2,height:group.height*2},{x:-80,y:-40});
 const child=canvasIndex(editCanvas(page,state)).get('start')!.widget;
 assert.equal(child.x,40);assert.equal(child.y,60);assert.equal(child.width,360);assert.equal(child.height,180);
 const saved=saveCanvasState(page,'s',state),restored=restoreCanvasState(JSON.stringify(saved),page,'s');
 assert.deepEqual(restored,state);assert.deepEqual(editCanvas(page,restored),editCanvas(page,state));
 assert.deepEqual(saveCanvasState(page,'s',restored),saved);
 const v2={...saved,schema:'axurecraft-canvas@2'};delete (v2 as {sizes?:unknown}).sizes;
 assert.deepEqual(restoreCanvasState(JSON.stringify(v2),page,'s'),{moves:state.moves,texts:[]});
});
test('resize rejects unsafe sizes, duplicate IDs and unsupported layouts without mutation',()=>{
 const page=canvasResizeCase(),before=structuredClone(page),index=canvasIndex(page);
 for(const id of ['table','cell-0','rotated','entry-check','missing'])assert.equal(canvasResizable(id,index),false);
 for(const sizes of [[{id:'entry',width:0,height:1}],[{id:'entry',width:Infinity,height:1}],[{id:'entry',width:-1,height:1}],[{id:'rotated',width:5,height:5}],[{id:'entry',width:1,height:1},{id:'entry',width:2,height:2}]]){
  assert.throws(()=>editCanvas(page,{moves:[],texts:[],sizes}));
 }
 const saved=saveCanvasState(page,'s',{moves:[],texts:[]});
 for(const sizes of [null,{},[null],[{id:'entry',width:'5',height:2}]]){
  assert.throws(()=>restoreCanvasState(JSON.stringify({...saved,sizes}),page,'s'));
 }
 assert.deepEqual(page,before);
});

test('resize and restore reject old geometry and preserve fractional unedited endpoints exactly',()=>{
 const page=canvasResizeCase(),index=canvasIndex(page),edge=index.get('entry-check')!.widget;
 edge.connection!.geometry!.start.x=370.123456789;
 assert.deepEqual(editCanvas(page,{moves:[],texts:[]}),page);
 delete edge.connection!.geometry;
 assert.throws(()=>editCanvas(page,{moves:[],texts:[],sizes:[{id:'entry',width:280,height:88}]}),/Regenerate/);
});
