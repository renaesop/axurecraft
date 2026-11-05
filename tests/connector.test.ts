import assert from 'node:assert/strict';import {test} from 'node:test';
import {parseConnector} from '../src/connector.ts';import type {Graph,Value} from '../src/graph.ts';
const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='string'?{tag:8,text:v}:{tag:3,value:v as number};
const graph={objects:new Map()} as unknown as Graph;
const props=new Map([[101,value({X:100,Y:200})],[8,value({'fill-type':'solid','fill-color':0xff112233})],[15,value(2)]]);
test('connector absolute curve handles become local editable SVG with both endpoints intact',()=>{
 const w:Value={tag:9,body:value({'end-point-x':170,'end-point-y':260,'connector-type':3,'control-points':[{LowerHandle:{X:80,Y:220},HigherHandle:{X:180,Y:240}}]})};
 const c=parseConnector(graph,w,props,'curve')!;assert.equal(c.x,80);assert.equal(c.y,200);assert.equal(c.width,100);assert.equal(c.height,60);assert.equal(c.graphic.paths[0].data,'M 20 0 C 0 20 100 40 90 60');assert.equal(c.graphic.paths[0].stroke,'#112233');
});
test('vertical connectors retain a nonzero SVG viewport and round only intermediate turns',()=>{
 const straight=parseConnector(graph,{tag:9,body:value({'end-point-x':100,'end-point-y':260,'connector-type':2})},props,'line')!;assert.ok(straight.graphic.width>0);assert.equal(straight.graphic.paths[0].data,'M 0 0 L 0 60');
 const g={objects:new Map([[1,{tag:9,body:value({'to-x':140,'to-y':200})}],[2,{tag:9,body:value({'to-x':140,'to-y':240})}]])} as unknown as Graph;
 const curve=parseConnector(g,{tag:9,body:value({'end-point-x':140,'end-point-y':240,'connector-type':0,segments:[1,2]})},props,'round')!;assert.equal(curve.graphic.paths[0].data,'M 0 0 L 35 0 A 5 5 0 0 1 40 5 L 40 40');
});
