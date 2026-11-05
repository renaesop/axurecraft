import assert from 'node:assert/strict';import {test} from 'node:test';import {readFileSync} from 'node:fs';
import {flowCases} from './fixtures/flow.ts';import {flowStructure} from '../src/flow.ts';import {connectorInfo} from '../src/connector.ts';
import {pageToJsx,pageDefinition} from '../src/jsx.ts';import {instantiateMaster} from '../src/master.ts';import {materializeRepeater} from '../src/repeater-model.ts';import {parseSemanticProject} from '../src/semantic.ts';import type {Graph,Value} from '../src/graph.ts';import type {RepeaterData} from '../src/model.ts';
const v=(value:unknown):Value=>typeof value==='object'&&value!==null?{tag:1,entries:Object.entries(value).map(([k,vv])=>[{tag:8,text:k},v(vv)])}:{tag:3,value:value as number};
test('native connectors retain GUID identity and port identity independently of graph object indices',()=>{
 const g={guids:['00000000000000000000000000000000','start-node','end-node','port'],objects:new Map()} as unknown as Graph;
 const c=connectorInfo(g,{tag:9,body:v({'connector-type':1,'start-diagram-object':2,'end-diagram-object':3,'start-connector-id':4,'end-connector-id':4})},'instance--');
 assert.deepEqual(c,{routing:'orthogonal',start:{target:'instance--w-start-node',port:'port'},end:{target:'instance--w-end-node',port:'port'}});
 assert.deepEqual(connectorInfo(g,{tag:9,body:v({'start-diagram-object':1,'end-diagram-object':1})}),{routing:'straight',start:{},end:{}});
});
test('flow cases distinguish branch, merge, cycle and swimlane hierarchy',()=>{
 const cases=flowCases(),chain=flowStructure(cases.flowChain.widgets),decision=flowStructure(cases.flowDecision.widgets),loop=flowStructure(cases.flowLoop.widgets),lanes=flowStructure(cases.flowLanes.widgets);
 assert.deepEqual([chain.nodes.length,chain.edges.length,chain.hasCycle],[3,2,false]);assert.deepEqual([decision.nodes.length,decision.edges.length,decision.branches,decision.merges,decision.hasCycle],[5,5,1,1,false]);assert.equal(loop.hasCycle,true);
 assert.equal(lanes.nodes.find(n=>n.id==='submit')!.parent,'user-lane');assert.equal(lanes.nodes.find(n=>n.id==='validate')!.parent,'service-lane');
 assert.equal((pageToJsx(cases.flowLoop).match(/<RpWidget\s/g)??[]).length,7,'cycles reference nodes without duplicating their declarations');
 for(const p of Object.values(cases)){const g=flowStructure(p.widgets);assert.deepEqual(g.danglingTargets,[]);assert.equal(g.missingMetadata,0);assert.equal(g.unattachedEnds,0);}
});
test('flow audit reports a dangling endpoint separately from an intentionally free endpoint',()=>{
 const p=flowCases().flowChain;p.widgets[0].connection!.end.target='deleted-node';delete p.widgets[1].connection!.start.target;
 const f=flowStructure(p.widgets);assert.deepEqual(f.danglingTargets,[{edge:'start-process',end:'end',target:'deleted-node'}]);assert.equal(f.unattachedEnds,1);
 delete p.widgets[0].connection;assert.equal(flowStructure(p.widgets).missingMetadata,1);
});
test('flow labels are independently editable and exported TS exposes topology and vector paths',()=>{
 const page=flowCases().flowDecision,definition=pageDefinition(page),code=pageToJsx(page),edited=structuredClone(page),node=edited.widgets.find(w=>w.id==='accept')!;
 const text=node.content.find(c=>c.kind==='text')!;if(text.kind!=='text')throw new Error('Missing label');text.paragraphs[0].runs[0].text='Approved';
 assert.deepEqual(flowStructure(edited.widgets),flowStructure(page.widgets));const before=code.split('\n'),after=pageToJsx(edited).split('\n');assert.equal(before.filter((line,i)=>line!==after[i]).length,1);
 assert.equal(definition.widgets.find(w=>w.id==='check-accept')!.connection!.start.target,'check');assert.match(code,/<path /);assert.doesNotMatch(code,/<(?:img|canvas|iframe)\b/);
 const project=JSON.parse(readFileSync('examples/hello.project.json','utf8'));project.pages=[page];assert.doesNotThrow(()=>parseSemanticProject(JSON.stringify(project)));project.pages[0].widgets[0].connection.routing='invented';assert.throws(()=>parseSemanticProject(JSON.stringify(project)),/connector routing/);
});
test('master and repeater flow copies remap endpoint IDs while retaining shared port identities',()=>{
 const page=flowCases().flowChain;page.widgets[0].connection!.start.port='shared-port';
 for(const prefix of ['first--','second--']){
  const clone=instantiateMaster(page.widgets,prefix),graph=flowStructure(clone);assert.deepEqual(graph.danglingTargets,[]);assert.ok(graph.edges.every(e=>e.start?.target?.startsWith(prefix)&&e.end?.target?.startsWith(prefix)));assert.equal(clone[0].connection!.start.port,'shared-port');
 }
 const data:RepeaterData={columns:[],rows:[{id:'one',cells:{}},{id:'two',cells:{}}],template:page.widgets,bindings:[],isolateRadioGroups:true,templateSource:page.widgets[0].source,layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:0,pageSize:0,startPage:1,wrap:0,paddingLeft:0,paddingTop:0}};
 for(const row of materializeRepeater('copies',data)){const graph=flowStructure(row.widgets);assert.deepEqual(graph.danglingTargets,[]);assert.ok(graph.edges.every(e=>e.start?.target?.startsWith('copies-row'+row.key+'-')));}
 assert.equal(page.widgets[0].connection!.start.target,'start');
});
