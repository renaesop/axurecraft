import assert from 'node:assert/strict';import {test} from 'node:test';
import {nativeExpressions} from '../src/native-expression.ts';import {nativeColumnId} from '../src/native-reference.ts';import type {Graph,Value} from '../src/graph.ts';
const guid='1234567890abcdef1234567890abcdef',other='abcdef1234567890abcdef1234567890';
const value=(v:unknown):Value=>typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:{tag:3,value:v as number};
test('panel records resolve widget identity through their owning page context only',()=>{
 const owner:Value={tag:9,id:1,className:'Axure:DiagramObject:VectorShape'},g={objects:new Map([[1,owner]]),guids:[other,guid]} as unknown as Graph;
 const widget:Value={tag:9,id:1,className:'Axure:DiagramObject:TextBox'},parent={objects:new Map([[1,widget]]),guids:[guid]} as unknown as Graph;
 const path:Value={tag:9,body:value({'object-id':2})};
 assert.throws(()=>nativeExpressions(g,owner).target(path),/Unresolved widget/);
 assert.equal(nativeExpressions(g,owner,[],undefined,{references:new Map([[guid,{graph:parent,widget}]])}).target(path),'w-'+guid);
});
test('dataset column IDs are remapped by GUID across records, never by coincidental integer index',()=>{
 const graph={guids:[other,guid]} as unknown as Graph;
 assert.equal(nativeColumnId(graph,2,[{id:99,name:'Name',guid}]),99);
 assert.throws(()=>nativeColumnId(graph,1,[{id:1,name:'Name',guid}]),/Unresolved target dataset/);
});
test('master-scoped targets include instance GUIDs and reject missing instance paths',()=>{
 const owner:Value={tag:9,id:1,className:'Axure:DiagramObject:VectorShape'},instance:Value={tag:9,id:2,className:'Axure:DiagramObject:ReferenceDiagramObject'},child:Value={tag:9,id:3,className:'Axure:DiagramObject:TextBox'};
 const g={objects:new Map([[1,owner],[2,instance],[3,child]]),guids:['owner','instance','child']} as unknown as Graph,path:Value={tag:9,body:{tag:1,entries:[[{tag:8,text:'object-id'},{tag:3,value:3}],[{tag:8,text:'rdo-path'},{tag:2,items:[{tag:3,value:2}]}]]}};
 assert.equal(nativeExpressions(g,owner).target(path),'w-instance--w-child');g.objects.delete(2);assert.throws(()=>nativeExpressions(g,owner).target(path),/Unresolved master scope/);
});
