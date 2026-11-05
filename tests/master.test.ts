import assert from 'node:assert/strict';import {test} from 'node:test';
import {instantiateMaster} from '../src/master.ts';import {nestGroups} from '../src/groups.ts';import {materializeWidgets} from '../src/repeater-model.ts';import type {Widget} from '../src/model.ts';
const widget=(id:string):Widget=>({id,name:id,kind:'shape',type:'VectorShape',x:10,y:20,width:100,height:30,css:{},content:[],behaviors:[],source:{record:0,objectId:0,guid:id,className:'VectorShape'}});
test('master clones isolate identities and actions without changing external references or source templates',()=>{
 const first=widget('first'),second=widget('second');first.selectionGroup='choice';first.content=[{kind:'control',control:'radio',label:'Radio',value:'Radio',placeholder:'',disabled:false,readOnly:false,group:'radio'}];
 first.behaviors=[{event:'click',actions:[{kind:'branch',branches:[{condition:{kind:'widget',target:'second',property:'selected'},actions:[{kind:'set-text',target:'second',expression:{kind:'widget',target:'outside',property:'text'}}]}]},{kind:'state',target:'second',value:'state-b'}]}];second.states=[{id:'state-b',name:'B',widgets:[]}];
 const source=[first,second],saved=structuredClone(source),a=instantiateMaster(source,'a--'),b=instantiateMaster(source,'b--');assert.deepEqual(source,saved);
 assert.equal(a[0].selectionGroup,'a--choice');assert.equal(b[0].selectionGroup,'b--choice');assert.equal(a[0].content[0].kind==='control'&&a[0].content[0].group,'a--radio');
 assert.deepEqual(a[0].behaviors[0].actions[0].branches![0],{condition:{kind:'widget',target:'a--second',property:'selected'},actions:[{kind:'set-text',target:'a--second',expression:{kind:'widget',target:'outside',property:'text'}}]});assert.equal(a[0].behaviors[0].actions[1].value,'a--state-b');
 assert.equal(instantiateMaster(source,'c--',{radio:false,selection:false})[0].selectionGroup,'choice');
});
test('group reconstruction preserves already expanded master contents and repeater bindings',()=>{
 const child=widget('text'),master={...widget('master'),kind:'group' as const,type:'ReferenceDiagramObject',children:[child]},group={...widget('group'),kind:'group' as const,type:'Layer'};
 const result=nestGroups([group,master],new Map([['group',['master']]]));assert.equal(result[0].children![0].children![0],child);assert.equal(result[0].x+result[0].children![0].x,10);
 const repeater={...widget('rows'),kind:'repeater' as const,repeater:{columns:[{id:1,name:'Name'}],rows:[{id:'one',cells:{1:{kind:'text' as const,value:'Row content'}}}],bindings:[{property:'text' as const,targetGuid:'text',expression:{kind:'column' as const,columnId:1}}],template:[{...child,content:[{kind:'text' as const,css:{},paragraphs:[{css:{},runs:[{text:'',css:{}}]}]}]}],isolateRadioGroups:true,layout:{direction:'vertical' as const,horizontalSpacing:0,verticalSpacing:0,pageSize:0,startPage:1,wrap:0,paddingLeft:0,paddingTop:0},templateSource:child.source}};
 const instance=instantiateMaster([repeater],'master--');assert.equal(instance[0].repeater!.bindings[0].targetGuid,'text');const rows=materializeWidgets(instance);const rendered=rows[0].children![0].content[0];assert.equal(rendered.kind==='text'&&rendered.paragraphs[0].runs[0].text,'Row content');
});
