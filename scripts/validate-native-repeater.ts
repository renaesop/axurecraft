import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {selectRepeaterRows,updateRepeaterState,initialRepeaterState} from '../src/repeater-model.ts';
import type {RepeaterData,Action} from '../src/model.ts';
const sourcePath=process.env.AXURE_REPEATER_JS??'/Volumes/Axure RP 9/Axure RP 9.app/Contents/Resources/DefaultSettings/Prototype_Files/resources/scripts/axure/repeater.js';
const source=readFileSync(sourcePath,'utf8');
const first=source.slice(0,source.indexOf('// ******* Dynamic Panel Manager'));
const end=first.lastIndexOf('});');assert.ok(end>0);
// Expose only fixture setup and existing native query functions. Sorting/page implementations are unchanged.
const instrumented=first.slice(0,end)+`
_repeaterManager.__fixture={
 reset:function(rows,size,page){repeaterToCurrentDataSet.fixture=rows;repeaterToSorts.fixture=[];repeaterToFilters.fixture=[];repeaterToActiveDataSet.fixture=getActiveDataSet('fixture');repeaterToPageInfo.fixture=size?{itemsPerPage:size,currPage:page}:{noLimit:true};},
 visible:function(){var ids=getOrderedIds('fixture',{});var bounds=_getVisibleDataBounds(repeaterToPageInfo.fixture,ids.length);return ids.slice(bounds[0],bounds[1]);}
};
`+first.slice(end);
const ax:any={deepCopy:(v:unknown)=>JSON.parse(JSON.stringify(v)),splice:(a:any[],...args:any[])=>a.splice(args[0],args[1]),expr:{evaluateExpr:(v:unknown)=>v}};
const context=vm.createContext({$axure:{internal:(fn:Function)=>fn(ax)},console});
vm.runInContext(instrumented,context,{timeout:1000,filename:sourcePath});
let seed=1729;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const values=['','0','00','1','01','-4','20','3.5','100','2e2','invalid',' A ','b','B'];
let checks=0;
for(let fixture=0;fixture<100;fixture++){
  const data:RepeaterData={columns:[{id:1,name:'a'},{id:2,name:'b'}],rows:Array.from({length:Math.floor(rand()*18)},(_,i)=>({id:String(i),cells:{'1':{kind:'text',value:values[Math.floor(rand()*values.length)]},'2':{kind:'text',value:values[Math.floor(rand()*values.length)]}}})),bindings:[],template:[],isolateRadioGroups:true,layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:0,pageSize:fixture%5===0?0:1+Math.floor(rand()*5),startPage:1,wrap:0,paddingLeft:0,paddingTop:0},templateSource:{record:0,objectId:0,guid:'',className:'fixture'}};
  const rows=data.rows.map(r=>Object.fromEntries(Object.entries(r.cells).map(([k,c])=>[k,{text:c.kind==='text'?c.value:''}])));
  ax.repeater.__fixture.reset(rows,data.layout.pageSize,1);let state=initialRepeaterState(data);
  for(let step=0;step<20;step++){
    const action:Action=step%3===0?{kind:'repeater-page',value:['next','previous','last',0,999,2][Math.floor(rand()*6)]}:{kind:'repeater-sort',sort:{columnId:rand()<0.5?1:2,type:rand()<0.5?'number':'text',ascending:rand()<0.5,toggle:rand()<0.5,label:''}};
    state=updateRepeaterState(data,state,action);
    if(action.sort)ax.repeater.addSort('fixture','',String(action.sort.columnId),action.sort.ascending,action.sort.toggle,action.sort.type==='number'?'Number':'Text');
    else ax.repeater.setRepeaterToPage('fixture',action.value==='next'?'Next':action.value==='previous'?'Previous':action.value==='last'?'Last':'Value',action.value,{});
    const expected=Array.from(ax.repeater.__fixture.visible(),(n:any)=>String(n-1));
    assert.deepEqual(selectRepeaterRows(data,state).map(r=>r.id),expected,`native mismatch fixture ${fixture}, step ${step}`);checks++;
  }
}
const report={passed:true,checks,fixtures:100,seed:1729,sourcePath,sourceSha256:createHash('sha256').update(source).digest('hex'),method:'Execute original RP9 shipped repeater module in isolated VM with fixture setup instrumentation; native comparator and paging functions unchanged',scope:'Number/text multi-sort priority, toggles, empty/invalid numeric cells, stable IDs, page boundaries, unlimited rows. No native DOM or screenshot equivalence asserted.'};
writeFileSync('research/native-repeater-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
