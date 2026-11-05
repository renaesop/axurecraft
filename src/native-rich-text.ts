import {field,items,number,str,type Value} from './graph.ts';
import {textRunToCss} from './styles.ts';
import type {RichText,RichTextTemplate,TextRun,UIExpression} from './model.ts';

export function nativeInlineRuns(nodes:Value[],link?:Value):{run:Value;link?:Value}[] {
  return nodes.flatMap(run=>field(run,'Inlines')?nativeInlineRuns(items(field(run,'Inlines')),field(run,'Link')??link):[{run,link}]);
}
export function nativeParagraphCss(p:Value):Record<string,string> {
  const css:Record<string,string>={'text-align':['left','center','right','justify'][number(field(p,'HorizontalAlignment'))]??'left'};
  const spacing=number(field(p,'LineSpacing'));if(spacing>0)css['line-height']=`${spacing*4/3}px`;
  return css;
}
export function nativeAttributedText(value:Value|undefined,link?:(value:Value)=>TextRun['link']):RichText {
  if(!value||!field(value,'Paragraphs'))throw new Error('Rich text attributed-string-value is missing');
  return {kind:'text',css:{},paragraphs:items(field(value,'Paragraphs')).map(p=>({
    css:nativeParagraphCss(p),
    runs:nativeInlineRuns(items(field(p,'Inlines'))).map(({run,link:ref})=>({
      text:str(field(run,'Text')),css:textRunToCss(run),...(ref&&link?{link:link(ref)}:{}),
    })),
  }))};
}

/** An expression may span multiple runs after partial text styling in Axure's editor. */
export function richTextTemplate(text:RichText,compile:(text:string)=>UIExpression):RichTextTemplate {
  return {...text,paragraphs:text.paragraphs.map(p=>{
    const full=p.runs.map(r=>r.text).join('');
    if(!/\[\[|\]\]/.test(full))return p;
    compile(full); // Validate interpolation delimiters and every expression before emitting.
    const ranges=p.runs.map(run=>({run,start:0,end:0}));let offset=0;
    for(const r of ranges){r.start=offset;offset+=r.run.text.length;r.end=offset;}
    const runs:RichTextTemplate['paragraphs'][number]['runs']=[];
    const append=(start:number,end:number)=>{for(const r of ranges){const a=Math.max(start,r.start),b=Math.min(end,r.end);if(a<b)runs.push({...r.run,text:r.run.text.slice(a-r.start,b-r.start)});}};
    let cursor=0;
    for(const m of full.matchAll(/\[\[([\s\S]*?)\]\]/g)){
      append(cursor,m.index);const source=ranges.find(r=>r.start<=m.index&&r.end>m.index)!.run;
      runs.push({...source,text:'',expression:compile(m[0])});cursor=m.index+m[0].length;
    }
    append(cursor,full.length);return {...p,runs};
  })};
}
