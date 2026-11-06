import assert from 'node:assert/strict';import {test} from 'node:test';
import {parseConnector} from '../src/connector.ts';import type {Graph,Value} from '../src/graph.ts';
import {contentElements} from '../src/render-tree.ts';
const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='string'?{tag:8,text:v}:{tag:3,value:v as number};
const graph={objects:new Map(),guids:[]} as unknown as Graph;
const props=new Map([[101,value({X:100,Y:200})],[8,value({'fill-type':'solid','fill-color':0xff112233})],[15,value(2)]]);
test('connector absolute curve handles become local editable SVG with both endpoints intact',()=>{
 const w:Value={tag:9,body:value({'end-point-x':170,'end-point-y':260,'connector-type':3,'control-points':[{LowerHandle:{X:80,Y:220},HigherHandle:{X:180,Y:240}}]})};
 const c=parseConnector(graph,w,props,'curve')!;assert.equal(c.x,80);assert.equal(c.y,200);assert.equal(c.width,100);assert.equal(c.height,60);assert.equal(c.graphic.paths[0].data,'M 20 0 C 0 20 100 40 90 60');assert.equal(c.graphic.paths[0].stroke,'#112233');
});
test('vertical connectors retain a nonzero SVG viewport and round only intermediate turns',()=>{
 const straight=parseConnector(graph,{tag:9,body:value({'end-point-x':100,'end-point-y':260,'connector-type':2})},props,'line')!;assert.ok(straight.graphic.width>0);assert.equal(straight.graphic.paths[0].data,'M 0 0 L 0 60');
 const g={guids:[],objects:new Map([[1,{tag:9,body:value({'to-x':140,'to-y':200})}],[2,{tag:9,body:value({'to-x':140,'to-y':240})}]])} as unknown as Graph;
 const curve=parseConnector(g,{tag:9,body:value({'end-point-x':140,'end-point-y':240,'connector-type':0,segments:[1,2]})},props,'round')!;assert.equal(curve.graphic.paths[0].data,'M 0 0 L 35 0 A 5 5 0 0 1 40 5 L 40 40');
});

test('rounded connector collinear segments stay straight and hidden strokes have no arrowheads',()=>{
 const g={guids:[],objects:new Map([[1,{tag:9,body:value({'to-x':140,'to-y':200})}],[2,{tag:9,body:value({'to-x':180,'to-y':200})}]])} as unknown as Graph;
 const w:Value={tag:9,body:value({'end-point-x':180,'end-point-y':200,'connector-type':0,segments:[1,2]})};
 assert.equal(parseConnector(g,w,props,'flat')!.graphic.paths[0].data,'M 0 0 L 40 0 L 80 0');
 const hidden=new Map([...props,[16,value(9)],[17,value({Start:3,End:3})]]);assert.deepEqual(parseConnector(g,w,hidden,'hidden')!.graphic.markers,[]);
 assert.equal(parseConnector(g,{...w,body:value({'end-point-x':180,'end-point-y':200,'connector-type':99})},props,'unknown'),undefined);
});

test('native circle endings retain fixed page units and transparent hollow interiors',()=>{
 const p=new Map([...props,[17,value({Start:18,End:19})]]);
 const c=parseConnector(graph,{tag:9,body:value({'end-point-x':200,'end-point-y':200,'connector-type':2})},p,'circles')!;
 assert.deepEqual(c.graphic.markers.map(m=>[m.filled,m.units,m.viewport,m.strokeWidth]),[
  [true,'userSpaceOnUse',{width:7,height:7,refX:3.5,refY:3.5},2],
  [false,'userSpaceOnUse',{width:7,height:7,refX:3.5,refY:3.5},2],
 ]);
 assert.deepEqual(c.graphic.paths[0].markerHoles,[{x:100,y:0,radius:1.5}]);
 assert.equal(c.graphic.paths[0].data,'M 0 0 L 100 0','authored endpoints are unchanged');
 const svg=contentElements(c.graphic)[0],defs=svg.children[0];assert.ok(typeof defs!=='string');
 assert.ok(defs.children.some(d=>typeof d!=='string'&&d.tag==='clipPath'&&d.attrs.id==='circles-start-holes-0'));
 const line=svg.children.at(-1)!;assert.ok(typeof line!=='string');assert.equal(line.attrs['clip-path'],'url(#circles-start-holes-0)');
 const thick=parseConnector(graph,{tag:9,body:value({'end-point-x':200,'end-point-y':200})},new Map([...p,[15,value(6)]]),'thick')!;
 assert.equal(thick.graphic.markers[1].viewport!.width,11);assert.equal(thick.graphic.paths[0].markerHoles,undefined);
});
