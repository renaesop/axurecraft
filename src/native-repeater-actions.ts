import {field,items,object,prop,number,str,bool,type Graph,type Value} from './graph.ts';
import {nativeExpressions} from './native-expression.ts';
import type {Action,RepeaterAction,RepeaterCellValue,GlobalVariable} from './model.ts';
const specs:Record<string,[string,string,RepeaterAction['operation']]>={
 InteractionAddFilterToRepeaterAction:['RepeaterPaths','AddFilterInfos','filter'],
 InteractionRemoveFilterFromRepeaterAction:['repeater-paths','remove-filter-infos','remove-filter'],
 InteractionRemoveSortFromRepeaterAction:['repeater-paths','remove-sort-infos','remove-sort'],
 InteractionAddItemsToDataSetAction:['RepeaterPaths','AddItemInfos','add'],
 InteractionDeleteItemsFromDataSetAction:['RepeaterPaths','DeleteItemInfos','delete'],
 InteractionUpdateEditItemsInDataSetAction:['RepeaterPaths','UpdateItemInfos','update'],
 InteractionModifyDataSetEditItemsAction:['RepeaterPaths','ModifyItemInfos','mark'],
};
export function readRepeaterAction(g:Graph,owner:Value,action:Value,variables:GlobalVariable[],asset?:(v:Value|undefined)=>string|undefined):Action[]|undefined {
 const spec=specs[action.className?.split(/[:.]/).at(-1)??''];if(!spec)return;
 const paths=items(field(action.body,spec[0])),infos=items(field(action.body,spec[1]));
 if(paths.length!==infos.length||!paths.length)throw new Error('Repeater action parameter counts differ');
 return paths.map((path,index)=>{
  const target=nativeExpressions(g,owner,variables).target(object(g,path)),repeater=[...g.objects.values()].find(w=>`w-${g.guids[w.id!-1]}`===target),data=prop(g,repeater,'Data');
  if(!data)throw new Error('Repeater action target dataset is missing');
  const expressions=nativeExpressions(g,owner,variables,data),info=object(g,infos[index]);if(!info)throw new Error('Repeater parameters missing');
  const r:RepeaterAction={operation:spec[2]};
  const compile=(ref:Value|undefined)=>expressions.compile(object(g,ref),target);
  const cell=(type:number,value:Value|undefined,image?:Value):RepeaterCellValue=>{
   if(type===0)return {kind:'text',value:str(value)};
   if(type===2){const src=asset?.(image??value);if(!src)throw new Error('Missing repeater action image');return {kind:'image',asset:src};}
   if(type===3)return {kind:'expression',expression:compile(value)};
   throw new Error(`Unsupported repeater mutation cell ${type}`);
  };
  if(r.operation==='filter'){r.label=str(field(info.body,'Label'));r.clear=bool(field(info.body,'RemoveOtherFilters'));r.condition=compile(field(info.body,'Filter'));}
  else if(r.operation==='remove-filter'||r.operation==='remove-sort'){r.label=str(field(info.body,r.operation==='remove-sort'?'label':'filter-name'));r.clear=bool(field(info.body,'remove-all'));}
  else if(r.operation==='mark'){
   r.selection=({1:'this',2:'all',3:'rule'} as const)[number(field(info.body,'AddItemType')) as 1|2|3];r.mark=bool(field(action.body,'Add'));
   if(r.selection==='rule')r.condition=compile(field(info.body,'Rule'));
  }else if(r.operation==='delete'||r.operation==='update'){
   r.selection=({1:'this',2:'rule',3:'marked'} as const)[number(field(info.body,'SelectionType')) as 1|2|3];
   if(r.selection==='rule')r.condition=compile(field(info.body,'Rule'));
   if(r.operation==='update'){
    const ids=items(field(info.body,'actual')),values=items(field(info.body,'update-data'));
    if(ids.length!==values.length)throw new Error('Updated columns and values differ');
    r.values=Object.fromEntries(ids.map((id,i)=>[String(number(id)),cell(number(field(values[i],'Type')),field(values[i],'Literal')??field(values[i],'Text'),field(values[i],'Image'))]));
   }
  }else if(r.operation==='add'){
   const added=prop(g,info,'add-data-set'),actual=items(field(info.body,'actual')),aliases=items(field(info.body,'add'));
   if(!added||actual.length!==aliases.length)throw new Error('Added dataset column mapping is invalid');
   const mapping=new Map(aliases.map((id,i)=>[number(id),number(actual[i])]));
   r.rows=items(field(added.body,'rows')).map(ref=>{
    const row=object(g,ref);return Object.fromEntries(items(field(row?.body,'elements')).map(ref=>{
     const e=object(g,ref),id=mapping.get(number(field(e?.body,'column-id')));if(id===undefined)throw new Error('Added column has no destination');
     return [String(id),cell(number(field(e?.body,'type')),field(e?.body,'value'),field(e?.body,'value-image'))];
    }));
   });
  }
  if(['mark','delete','update'].includes(r.operation)&&!r.selection)throw new Error('Unknown repeater row selection');
  return {kind:'repeater-data',target,repeaterAction:r};
 });
}
