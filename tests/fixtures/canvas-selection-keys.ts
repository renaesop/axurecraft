import {canvasLayersCase} from './canvas-layers.ts';
/** Original fixture: a hidden container must not expose its visible children to select-all. */
export function canvasSelectionKeysCase(){
 const page=canvasLayersCase();
 page.widgets.find(w=>w.id==='group')!.css.display='none';
 return page;
}
