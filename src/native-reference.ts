import {field,items,number,object,str,type Graph,type Value} from './graph.ts';
export interface NativeReference {graph:Graph;widget:Value}
export interface NativeColumn {id:number;name:string;guid:string}
export interface NativeContext {stateNames?:Map<string,string>;references?:Map<string,NativeReference>;columns?:NativeColumn[]}
export function datasetColumns(graph:Graph,data:Value):NativeColumn[]{
 return items(field(data.body,'columns')).map(ref=>{const c=object(graph,ref),id=number(field(c?.body,'variable-id'),-1);return {id,name:str(field(c?.body,'name')),guid:graph.guids[id-1]??''};});
}
export function nativeColumnId(graph:Graph,id:number,columns:NativeColumn[]):number {
 const guid=graph.guids[id-1],column=columns.find(c=>guid&&c.guid===guid);
 if(!column)throw new Error(`Unresolved target dataset column ${guid??id}`);return column.id;
}
