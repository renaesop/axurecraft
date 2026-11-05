import type {Action, RichText, RichTextTemplate, UIExpression} from './model.ts';
import {evaluateExpression, type ExpressionContext} from './expression.ts';

export const richTextValue = (text:RichText):string => text.paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n');

export function evaluateRichText(template:RichTextTemplate, context:ExpressionContext):RichText|undefined {
  let valid=true;
  const result:RichText={...template,paragraphs:template.paragraphs.map(p=>({...p,runs:p.runs.map(({expression,...run})=>{
    if(!expression)return {...run};
    const value=evaluateExpression(expression,context);
    if(value===undefined)valid=false;
    return {...run,text:String(value??'')};
  })}))};
  return valid?result:undefined;
}

/** Used by master/repeater instantiation and broadcasts; never mutate shared templates. */
export function mapRichText(template:RichTextTemplate, expression:(e:UIExpression)=>UIExpression, actions?:(a:Action[])=>void):RichTextTemplate {
  const result=structuredClone(template);
  for(const p of result.paragraphs)for(const r of p.runs){
    if(r.expression)r.expression=expression(r.expression);
    for(const b of r.link?.behaviors??[])actions?.(b.actions);
  }
  return result;
}

/** Native plain Set Text keeps the first paragraph/run's formatting, drops other runs. */
export function plainRichText(previous:RichText, value:string):RichText {
  const p=previous.paragraphs[0];
  return {...previous,paragraphs:[{css:{...p?.css},runs:[{text:value,css:{...p?.runs[0]?.css}}]}]};
}
