import {canvasIndex} from '../../src/flow-canvas-model.ts';
import {canvasResizeCase} from './canvas-resize.ts';
export function canvasObjectsCase(){
 const page=canvasResizeCase(),note=page.widgets.find(w=>w.id==='isolated')!;
 const text=note.content.find(c=>c.kind==='text')!;text.paragraphs[0].runs[0].text='isolated';
 // The base flow fixture reuses one marker for its free-end illustration.
 // Give this duplication fixture independent authored marker identities.
 for(const {widget} of canvasIndex(page).values())for(const c of widget.content)if(c.kind==='vector'){
  const map=new Map(c.markers.map((m,i)=>[m.id,widget.id+'-marker-'+i]));
  for(const marker of c.markers)marker.id=map.get(marker.id)!;
  for(const path of c.paths){if(path.markerStart)path.markerStart=map.get(path.markerStart)??path.markerStart;if(path.markerEnd)path.markerEnd=map.get(path.markerEnd)??path.markerEnd;}
 }
 return page;
}
