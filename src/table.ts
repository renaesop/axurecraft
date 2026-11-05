import type {Widget} from './model.ts';

/** Tracks are authoritative: resizing one column moves every cell in later columns. */
export function layoutTable(widget:Widget):Widget {
  if(!widget.table)return widget;
  const {rowHeights,columnWidths}=widget.table;
  if(!rowHeights.length||!columnWidths.length||rowHeights.length*columnWidths.length!==(widget.children??[]).length)
    throw new Error(`Invalid table ${widget.id}: track and cell counts differ`);
  const offsets=(tracks:number[])=>{let total=0;return tracks.map(n=>{if(!Number.isFinite(n)||n<0)throw new Error(`Invalid table ${widget.id}: negative or nonfinite track`);const offset=total;total+=n;return offset;});};
  const xs=offsets(columnWidths),ys=offsets(rowHeights);
  return {...widget,width:columnWidths.reduce((a,b)=>a+b,0),height:rowHeights.reduce((a,b)=>a+b,0),children:widget.children!.map((cell,i)=>{
    const row=Math.floor(i/columnWidths.length),column=i%columnWidths.length;
    return {...cell,x:xs[column],y:ys[row],width:columnWidths[column],height:rowHeights[row]};
  })};
}
export function tableRows(widget:Widget):Widget[][] {
  if(!widget.table)return [];
  return widget.table.rowHeights.map((_,i)=>widget.children!.slice(i*widget.table!.columnWidths.length,(i+1)*widget.table!.columnWidths.length));
}
