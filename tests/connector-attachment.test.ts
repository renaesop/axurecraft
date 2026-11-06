import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseConnector} from '../src/connector.ts';
import {connectorPort,connectorPoint} from '../src/connector-point.ts';
import type {Graph,Value} from '../src/graph.ts';
const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='string'?{tag:8,text:v}:{tag:3,value:v as number};
const bottom='a70aa03f1f4bdc499321e356041b831c',right='a70aa02f1f4bdc499321e356041b831c';
const box=(x:number,y:number,width:number,height:number,angle=0)=>new Map([[101,value({X:x,Y:y})],[105,value({Width:width,Height:height})],[50,value(angle)]]);
const graph=():Graph=>({guids:['target',bottom,right,'custom'],objects:new Map([[1,{tag:9,body:value({})}]])} as unknown as Graph);
test('attached endpoints override stale coordinates and the last segment is not an extra bend',()=>{
 const g=graph();g.objects.set(5,{tag:9,body:value({'from-x':410,'from-y':2647,'to-x':1100,'to-y':2647})});g.objects.set(6,{tag:9,body:value({'from-x':1100,'from-y':2647,'to-x':1100,'to-y':992})});
 const line:Value={tag:9,body:value({'end-diagram-object':1,'end-connector-id':2,'end-point-x':1102,'end-point-y':997,'connector-type':1,segments:[5,6]})};
 const c=parseConnector(g,line,box(410,2647,0,0),'line',()=>box(940,100,320,892))!;
 assert.deepEqual([c.x,c.y,c.width,c.height],[410,992,690,1655]);
 assert.equal(c.graphic.paths[0].data,'M 0 1655 L 690 1655 L 690 0');
 // The serialized cache remains untouched for lossless round trips.
 assert.equal(line.body!.entries!.find(([k])=>k.text==='end-point-y')![1].value,997);
});
test('an explicit custom port dictionary overrides defaults and does not resurrect deleted ports',()=>{
 const g=graph(),target=g.objects.get(1)!;
 target.body=value({ConnectorPoints:{}});
 const custom=target.body.entries![0][1];custom.entries=[[value(2),value({X:.25,Y:1})],[value(4),value({X:1.2,Y:.5})]];
 assert.deepEqual(connectorPort(g,target,bottom),{x:.25,y:1});
 assert.equal(connectorPort(g,target,right),undefined);
 assert.deepEqual(connectorPoint(g,target,bottom,box(100,50,200,100)),{x:150,y:150});
 assert.deepEqual(connectorPoint(g,target,'custom',box(100,50,200,100,90)),{x:200,y:240});
});
test('port coordinates follow rotation and native rounding at positive and negative half pixels',()=>{
 const g=graph(),target=g.objects.get(1)!;
 assert.deepEqual(connectorPoint(g,target,right,box(100,50,200,100,90)),{x:200,y:200});
 assert.deepEqual(connectorPoint(g,target,bottom,box(-100,-60,99,40)),{x:-51,y:-20});
 assert.deepEqual(connectorPoint(g,target,bottom,box(100,50,99,40)),{x:150,y:90});
});
test('free, unknown and deleted ports preserve stored endpoints without adding a terminal spur',()=>{
 const g=graph(),props=box(10,20,0,0);g.objects.set(5,{tag:9,body:value({'from-x':10,'from-y':20,'to-x':98,'to-y':20})});
 for(const ref of [{},{'end-diagram-object':1,'end-connector-id':4},{'end-diagram-object':9,'end-connector-id':2}]){
  const c=parseConnector(g,{tag:9,body:value({...ref,'end-point-x':100,'end-point-y':20,'connector-type':1,segments:[5]})},props,'free',()=>box(300,400,100,80))!;
  assert.equal(c.graphic.paths[0].data,'M 0 0 L 90 0');
 }
 assert.equal(parseConnector(g,{tag:9,body:value({'end-point-x':100,'end-point-y':20,'connector-type':1,segments:[99]})},props,'missing'),undefined);
});
test('reattached single legs remain orthogonal and curves retain authored control handles',()=>{
 const g=graph(),line={'end-diagram-object':1,'end-connector-id':2,'end-point-x':200,'end-point-y':20};
 g.objects.set(5,{tag:9,body:value({'from-x':10,'from-y':20,'to-x':200,'to-y':20})});
 const c=parseConnector(g,{tag:9,body:value({...line,'connector-type':1,segments:[5]})},box(10,20,0,0),'offset',()=>box(150,40,100,60))!;
 assert.equal(c.graphic.paths[0].data,'M 0 0 L 95 0 L 95 80 L 190 80');
 const curve=parseConnector(g,{tag:9,body:value({...line,'connector-type':3,'control-points':[{LowerHandle:{X:50,Y:40},HigherHandle:{X:150,Y:60}}]})},box(10,20,0,0),'curve',()=>box(150,40,100,60))!;
 assert.equal(curve.graphic.paths[0].data,'M 0 0 C 40 20 140 40 190 80');
});
