import assert from 'node:assert/strict';import {test} from 'node:test';import {treePlacements} from '../src/tree.ts';
const node=(id:string,nodes:string[],root=false)=>({id,geometry:{x:0,y:0,width:100,height:20},tree:{root,expanded:true,nodes,rowHeight:20}});
test('nested collapse closes only its descendant gap and restores following siblings on expansion',()=>{
 const nodes=[node('root',['a','d'],true),node('a',['b','c']),node('b',[]),node('c',[]),node('d',[])];
 const expanded=treePlacements(nodes),closed=treePlacements(nodes,{a:false});
 assert.equal(expanded.find(p=>p.id==='d')?.y,60);assert.equal(expanded.find(p=>p.id==='root')?.height,80);
 assert.equal(closed.find(p=>p.id==='d')?.y,20);assert.equal(closed.find(p=>p.id==='b')?.visible,false);assert.equal(closed.find(p=>p.id==='root')?.height,40);
 assert.deepEqual(treePlacements(nodes,{a:true}),expanded);
});
test('collapsed ancestors keep descendants hidden even when a descendant is expanded',()=>{
 const nodes=[node('root',['a'],true),node('a',['b']),node('b',['c']),node('c',[])];
 assert.equal(treePlacements(nodes,{a:false,b:true}).find(p=>p.id==='c')?.visible,false);
 assert.throws(()=>treePlacements([node('root',['a'],true),node('a',['root'])]),/Cyclic/);
});
