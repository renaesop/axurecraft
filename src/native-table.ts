import {field,items,number,object,type Graph,type Value} from './graph.ts';
import {argb} from './styles.ts';
import type {Css,Widget} from './model.ts';

export function readTable(g:Graph,w:Value):{table:NonNullable<Widget['table']>;cellIds:number[]} {
  const rows=number(field(w.body,'rows')),columns=number(field(w.body,'columns'));
  const rowHeights=items(field(w.body,'row-heights')).map(v=>number(v,NaN));
  const columnWidths=items(field(w.body,'column-widths')).map(v=>number(v,NaN));
  const cells=items(field(w.body,'cells')).map(ref=>object(g,ref));
  if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rowHeights.length!==rows||columnWidths.length!==columns||cells.length!==rows*columns||[...rowHeights,...columnWidths].some(n=>!Number.isFinite(n)||n<0)||cells.some(c=>c?.className!=='Axure:DiagramObject:TableCell')||new Set(cells.map(c=>c!.id)).size!==cells.length)
    throw new Error('Native table has inconsistent tracks or unresolved/duplicate cells');
  return {table:{rowHeights,columnWidths},cellIds:cells.map(c=>c!.id!)};
}

/** Per-edge cell fields are independent of the generic border style. Paint on an
 * overlay so borders never reduce the text box or double its padding. */
export function tableCellCss(w:Value,css:Css):void {
  for(const side of ['left','top','right','bottom']){
    css[`--rp-cell-${side}-width`]=`${Math.max(0,number(field(w.body,side+'-border-width'),parseFloat(css['border-width'])||0))}px`;
    const color=field(w.body,side+'-border-color');
    css[`--rp-cell-${side}-color`]=color?argb(number(color)):css['border-color']??'transparent';
  }
  css['border-width']='0px';
}
