import type {Css} from './model.ts';
import type {} from 'react';

// Image frames and table borders use CSS custom properties. Allow that valid
// namespace while keeping React's checks for ordinary property names and values.
declare module 'react' {
  interface CSSProperties {
    [name:`--${string}`]:string|number|undefined;
  }
}
export function reactStyle(css:Css):Record<string,string>{
  return Object.fromEntries(Object.entries(css).map(([key,value])=>[key.startsWith('--')?key:key==='float'?'cssFloat':key.replace(/^-ms-/,'ms-').replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase()),value]));
}
export const reactAttribute=(name:string):string=>name==='class'?'className':name==='tabindex'?'tabIndex':name==='readonly'?'readOnly':name==='maxlength'?'maxLength':name==='value'?'defaultValue':name==='checked'?'defaultChecked':/^(aria|data)-/.test(name)?name:name.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());
