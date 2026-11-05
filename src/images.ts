import type {ImageState} from './model.ts';
export function isImageUrl(value:string):boolean {
 if(value==='')return true;
 const compact=value.replace(/[\u0000-\u0020\u007f]/g,'');
 return !/^[a-z][a-z\d+.-]*:/i.test(compact)||/^https?:/i.test(compact)||/^data:image\/(png|jpeg|gif|webp);base64,/i.test(compact);
}
export function currentImage(base:Partial<Record<ImageState,string|null>>|undefined,overrides:Partial<Record<ImageState,string>>|undefined,state:{disabled?:boolean;selected?:boolean;selectedPaint?:boolean;hovered?:boolean;pressed?:boolean},fallback?:string|null):string|null|undefined {
 const order:ImageState[]=[...(state.disabled?['disabled' as const]:[]),...(state.selectedPaint??state.selected?['selected' as const]:[]),...(!state.disabled&&state.pressed?['pressed' as const]:[]),...(!state.disabled&&state.hovered?['hover' as const]:[]),'normal'];
 for(const name of order){if(overrides?.[name]!==undefined)return overrides[name];if(base?.[name])return fallback??base[name];}
 return fallback;
}
