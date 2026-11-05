import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {nativeExpressions} from '../src/native-expression.ts';
import {nativeAttributedText,richTextTemplate} from '../src/native-rich-text.ts';
import {evaluateRichText,plainRichText,richTextValue} from '../src/rich-text.ts';
import {executeActions} from '../src/behavior-runtime.ts';
import {instantiateMaster} from '../src/master.ts';
import {materializeRepeater} from '../src/repeater-model.ts';
import {applySnapshotActions} from '../src/snapshot.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import type {Graph,Value} from '../src/graph.ts';
import type {Action,RichText,RichTextTemplate,Widget,RepeaterData} from '../src/model.ts';
const v=(value:unknown):Value=>Array.isArray(value)?{tag:2,items:value.map(v)}:typeof value==='string'?{tag:8,text:value}:typeof value==='object'&&value!==null?{tag:1,entries:Object.entries(value).map(([key,value])=>[v(key),v(value)])}:{tag:typeof value==='boolean'?25:3,value:value as number};
const record=(id:number,className:string,body:unknown):Value=>({tag:9,id,className,body:v(body)});
const widget=(id:string):Widget=>({id,name:id,type:'VectorShape',kind:'shape',x:0,y:0,width:200,height:50,css:{},content:[],behaviors:[],source:{record:0,objectId:1,guid:id,className:'VectorShape'}});
const rich:RichTextTemplate={kind:'text',css:{},paragraphs:[{css:{'text-align':'right'},runs:[{text:'Prefix ',css:{}},{text:'',css:{color:'#c00','font-weight':'700'},expression:{kind:'widget',target:'input',property:'text'}}]},{css:{},runs:[{text:'Second line',css:{'text-decoration':'line-through'}}]}]};

test('native RichTextLiteral retains point sizes, local scopes, mixed styles and split interpolation',()=>{
 const owner=record(1,'Axure:DiagramObject:VectorShape',{}),nodes=[owner,record(2,'Axure:Expr:DiagramObjectPathLiteral',{value:3}),record(3,'Axure:DiagramObjectPath',{'object-id':1}),record(4,'Axure:Expr:RichTextLiteral',{'attributed-string-value':{Paragraphs:[{HorizontalAlignment:2,LineSpacing:18,Inlines:[{Text:'Hello [[Na',Size:12,Weight:700,Color:0xffaa0000},{Text:'me]]!',Size:9,Weight:400,Color:0xff000000}]}]},scope:{Name:6}}),record(5,'Axure:Expr:BooleanLiteral',{value:'False'}),record(6,'Axure:Expr:StringLiteral',{value:'Ada & <b>'})];
 const g={objects:new Map(nodes.map(n=>[n.id!,n])),guids:['target']} as Graph,call=record(7,'Axure:Expr:FCall',{'function-name':'SetWidgetRichText',args:[2,4,5]});
 const action=nativeExpressions(g,owner).actions(call)[0];assert.equal(action.kind,'set-rich-text');assert.equal(action.target,'w-target');
 const text=evaluateRichText(action.richText!,{readWidget:()=>undefined})!;assert.equal(richTextValue(text),'Hello Ada & <b>!');assert.equal(text.paragraphs[0].css['line-height'],'24px');
 assert.deepEqual(text.paragraphs[0].runs.map(r=>[r.text,r.css['font-size'],r.css['font-weight']]),[['Hello ','16px','700'],['Ada & <b>','16px','700'],['!','12px','400']]);
 assert.equal(nativeExpressions(g,owner).compile(nodes[3]).kind,'concat');
 assert.throws(()=>nativeAttributedText(undefined),/missing/);
});

test('formatted assignments apply even when text is unchanged and read previous writes in sequence',async()=>{
 let text='Prefix Ada\nSecond line',format:RichText|undefined,writes=0,events=0;
 const host={readWidget:(id:string)=>id==='input'?'Ada':text,writeText:(_id:string,value:string,rich?:RichText)=>{writes++;text=value;format=rich;},writeSelected:()=>{},isDisabled:()=>false,behaviors:()=>[{event:'textchange',actions:[{kind:'wait' as const,value:0}]}],apply:()=>{events++;}};
 await executeActions([{kind:'set-rich-text',target:'label',richText:rich}],host);assert.equal(writes,1);assert.equal(events,0);assert.equal(format?.paragraphs[0].runs[1].css.color,'#c00');
 await executeActions([{kind:'set-text',target:'label',expression:{kind:'literal',value:text}}],host);assert.equal(writes,2);assert.equal(format,undefined);assert.equal(events,0);
 const missing=structuredClone(rich);missing.paragraphs[0].runs[1].expression={kind:'column',columnId:999};assert.equal(evaluateRichText(missing,host),undefined);
});

test('master and repeater clones bind rich expressions and link actions without changing the source',()=>{
 const label=widget('label'),input=widget('input');label.behaviors=[{event:'load',actions:[{kind:'set-rich-text',target:'label',richText:rich}]}];
 const master=instantiateMaster([label,input],'master--');assert.deepEqual(master[0].behaviors[0].actions[0].richText!.paragraphs[0].runs[1].expression,{kind:'widget',target:'master--input',property:'text'});assert.equal(rich.paragraphs[0].runs[1].expression?.kind,'widget');
 const template=structuredClone(rich);template.paragraphs[0].runs[1].expression={kind:'column',columnId:7};template.paragraphs[0].runs[1].link={behaviors:[{event:'click',actions:[{kind:'set-text',target:'input',expression:{kind:'row-index'}}]}]};label.behaviors[0].actions[0].richText=template;
 const data:RepeaterData={columns:[{id:7,name:'Name'}],rows:[{id:'a',cells:{7:{kind:'text',value:'Row A'}}}],bindings:[],template:[label,input],isolateRadioGroups:true,layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:0,pageSize:0,startPage:1,wrap:0,paddingLeft:0,paddingTop:0},templateSource:label.source};
 const action=materializeRepeater('rows',data)[0].widgets[0].behaviors[0].actions[0],run=action.richText!.paragraphs[0].runs[1];assert.deepEqual(run.expression,{kind:'literal',value:'Row A'});assert.equal(run.link!.behaviors[0].actions[0].target,'rows-rowa-input');assert.deepEqual(run.link!.behaviors[0].actions[0].expression,{kind:'literal',value:1});
});

test('rich text broadcast remaps Target expressions to each materialized widget',async()=>{
 const template=structuredClone(rich);template.paragraphs[0].runs[1].expression={kind:'widget',target:'label',property:'text'};
 template.paragraphs[0].runs[1].link={behaviors:[{event:'click',actions:[{kind:'set-text',target:'label',expression:{kind:'widget',target:'label',property:'text'}}]}]};
 const linkTargets:string[]=[];
 const results:string[]=[];await executeActions([{kind:'set-rich-text',target:'label',richText:template}],{resolveTargets:id=>id==='label'?['a-label','b-label']:[id],readWidget:id=>id==='a-label'?'A':'B',writeText:(_id,value,rich)=>{results.push(value);linkTargets.push(rich!.paragraphs[0].runs[1].link!.behaviors[0].actions[0].target!);},writeSelected:()=>{},behaviors:()=>[],isDisabled:()=>false,apply:()=>{}});assert.deepEqual(results,['Prefix A\nSecond line','Prefix B\nSecond line']);assert.deepEqual(linkTargets,['a-label','b-label']);
});

test('snapshot rich assignments preserve layout and plain replacement keeps the first run style',()=>{
 const label=widget('label');label.content=[{kind:'text',css:{'padding-left':'12px'},paragraphs:[{css:{},runs:[{text:'old',css:{}}]}]}];
 const template=structuredClone(rich);template.paragraphs[0].runs[1].expression={kind:'literal',value:'Snapshot'};
 const problems:string[]=[];applySnapshotActions([label],[{kind:'set-rich-text',target:'label',richText:template}],new Map(),x=>problems.push(x));const text=label.content[0] as RichText;
 assert.equal(richTextValue(text),'Prefix Snapshot\nSecond line');assert.equal(text.css['padding-left'],'12px');assert.deepEqual(problems,[]);
 const plain=plainRichText(text,'Changed');assert.equal(plain.paragraphs.length,1);assert.equal(plain.paragraphs[0].css['text-align'],'right');assert.equal(plain.paragraphs[0].runs.length,1);
});

test('semantic JSON validates rich assignments and rejects executable or invalid expressions',()=>{
 const project=JSON.parse(readFileSync('examples/hello.project.json','utf8')),w=project.pages[0].widgets[0];w.behaviors=[{event:'click',actions:[{kind:'set-rich-text',target:w.id,richText:structuredClone(rich)}]}];assert.doesNotThrow(()=>parseSemanticProject(JSON.stringify(project)));
 w.behaviors[0].actions[0].richText.paragraphs[0].runs[1].expression={kind:'javascript',value:'alert(1)'};assert.throws(()=>parseSemanticProject(JSON.stringify(project)),/supported UI expression/);
 assert.throws(()=>richTextTemplate({kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'[[bad',css:{}}]}]},()=>{throw new Error('invalid expression');}),/invalid expression/);
});
