import {flowCanvasCase} from './flow-canvas.ts';
/** Original whole-canvas fixture with a rotated object to exercise the explicit resize boundary. */
export function canvasResizeCase(){
 const page=flowCanvasCase();
 const entry=page.widgets.find(w=>w.id==='entry')!;
 const vector=structuredClone(page.widgets.find(w=>w.connection)!.content.find(c=>c.kind==='vector')!);
 vector.width=entry.width;vector.height=entry.height;vector.markers=[];vector.gradients=[];
 vector.paths=[{data:'M 0 0 L 140 0 L 140 44 L 0 44 Z',fill:'#eef3fa',stroke:'#345',strokeWidth:1}];
 entry.content.unshift(vector);
 const note=structuredClone(page.widgets.find(w=>w.id==='isolated')!);
 page.widgets.push({...note,id:'rotated',x:-100,y:-60,css:{...note.css,transform:'rotate(30deg)'}});
 return page;
}
