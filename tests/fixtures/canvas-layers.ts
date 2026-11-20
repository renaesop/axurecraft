import {canvasObjectsCase} from './canvas-objects.ts';
export function canvasLayersCase(){
 const page=canvasObjectsCase(),template=page.widgets.find(w=>w.id==='isolated')!;
 for(const [id,color] of [['layer-red','#dd0000'],['layer-blue','#0000dd'],['layer-green','#00aa00']])page.widgets.push({
  ...structuredClone(template),id,name:id,x:900,y:700,width:120,height:80,css:{background:color},content:[]
 });
 return page;
}
