import type {Scalar} from './model.ts';
/** Explicit arities and dispatch; prototype properties and arbitrary calls are never exposed. */
export const formulaMethods={slice:2,toFixed:1,substring:2,substr:2,charAt:1,indexOf:2,lastIndexOf:2,toLowerCase:0,toUpperCase:0,trim:0,replace:2,getFullYear:0,getMonth:0,getDate:0,getDay:0,getHours:0,getMinutes:0,getSeconds:0,getMilliseconds:0,getTime:0} as const;
export type FormulaMethod=keyof typeof formulaMethods;
export function callFormulaMethod(method:FormulaMethod,value:Scalar,args:Scalar[],now?:number):Scalar|undefined {
 const text=String(value),start=Number(args[0]??0),end=args.length>1?Number(args[1]):undefined;
 switch(method){
  case 'slice':return text.slice(start,end);
  case 'substring':return text.substring(start,end);
  case 'substr':return text.substr(start,end);
  case 'charAt':return text.charAt(start);
  case 'indexOf':return text.indexOf(String(args[0]??''),end);
  case 'lastIndexOf':return text.lastIndexOf(String(args[0]??''),end);
  case 'toLowerCase':return text.toLowerCase();
  case 'toUpperCase':return text.toUpperCase();
  case 'trim':return text.trim();
  case 'replace':return text.replace(String(args[0]??''),String(args[1]??''));
  case 'toFixed':return Number.isInteger(start)&&start>=0&&start<=100?Number(value).toFixed(start):undefined;
  default:{const date=new Date(now??(typeof value==='boolean'?Number(value):value));if(!Number.isFinite(date.getTime()))return undefined;return date[method]();}
 }
}
