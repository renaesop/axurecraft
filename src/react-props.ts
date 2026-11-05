import type {Css} from './model.ts';
export function reactStyle(css:Css):Record<string,string>{
  return Object.fromEntries(Object.entries(css).map(([key,value])=>[key.startsWith('--')?key:key==='float'?'cssFloat':key.replace(/^-ms-/,'ms-').replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase()),value]));
}
export const reactAttribute=(name:string):string=>name==='class'?'className':name==='readonly'?'readOnly':name==='maxlength'?'maxLength':name==='value'?'defaultValue':name==='checked'?'defaultChecked':/^(aria|data)-/.test(name)?name:name.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());
