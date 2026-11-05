import assert from 'node:assert/strict';import {test} from 'node:test';import {styleProperties,resolveStyleDelta} from '../src/styles.ts';import type {Value,Graph} from '../src/graph.ts';
const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='string'?{tag:8,text:v}:{tag:3,value:v as number};
test('interaction styles ignore determined cache properties unless marked overridden',()=>{
 const style:Value={tag:9,className:'Axure:Style',body:value({All:true,PropList:[{DOAName:0x80000069,Value:{Width:0,Height:0}},{DOAName:0x80000047,Value:0},{DOAName:0xc000000f,Value:2}]})};
 const graph={objects:new Map(),guids:[]} as unknown as Graph;
 assert.equal(styleProperties(style).size,3);const delta=resolveStyleDelta(graph,style);assert.equal(delta.size,1);assert.equal(delta.has(105),false);assert.equal(delta.get(15)?.value,2);
});
