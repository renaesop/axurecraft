import {test} from 'node:test';import assert from 'node:assert/strict';
import {adaptiveStyle,nativeViews} from '../src/native-adaptive.ts';import {nativeExpressions} from '../src/native-expression.ts';import {P} from '../src/styles.ts';import type {Value,Graph} from '../src/graph.ts';
const v=(x:unknown):Value=>Array.isArray(x)?{tag:2,items:x.map(v)}:x&&typeof x==='object'?{tag:1,entries:Object.entries(x).map(([k,x])=>[{tag:8,text:k},v(x)])}:typeof x==='string'?{tag:8,text:x}:{tag:3,value:x as number};
const object=(id:number,className:string,body:unknown):Value=>({id,className,tag:9,body:v(body)});
const graph=(objects:Value[],guids:string[]):Graph=>({guids,objects:new Map(objects.map(o=>[o.id!,o])),root:objects[0]}) as Graph;
test('native adaptive styles use GUID pairs and authored overrides, not determined cache values',()=>{
 const child=object(1,'Axure:DiagramObject:VectorShape',{AdaptiveStyles:[2,4,3,5]}),parent=object(4,'style',{PropList:[{DOAName:(P.SIZE|0xc0000000)>>>0,Value:{Width:100,Height:40}}]}),phone=object(5,'style',{PropList:[{DOAName:(P.SIZE|0x80000000)>>>0,Value:{Width:999,Height:999}},{DOAName:(P.LOCATION|0xc0000000)>>>0,Value:{X:10,Y:20}}]});
 const g=graph([child,parent,phone],['widget','large','phone']);const resolved=adaptiveStyle(g,child,['large','phone']);assert.equal(resolved.size,2);assert.equal(resolved.get(P.SIZE)?.entries?.[0][1].value,100);
});
test('native page view sets and panel-state literals resolve stable GUID identity',()=>{
 const root=object(1,'doc',{}),set=object(2,'Axure:AdaptiveViewSet',{Id:4,DefaultAdaptiveView:5,AdaptiveViews:[6]}),base=object(5,'Axure:AdaptiveView',{Id:7,Name:'Base',Size:{Width:0,Height:0},BaseViewId:7}),phone=object(6,'Axure:AdaptiveView',{Id:8,Name:'Phone',Size:{Width:375,Height:667},BaseViewId:7}),doc=graph([root,set,base,phone],['','','','set','','','base','phone']);
 const page=graph([object(1,'page',{AdaptiveViewSetId:2})],['page','set']);assert.deepEqual(nativeViews(doc,page)?.views.map(v=>[v.id,v.parent,v.width]),[['base','base',0],['phone','base',375]]);
 const literal=object(9,'Axure:Expr:DynamicPanelDiagramLiteral',{'panel-diagram-id-objectid':2});const g=graph([root,literal],['owner','state-guid']);assert.deepEqual(nativeExpressions(g,root,[],undefined,{stateNames:new Map([['state-guid','Second']])}).compile(literal),{kind:'literal',value:'Second'});
});
