import type {Css,WidgetContent,Widget} from './model.ts';
export interface AdaptiveView {id:string;name:string;width:number;height:number;parent?:string}
export interface AdaptiveLayout {width:number;height:number;contentLeft?:number;alignment?:'left'|'center';background:string}
export interface AdaptiveDefinition {defaultId:string;views:AdaptiveView[];layouts:Record<string,AdaptiveLayout>}
export interface AdaptivePaint {x:number;y:number;width:number;height:number;css:Css;content:WidgetContent[];variants?:Widget['variants']}
/** RP9 chooses the largest fitting width, with height breaking equal-width ties. */
export function chooseAdaptiveView(definition:Pick<AdaptiveDefinition,'defaultId'|'views'>,width:number,height:number):string {
 const base=definition.views.find(v=>v.id===definition.defaultId)??definition.views[0];if(!base)return definition.defaultId;
 let greater:AdaptiveView|undefined=width>=base.width?base:undefined,less=base;
 for(const view of definition.views){
  if(width>=view.width&&(!greater||view.width>greater.width||view.width===greater.width&&(greater.height<=height?view.height>greater.height&&view.height<=height:view.height<greater.height)))greater=view;
  if(width<=(view.width||1000000)&&((view.width||1000000)<(less.width||1000000)||(view.width||1000000)===(less.width||1000000)&&(view.height||1000000)<(less.height||1000000)))less=view;
 }
 return (greater??less).id;
}
export function adaptiveChain(views:AdaptiveView[],id:string):string[] {
 const result:string[]=[],seen=new Set<string>();let current=views.find(v=>v.id===id);
 while(current){if(seen.has(current.id))throw new Error('Cyclic adaptive view inheritance');seen.add(current.id);result.unshift(current.id);if(current.parent===current.id)break;current=views.find(v=>v.id===current!.parent);}
 return result;
}
