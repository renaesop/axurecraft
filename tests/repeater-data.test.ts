import assert from 'node:assert/strict';import {test} from 'node:test';
import {initialRepeaterState,updateRepeaterState,selectRepeaterRows,materializeRepeater} from '../src/repeater-model.ts';
import type {RepeaterData,RepeaterAction} from '../src/model.ts';
const data:RepeaterData={columns:[{id:1,name:'Name'}],rows:['Ada','Bob','Cid'].map((name,i)=>({id:String(i+1),cells:{'1':{kind:'text',value:name}}})),template:[],bindings:[],isolateRadioGroups:true,templateSource:{record:0,objectId:0,guid:'',className:''},layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:0,pageSize:2,startPage:1,wrap:0,paddingLeft:0,paddingTop:0}};
test('filter, update, mark, delete and add compose without mutating the canonical data',()=>{
 const original=structuredClone(data);let state=initialRepeaterState(data);
 const apply=(r:RepeaterAction)=>{state=updateRepeaterState(data,state,{kind:'repeater-data',repeaterAction:r});};
 apply({operation:'filter',label:'name',condition:{kind:'binary',operator:'!=',left:{kind:'column',columnId:1},right:{kind:'literal',value:'Bob'}}});assert.deepEqual(selectRepeaterRows(data,state).map(r=>r.id),['1','3']);
 apply({operation:'mark',selection:'this',rowId:'3',mark:true});const revision=state.revision;
 apply({operation:'mark',selection:'this',rowId:'1',mark:true});assert.equal(state.revision,revision);
 apply({operation:'update',selection:'marked',values:{'1':{kind:'expression',expression:{kind:'concat',parts:[{kind:'column',columnId:1},{kind:'literal',value:'!'}]}}}});assert.deepEqual(selectRepeaterRows(data,state).map(r=>r.cells['1']),[{kind:'text',value:'Ada!'},{kind:'text',value:'Cid!'}]);
 apply({operation:'delete',selection:'marked'});assert.equal(selectRepeaterRows(data,state).length,0);assert.deepEqual(state.marked,[]);
 apply({operation:'remove-filter',label:'name'});assert.equal(selectRepeaterRows(data,state)[0].id,'2');
 apply({operation:'add',rows:[{'1':{kind:'text',value:'Dee'}},{'1':{kind:'text',value:'Eve'}}]});state=updateRepeaterState(data,state,{kind:'repeater-page',value:'last'});assert.equal(selectRepeaterRows(data,state)[0].cells['1'].kind,'text');assert.equal(state.page,2);
 apply({operation:'delete',selection:'all'});assert.equal(state.page,1);assert.deepEqual(data,original);
});
test('sort removal uses label and filters survive sort/page actions',()=>{
 let state=updateRepeaterState(data,undefined,{kind:'repeater-sort',sort:{columnId:1,ascending:false,type:'text',label:'descending'}});
 assert.equal(selectRepeaterRows(data,state)[0].id,'3');
 state=updateRepeaterState(data,state,{kind:'repeater-data',repeaterAction:{operation:'remove-sort',label:'descending'}});assert.equal(selectRepeaterRows(data,state)[0].id,'1');
});
