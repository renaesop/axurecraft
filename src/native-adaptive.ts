import {field,number,str,items,object,prop,type Graph,type Value} from './graph.ts';
import {styleProperties} from './styles.ts';
import type {AdaptiveView} from './adaptive.ts';
export function nativeViews(doc:Graph,page:Graph):{defaultId:string;views:AdaptiveView[]}|undefined {
 const setId=page.guids[number(field(page.root?.body,'AdaptiveViewSetId'))-1];
 const set=[...doc.objects.values()].find(o=>o.className==='Axure:AdaptiveViewSet'&&doc.guids[number(field(o.body,'Id'))-1]===setId);if(!set)return;
 const base=prop(doc,set,'DefaultAdaptiveView');if(!base)return;
 const view=(o:Value):AdaptiveView=>({id:doc.guids[number(field(o.body,'Id'))-1],name:str(field(o.body,'Name')),parent:doc.guids[number(field(o.body,'BaseViewId'))-1],width:number(field(field(o.body,'Size'),'Width')),height:number(field(field(o.body,'Size'),'Height'))});
 return {defaultId:view(base).id,views:[view(base),...items(field(set.body,'AdaptiveViews')).map(ref=>object(doc,ref)).filter((o):o is Value=>!!o).map(view)]};
}
export function adaptiveStyle(g:Graph,w:Value,chain:string[]):Map<number,Value> {
 const list=items(field(w.body,'AdaptiveStyles')),styles=new Map<string,Map<number,Value>>();
 for(let i=0;i+1<list.length;i+=2)styles.set(g.guids[number(list[i])-1],styleProperties(object(g,list[i+1]),true));
 return new Map(chain.flatMap(id=>[...styles.get(id)??[]]));
}
