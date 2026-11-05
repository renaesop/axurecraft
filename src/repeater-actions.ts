import type {RepeaterData,RepeaterState,RepeaterAction,DataCell,RepeaterCellValue,UIExpression} from './model.ts';
import {evaluateExpression,axureBoolean} from './expression.ts';
type Row=RepeaterData['rows'][number];
const evaluate=(expression:UIExpression,row:Row)=>evaluateExpression(expression,{readWidget:()=>undefined,readColumn:id=>{const c=row.cells[String(id)];return c?.kind==='text'?c.value:c?.kind==='image'?c.asset??'':undefined;}});
export function filteredRows(data:RepeaterData,state:RepeaterState):Row[]{
 return (state.rows??data.rows).filter(row=>(state.filters??[]).every(filter=>!!axureBoolean(evaluate(filter.condition,row))));
}
function cells(values:Record<string,RepeaterCellValue>,row:Row):Record<string,DataCell>{
 return Object.fromEntries(Object.entries(values).flatMap(([id,value])=>{
  if(value.kind!=='expression')return [[id,value]];
  const result=evaluate(value.expression,row);return result===undefined?[]:[[id,{kind:'text',value:String(result)}]];
 }));
}
/** Immutable dataset mutations; original RP rows remain untouched and serializable. */
export function mutateRepeater(data:RepeaterData,state:RepeaterState,action:RepeaterAction):RepeaterState {
 const rows=state.rows??data.rows,marked=new Set(state.marked??[]);
 const matches=(row:Row)=>action.selection==='all'||action.selection==='this'&&row.id===action.rowId||action.selection==='marked'&&marked.has(row.id)||action.selection==='rule'&&!!action.condition&&!!axureBoolean(evaluate(action.condition,row));
 let next={...state,revision:state.revision+1};
 if(action.operation==='filter'&&action.condition){const label=action.label??'';next.filters=[...(action.clear?[]:(state.filters??[]).filter(f=>f.label!==label)),{label,condition:action.condition}];}
 if(action.operation==='remove-filter')next.filters=action.clear?[]:(state.filters??[]).filter(f=>f.label!==action.label);
 if(action.operation==='remove-sort')next.sorts=action.clear?[]:state.sorts.filter(s=>s.label!==action.label);
 if(action.operation==='mark'){
  for(const row of rows)if(matches(row)){if(action.mark!==false)marked.add(row.id);else marked.delete(row.id);}
  return {...state,marked:[...marked]}; // Marking alone must not reload row widgets.
 }
 if(action.operation==='delete'){next.rows=rows.filter(row=>!matches(row));next.marked=[...marked].filter(id=>next.rows!.some(row=>row.id===id));}
 if(action.operation==='update')next.rows=rows.map(row=>matches(row)?{...row,cells:{...row.cells,...cells(action.values??{},row)}}:row);
 if(action.operation==='add'){
  let sequence=state.nextRowId??1;const used=new Set(rows.map(r=>r.id));
  const added=(action.rows??[]).map(values=>{let id:string;do{id=`new-${sequence++}`;}while(used.has(id));used.add(id);return {id,cells:cells(values,{id,cells:{}})};});
  next.rows=[...rows,...added];next.nextRowId=sequence;
 }
 const count=filteredRows(data,next).length,last=data.layout.pageSize?Math.max(1,Math.ceil(count/data.layout.pageSize)):1;
 next.page=Math.max(1,Math.min(last,next.page));return next;
}
