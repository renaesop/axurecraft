import {filteredRows,mutateRepeater} from './repeater-actions.ts';
import {bindExpression} from './expression.ts';
import {layoutTree} from './tree.ts';
import {layoutTable} from './table.ts';
import {motionAxes} from './motion.ts';
import type {Action,DataCell,Page,RepeaterData,RepeaterSort,RepeaterState,RowExpression,Widget,WidgetProperty} from './model.ts';

export function evaluateRowExpression(expression:RowExpression,cells:Record<string,DataCell>):DataCell|undefined {
  if(expression.kind==='literal')return {kind:'text',value:expression.value};
  if(expression.kind==='column')return cells[String(expression.columnId)];
  const parts=expression.parts.map(p=>evaluateRowExpression(p,cells));
  return parts.every(p=>p?.kind==='text')?{kind:'text',value:parts.map(p=>(p as {value:string}).value).join('')}:undefined;
}
export const initialRepeaterState=(data:RepeaterData):RepeaterState=>({page:data.layout.startPage,sorts:[],revision:0});
export function updateRepeaterState(data:RepeaterData,current:RepeaterState|undefined,action:Action):RepeaterState {
  const previousState=current??initialRepeaterState(data);
  if(action.kind==='repeater-data'&&action.repeaterAction)return mutateRepeater(data,previousState,action.repeaterAction);
  const state={...previousState,revision:previousState.revision+1};
  if(action.kind==='repeater-sort'&&action.sort){
    const previous=state.sorts.find(s=>s.columnId===action.sort!.columnId);
    const sort={...action.sort,ascending:action.sort.toggle&&previous?!previous.ascending:action.sort.ascending};
    return {...state,sorts:[...state.sorts.filter(s=>s.columnId!==sort.columnId),sort]};
  }
  if(action.kind==='repeater-page'){
    if(!data.layout.pageSize)return state;
    const last=Math.max(1,Math.ceil(filteredRows(data,state).length/data.layout.pageSize));
    const next=action.value==='next'?state.page+1:action.value==='previous'?state.page-1:action.value==='last'?last:Number(action.value);
    return {...state,page:Math.max(1,Math.min(last,Number.isFinite(next)?Math.floor(next):1))};
  }
  return state;
}
function compareRows(a:RepeaterData['rows'][number],b:RepeaterData['rows'][number],sorts:RepeaterSort[]):number {
  // Native RP9 wraps earlier sorts as tie-breakers: the most recently added sort has priority.
  for(let i=sorts.length-1;i>=0;i--){
    const sort=sorts[i],ca=a.cells[String(sort.columnId)],cb=b.cells[String(sort.columnId)];
    let ta=ca?.kind==='text'?ca.value:'',tb=cb?.kind==='text'?cb.value:'';
    if(sort.type==='text'){ta=ta.toLowerCase();tb=tb.toLowerCase();}
    if(ta===tb)continue;
    if(sort.type==='number'){
      const na=ta===''?NaN:Number(ta),nb=tb===''?NaN:Number(tb);
      if(Number.isNaN(na)&&Number.isNaN(nb))return 0;
      if(Number.isNaN(na)||Number.isNaN(nb))return Number.isNaN(na)?1:-1;
      // Preserve the native comparison of differently formatted equal numbers.
      return (na<nb)!==sort.ascending?1:-1;
    }
    return (ta<tb)!==sort.ascending?1:-1;
  }
  return 0;
}
/** Stable merge ordering also preserves native behavior for non-normalized numeric strings. */
function mergeSort<T>(items:T[],compare:(a:T,b:T)=>number):T[]{
  if(items.length<2)return items.slice();const middle=Math.floor(items.length/2);
  const a=mergeSort(items.slice(0,middle),compare),b=mergeSort(items.slice(middle),compare),result:T[]=[];
  let i=0,j=0;while(i<a.length&&j<b.length)result.push(compare(a[i],b[j])>0?b[j++]:a[i++]);return [...result,...a.slice(i),...b.slice(j)];
}
export function selectRepeaterRows(data:RepeaterData,state=initialRepeaterState(data)):RepeaterData['rows'] {
  const filtered=filteredRows(data,state),rows=state.sorts.length?mergeSort(filtered,(a,b)=>compareRows(a,b,state.sorts)):filtered;
  const size=data.layout.pageSize;
  if(size===0)return rows;
  const page=Math.min(Math.max(1,state.page),Math.max(1,Math.ceil(rows.length/size)));
  return rows.slice((page-1)*size,page*size);
}
export function flattenWidgets(widgets:Widget[]):Widget[]{return widgets.flatMap(w=>[w,...flattenWidgets(w.children??[]),...(w.states??[]).flatMap(s=>flattenWidgets(s.widgets))]);}
const contentArrays=(w:Widget)=>[...new Set([w.content,...Object.values(w.variants??{}).flatMap(v=>v.content?[v.content]:[]),...Object.values(w.adaptive??{}).flatMap(p=>[p.content,...Object.values(p.variants??{}).flatMap(v=>v.content?[v.content]:[])])])];
export interface MaterializedRow {key:string;widgets:Widget[]}
export function materializeRepeater(id:string,data:RepeaterData,state=initialRepeaterState(data)):MaterializedRow[] {
  const rowWidth=Math.max(1,...data.template.map(w=>w.x+w.width));
  const rowHeight=Math.max(1,...data.template.map(w=>w.y+w.height));
  return selectRepeaterRows(data,state).map((row,index)=>{
    const widgets=materializeTables(structuredClone(data.template)),all=flattenWidgets(widgets),prefix=`${id}-row${row.id}-`,mapping=new Map<string,string>();
    for(const w of all){mapping.set(w.id,prefix+w.id);for(const s of w.states??[])mapping.set(s.id,prefix+s.id);for(const c of contentArrays(w).flat()){
      if(c.kind==='image'&&c.frame)mapping.set(c.frame.id,prefix+c.frame.id);
      if(c.kind==='vector'){for(const d of [...c.gradients,...c.markers])mapping.set(d.id,prefix+d.id);}
    }}
    if(widgets[0]&&data.itemLoad?.length)widgets[0].behaviors.push(...structuredClone(data.itemLoad));
    const mapped=(value:string):string=>mapping.get(value)??value;
    const paint=(value:string):string=>value.replace(/^url\(#(.+)\)$/,(_,id:string)=>`url(#${mapped(id)})`);
    for(const w of all){
      w.instance={repeaterId:id,rowId:row.id,templateId:w.id};
      w.id=mapped(w.id);if(w.menu)w.menu.trigger=mapped(w.menu.trigger);
      if(w.tree){w.tree.nodes=w.tree.nodes.map(mapped);if(w.tree.toggleId)w.tree.toggleId=mapped(w.tree.toggleId);if(w.tree.labelId)w.tree.labelId=mapped(w.tree.labelId);}
      if(w.selectionGroup && data.isolateSelectionGroups !== false) w.selectionGroup=prefix+w.selectionGroup;
      for(const s of w.states??[])s.id=mapped(s.id);
      const bindActions=(actions:Action[]):void=>{for(const a of actions){
        if(a.target)a.target=mapped(a.target);if(a.popup?.source)a.popup.source=mapped(a.popup.source);
        if(a.kind==='state'&&typeof a.value==='string')a.value=mapped(a.value);
        const column=(id:number)=>{const cell=row.cells[String(id)];return cell?.kind==='text'?cell.value:cell?.kind==='image'?cell.asset??'':undefined;};
        if(a.expression)a.expression=bindExpression(a.expression,mapped,column,index+1);
        if(a.repeaterAction){
          const r=a.repeaterAction;if(r.selection==='this')r.rowId=row.id;
          if(r.condition)r.condition=bindExpression(r.condition,mapped,()=>undefined);
          for(const values of [r.values,...r.rows??[]])for(const value of Object.values(values??{}))if(value.kind==='expression')value.expression=bindExpression(value.expression,mapped,()=>undefined);
        }
        if(a.motion?.bounds)for(const [key,e]of Object.entries(a.motion.bounds))a.motion.bounds[key as 'left']=bindExpression(e,mapped,column,index+1);
        if(a.motion)for(const key of motionAxes)if(a.motion[key])a.motion[key]=bindExpression(a.motion[key]!,mapped,column,index+1);
        for(const branch of a.branches??[]){if(branch.condition)branch.condition=bindExpression(branch.condition,mapped,column,index+1);bindActions(branch.actions);}
      }};
      for(const b of w.behaviors)bindActions(b.actions);
      for(const c of contentArrays(w).flat()){
        const rich=c.kind==='text'?c:c.kind==='control'?c.richLabel:undefined;
        for(const p of rich?.paragraphs??[])for(const r of p.runs)for(const b of r.link?.behaviors??[])bindActions(b.actions);
        if(c.kind==='frame')c.name=mapped(c.name);
        if(c.kind==='image'&&c.frame)c.frame.id=mapped(c.frame.id);
        if(c.kind==='vector'){
          for(const d of [...c.gradients,...c.markers])d.id=mapped(d.id);
          for(const p of c.paths){p.fill=paint(p.fill);if(p.stroke)p.stroke=paint(p.stroke);if(p.markerStart)p.markerStart=mapped(p.markerStart);if(p.markerEnd)p.markerEnd=mapped(p.markerEnd);}
        }
        if(c.kind==='control'&&c.group&&data.isolateRadioGroups)c.group=prefix+c.group;
      }
      for(const binding of data.bindings){
        if(binding.targetGuid!==w.source.guid)continue;
        const value=evaluateRowExpression(binding.expression,row.cells);
        for(const content of contentArrays(w)){
        if(binding.property==='text'&&value?.kind==='text'){
          const text=content.find(c=>c.kind==='text');
          if(text){const p=text.paragraphs[0]??{css:{},runs:[]};text.paragraphs=[{css:p.css,runs:[{text:value.value,css:p.runs[0]?.css??{}}]}];}
          else {const control=content.find(c=>c.kind==='control');if(control)control.value=value.value;else content.push({kind:'text',css:{},paragraphs:[{css:{},runs:[{text:value.value,css:{}}]}]});}
        }else if(binding.property==='image'&&content===w.content){
          // Native Normal image bindings must not overwrite an explicitly authored state image.
          const asset=value?.kind==='image'?value.asset:value?.kind==='text'?value.value:undefined;
          if(asset){const image=content.find(c=>c.kind==='image');if(image)image.asset=asset;else content.unshift({kind:'image',asset,alt:w.name});}
        }
        }
      }
    }
    const primary=data.layout.wrap?index%data.layout.wrap:index,secondary=data.layout.wrap?Math.floor(index/data.layout.wrap):0;
    const x=data.layout.paddingLeft+(data.layout.direction==='horizontal'?primary:secondary)*(rowWidth+data.layout.horizontalSpacing);
    const y=data.layout.paddingTop+(data.layout.direction==='vertical'?primary:secondary)*(rowHeight+data.layout.verticalSpacing);
    for(const w of widgets){w.x+=x;w.y+=y;for(const [view,p]of Object.entries(w.adaptive??{})){const width=Math.max(1,...data.template.map(t=>(t.adaptive?.[view]?.x??t.x)+(t.adaptive?.[view]?.width??t.width))),height=Math.max(1,...data.template.map(t=>(t.adaptive?.[view]?.y??t.y)+(t.adaptive?.[view]?.height??t.height)));p.x+=data.layout.paddingLeft+(data.layout.direction==='horizontal'?primary:secondary)*(width+data.layout.horizontalSpacing);p.y+=data.layout.paddingTop+(data.layout.direction==='vertical'?primary:secondary)*(height+data.layout.verticalSpacing);p.css.left=p.x+'px';p.css.top=p.y+'px';}}
    return {key:row.id,widgets};
  });
}
export function materializeWidgets(widgets:Widget[],states:Record<string,RepeaterState>={}):Widget[]{
  return widgets.map(layoutTable).map(w=>w.tree?.root?layoutTree(w):w).map(w=>({...w,...(w.repeater?{children:materializeRepeater(w.id,w.repeater,states[w.id]).flatMap(row=>materializeWidgets(row.widgets,states))}:w.children?{children:materializeWidgets(w.children,states)}:{}),...(w.states?{states:w.states.map(s=>({...s,widgets:materializeWidgets(s.widgets,states)}))}:{})}));
}
export function materializeTables(widgets:Widget[]):Widget[]{return widgets.map(layoutTable).map(w=>w.tree?.root?layoutTree(w):w).map(w=>({...w,...(w.children?{children:materializeTables(w.children)}:{}),...(w.states?{states:w.states.map(s=>({...s,widgets:materializeTables(s.widgets)}))}:{})}));}
export function materializePage(page:Page,states:Record<string,RepeaterState>={}):Page {return {...page,widgets:materializeWidgets(page.widgets,states)};}

export function readRepeaterProperty(data:RepeaterData,state:RepeaterState|undefined,property:WidgetProperty):number|undefined {
 const current=state??initialRepeaterState(data),count=filteredRows(data,current).length;
 if(property==='dataCount')return (current.rows??data.rows).length;
 if(property==='itemCount')return count;
 if(property==='visibleItemCount')return selectRepeaterRows(data,current).length;
 if(property==='pageIndex')return current.page;
 if(property==='pageCount')return data.layout.pageSize?Math.ceil(count/data.layout.pageSize):1;
 return undefined;
}
