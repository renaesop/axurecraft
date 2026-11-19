import assert from 'node:assert/strict';
import {test} from 'node:test';
import {flowCanvasCase} from './fixtures/flow-canvas.ts';
import {flowCases} from './fixtures/flow.ts';
import {canvasIndex,moveCanvas,saveCanvas,restoreCanvas,editCanvas,saveCanvasState,restoreCanvasState} from '../src/flow-canvas-model.ts';
import {connectorPath,reattachGeometry} from '../src/connector-geometry.ts';
import {convertRp9} from '../src/convert.ts';
import {connectorLabelsFile} from './fixtures/connector-labels.ts';
import {parseSemanticProject} from '../src/semantic.ts';

test('native connector geometry survives semantic JSON without changing existing vector paths',()=>{
 const project=convertRp9(connectorLabelsFile()).project;
 const parsed=parseSemanticProject(JSON.stringify(project));assert.deepEqual(parsed,JSON.parse(JSON.stringify(project)));
 for(const w of project.pages[0].widgets){const c=w.connection!,g=c.geometry!,local=(p:{x:number;y:number})=>({x:p.x-w.x,y:p.y-w.y});
  assert.equal(g.space,'parent');assert.ok(g.label);let ps=[g.start,...g.points,g.end];if(g.start.x===g.end.x&&g.start.y===g.end.y&&!g.points.length)ps=ps.slice(0,1);
  assert.equal(connectorPath(c.routing,ps.map(local),g.controls?.map(local)),w.content.find(c=>c.kind==='vector')!.paths[0].data);
 }
 project.pages[0].widgets[0].connection!.geometry!.start.x=NaN;
 assert.throws(()=>parseSemanticProject(JSON.stringify(project)),/finite number/);
});
test('whole canvas retains isolated objects, tables, order, source and untouched fields',()=>{
 const page=flowCanvasCase(),before=structuredClone(page);assert.deepEqual(moveCanvas(page,[]),page);
 const edited=moveCanvas(page,[{id:'entry',x:350,y:40}]);assert.deepEqual(page,before);
 const a=canvasIndex(page),b=canvasIndex(edited);
 assert.deepEqual([...a.keys()],[...b.keys()]);
 for(const id of ['isolated','table','cell-0','group','check','check-accept'])assert.deepEqual(b.get(id)!.widget,a.get(id)!.widget);
 assert.deepEqual(b.get('entry')!.widget.source,a.get('entry')!.widget.source);
 const edge=b.get('entry-check')!.widget.connection!;assert.deepEqual(edge.geometry!.start,{x:420,y:84});assert.deepEqual(edge.geometry!.end,a.get('entry-check')!.widget.connection!.geometry!.end);
});
test('orthogonal movement preserves middle bends and reconnects terminal legs',()=>{
 const g={space:'parent' as const,start:{x:0,y:0},end:{x:300,y:200},points:[{x:100,y:0},{x:100,y:100},{x:300,y:100}]};
 const moved=reattachGeometry('orthogonal',g,{x:20,y:30},{x:350,y:200});
 assert.deepEqual(moved.points,[{x:100,y:30},{x:100,y:100},{x:350,y:100}]);
 assert.deepEqual(moved.start,{x:20,y:30});assert.deepEqual(moved.end,{x:350,y:200});assert.ok(moved.label);
 const line=reattachGeometry('rounded',{...g,end:{x:200,y:0},points:[]},{x:0,y:20},{x:200,y:0});
 assert.deepEqual(line.points,[{x:100,y:20},{x:100,y:0}]);
});
test('moving a group preserves local geometry, adjusts cross-group end, and keeps free end fixed',()=>{
 const page=flowCanvasCase(),index=canvasIndex(page),group=index.get('group')!.widget;
 const moved=canvasIndex(moveCanvas(page,[{id:'group',x:group.x+80,y:group.y+30},{id:'entry',x:330,y:30}]));
 assert.deepEqual(moved.get('start-process')!.widget,index.get('start-process')!.widget);
 const cross=moved.get('cross-group')!.widget.connection!.geometry!,old=index.get('cross-group')!.widget.connection!.geometry!;
 assert.deepEqual(cross.start,old.start);assert.deepEqual(cross.end,{x:old.end.x+80,y:old.end.y+30});
 const free=moved.get('free-end')!.widget.connection!;assert.deepEqual(free.end,{});assert.deepEqual(free.geometry!.end,index.get('free-end')!.widget.connection!.geometry!.end);
});
test('self-loop curve follows its node with both control handles translated',()=>{
 const page=flowCases().flowLoop,old=canvasIndex(page).get('check-self')!.widget.connection!.geometry!;
 const moved=canvasIndex(moveCanvas(page,[{id:'loop-check',x:100,y:120}])).get('check-self')!.widget.connection!.geometry!;
 assert.deepEqual(moved.controls,old.controls!.map(p=>({x:p.x+10,y:p.y+20})));
});
test('canvas file roundtrip is exact and rejects wrong base, duplicate IDs and unsafe coordinates',()=>{
 const page=flowCanvasCase(),moves=[{id:'entry',x:333,y:27}],saved=saveCanvas(page,'source',moves);
 assert.deepEqual(restoreCanvas(JSON.stringify(saved),page,'source'),moves);
 assert.deepEqual(moveCanvas(page,restoreCanvas(JSON.stringify(saved),page,'source')),moveCanvas(page,moves));
 assert.throws(()=>restoreCanvas(JSON.stringify(saved),page,'other'),/conflict/);
 const changed=structuredClone(page);changed.widgets[0].name='changed';assert.throws(()=>restoreCanvas(JSON.stringify(saved),changed,'source'),/conflict/);
 for(const invalid of [[moves[0],moves[0]],[{id:'missing',x:0,y:0}],[{id:'entry',x:'20',y:0}],[{id:'cell-0',x:0,y:0}],[{id:'entry',x:Infinity,y:0}]])assert.throws(()=>restoreCanvas(JSON.stringify({...saved,moves:invalid}),page,'source'));
});
test('legacy projects stay viewable but connected moves cannot silently leave stale SVG',()=>{
 const page=flowCases().flowChain;delete page.widgets[0].connection!.geometry;
 assert.deepEqual(moveCanvas(page,[]),page);
 assert.throws(()=>moveCanvas(page,[{id:'start',x:50,y:80}]),/Regenerate/);
});

test('group normalization retains parent-relative endpoints and movement preserves custom port IDs',()=>{
 const page=flowCanvasCase(),index=canvasIndex(page),edge=index.get('start-process')!;
 const g=edge.widget.connection!.geometry!;
 assert.deepEqual({x:g.start.x+edge.origin.x,y:g.start.y+edge.origin.y},{x:220,y:642});
 const c=index.get('entry-check')!.widget.connection!;c.start.port='custom-original-port';
 const after=canvasIndex(moveCanvas(page,[{id:'entry',x:310,y:15}]));
 assert.equal(after.get('entry-check')!.widget.connection!.start.port,'custom-original-port');
 assert.deepEqual(after.get('entry')!.widget.css,index.get('entry')!.widget.css);
});

test('text editing preserves rich styles, tables, connector geometry and source baseline',()=>{
 const page=flowCanvasCase(),before=structuredClone(page);
 const texts=['isolated','cell-0'].map(id=>({id,content:0,paragraph:0,run:0,text:'编辑 <script> & 新文字'}));
 const state={moves:[{id:'entry',x:340,y:50}],texts};
 const result=editCanvas(page,state),expected=moveCanvas(page,state.moves);
 for(const t of texts){const c=canvasIndex(expected).get(t.id)!.widget.content[0];if(c.kind==='text')c.paragraphs[0].runs[0].text=t.text;}
 assert.deepEqual(result,expected);assert.deepEqual(page,before);
 assert.deepEqual(restoreCanvasState(JSON.stringify(saveCanvasState(page,'source',state)),page,'source'),state);
 assert.deepEqual(restoreCanvasState(JSON.stringify(saveCanvas(page,'source',state.moves)),page,'source'),{moves:state.moves,texts:[]});
 const text=texts[0];
 for(const invalid of [[text,text],[{...text,id:'missing'}],[{...text,run:99}],[{...text,paragraph:-1}],[{...text,text:42}], [null]]){
  assert.throws(()=>restoreCanvasState(JSON.stringify({...saveCanvasState(page,'source',state),texts:invalid}),page,'source'));
 }
 const saved=saveCanvasState(page,'source',state);
 assert.throws(()=>restoreCanvasState(JSON.stringify(saved),page,'other'),/conflict/);
});

test('text edits refuse read-only dynamic ancestors and preserve redo-independent snapshots',()=>{
 const page=flowCanvasCase(),group=canvasIndex(page).get('group')!.widget;
 group.variants=[];
 const child=group.children!.find(w=>w.content.some(c=>c.kind==='text'))!;
 const ci=child.content.findIndex(c=>c.kind==='text');
 assert.throws(()=>editCanvas(page,{moves:[],texts:[{id:child.id,content:ci,paragraph:0,run:0,text:'changed'}]}),/Invalid/);
 const native=convertRp9(connectorLabelsFile()).project.pages[0];
 const w=native.widgets.find(w=>w.content.some(c=>c.kind==='text'))!,content=w.content.findIndex(c=>c.kind==='text');
 const state={moves:[],texts:[{id:w.id,content,paragraph:0,run:0,text:'新标签'}]};
 const saved=saveCanvasState(native,'native',state);state.texts[0].text='later';
 const restored=restoreCanvasState(JSON.stringify(saved),native,'native');
 assert.equal(restored.texts[0].text,'新标签');
 assert.deepEqual(canvasIndex(editCanvas(native,restored)).get(w.id)!.widget.connection,w.connection);
});
