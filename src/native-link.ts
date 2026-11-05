import {field,number,str,prop,type Graph,type Value} from './graph.ts';
import {nativeExpressions} from './native-expression.ts';
import {isNavigationUrl} from './navigation.ts';
import type {Action,GlobalVariable} from './model.ts';

export function readLinkTarget(g:Graph,owner:Value,dest:Value|undefined,pageByGuid:Map<string,string>,variables:GlobalVariable[]=[]):Action {
  const kind=number(field(dest?.body,'target-type'),-1);
  if(kind===2)return {kind:'refresh',includeVariables:true};
  if(kind===3)return {kind:'back'};
  if(kind===1){
    const index=field(dest?.body,'target-page-id')?.values?.[1];
    const file=typeof index==='number'?pageByGuid.get(g.guids[index-1]):undefined;
    if(!file)throw new Error('Target page could not be resolved');
    return {kind:'link',value:file,includeVariables:true};
  }
  if(kind!==0)throw new Error(`Unknown navigation kind ${kind}`);
  const literal=field(dest?.body,'target-literal');
  const expression=literal?.tag===8?{kind:'literal' as const,value:str(literal)}:nativeExpressions(g,owner,variables).compile(prop(g,dest,'target-literal'));
  if(expression.kind==='literal'){
    const value=String(expression.value);if(!isNavigationUrl(value))throw new Error('Unsupported navigation URL scheme');
    return {kind:'link',value};
  }
  return {kind:'link',expression};
}
