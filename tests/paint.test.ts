import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {materializeRepeater} from '../src/repeater-model.ts';
import {widgetHtml} from '../src/html.ts';
import {isCssRectangle} from '../src/vector.ts';
import type {Value} from '../src/graph.ts';
import type {RepeaterData,Widget} from '../src/model.ts';

const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='boolean'?{tag:25,value:v}:{tag:3,value:v as number};
test('plain rectangle paint uses CSS only when the native path is unedited',()=>{
 const w={tag:9,body:value({Shape:0,ControlPoints:[[[0,0],[1,0],[1,1],[0,1]].map(([X,Y])=>({Path:{X,Y},HigherSegmentExists:true}))]})};
 assert.equal(isCssRectangle(w,new Map(),100,40),true);
 const path=w.body.entries![1][1].items![0].items![0];path.entries!.push([{tag:8,text:'HigherHandle'},value({X:.25,Y:.1})]);
 assert.equal(isCssRectangle(w,new Map(),100,40),false,'custom curves must not be flattened into rectangles');
});
test('empty image slots retain frames and produce unique masks after repeater binding',()=>{
 const base=JSON.parse(readFileSync('examples/hello.project.json','utf8')).pages[0].widgets[0] as Widget;
 const image:Widget={...base,id:'icon',type:'ImageBox',kind:'image',width:32,height:32,variants:undefined,behaviors:[],content:[{kind:'image',asset:null,alt:'Icon',frame:{id:'icon-mask',width:32,height:32,radius:90,borderWidth:1,borderColor:'#f5f5f5'}}]};
 const data:RepeaterData={template:[image],templateSource:image.source,columns:[{id:1,name:'image'}],rows:[{id:'a',cells:{'1':{kind:'image',asset:'assets/aaaaaaaaaaaaaaaaaaaaaaaa.png'}}},{id:'b',cells:{'1':{kind:'image',asset:'assets/bbbbbbbbbbbbbbbbbbbbbbbb.png'}}}],bindings:[{targetGuid:image.source.guid,property:'image',expression:{kind:'column',columnId:1}}],isolateRadioGroups:true,layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:0,pageSize:0,startPage:1,wrap:0,paddingLeft:0,paddingTop:0}};
 const rows=materializeRepeater('cards',data);const html=rows.map(row=>widgetHtml(row.widgets[0])).join('');
 assert.match(html,/id="cards-rowa-icon-mask"/);assert.match(html,/mask="url\(#cards-rowb-icon-mask\)"/);
 assert.match(html,/<image href="assets\/aaaaaaaaaaaaaaaaaaaaaaaa.png"/);
 assert.equal(image.content[0].kind==='image'&&image.content[0].asset,null);
});
