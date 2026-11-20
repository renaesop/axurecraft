import {canvasLayersCase} from './canvas-layers.ts';
/** Original pages deliberately share widget IDs to catch cross-page session leakage. */
export function canvasPageSessionCases(){
 return ['session-a','session-b'].map((id,i)=>{
  const page=canvasLayersCase();page.id=id;page.name=id;
  page.widgets.find(w=>w.id==='entry')!.x=300+i*100;
  return page;
 });
}
