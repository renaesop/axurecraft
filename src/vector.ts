import type { VectorGraphic, VectorGradient, VectorMarker, VectorPath } from './model.ts';
import { field, number, items, plain, type Value } from './graph.ts';

interface Point { x: number; y: number }
interface Anchor { at: Point; incoming?: Point; outgoing?: Point; continues: boolean }
const fmt = (value: number): string => Number.isFinite(value) ? String(Number(value.toFixed(5))) : '0';
const xy = (point: Point): string => `${fmt(point.x)} ${fmt(point.y)}`;

function point(value: Value | undefined, width = 1, height = 1): Point | undefined {
  // The wire format uses NaN for absent Bezier handles; never turn these into (0,0).
  const x = number(field(value, 'X'), NaN), y = number(field(value, 'Y'), NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(x * width) || !Number.isFinite(y * height)) return;
  return { x: x * width, y: y * height };
}
function pathData(points: Value[], width: number, height: number): string {
  if (!points.length || points.length > 100_000) return '';
  const anchors: Anchor[] = [];
  for (const value of points) {
    const at = point(field(value, 'Path'), width, height);
    if (!at) return '';
    anchors.push({ at, incoming: point(field(value, 'LowerHandle'), width, height),
      outgoing: point(field(value, 'HigherHandle'), width, height),
      continues: field(value, 'HigherSegmentExists')?.value === true });
  }
  const gap = anchors.findIndex(a => !a.continues);
  // Starting after a gap avoids creating an accidental closing segment on open paths.
  const start = gap < 0 ? 0 : (gap + 1) % anchors.length;
  let d = `M ${xy(anchors[start].at)}`;
  const edge = (from: Anchor, to: Anchor): string => {
    if (!from.continues) return ` M ${xy(to.at)}`;
    if (from.outgoing || to.incoming) return ` C ${xy(from.outgoing ?? from.at)} ${xy(to.incoming ?? to.at)} ${xy(to.at)}`;
    return ` L ${xy(to.at)}`;
  };
  for (let i = 1; i < anchors.length; i++) d += edge(anchors[(start + i - 1) % anchors.length], anchors[(start + i) % anchors.length]);
  if (gap < 0 && anchors.length > 1) d += edge(anchors[(start + anchors.length - 1) % anchors.length], anchors[start]) + ' Z';
  return d;
}

function argb(value: number): { color: string; opacity: number } {
  const bits = value >>> 0;
  return { color: `#${(bits & 0xffffff).toString(16).padStart(6, '0')}`, opacity: (bits >>> 24) / 255 };
}
interface Paint { value:string; opacity:number; gradient?:VectorGradient }
function paint(fill:Value|undefined,id:string):Paint {
  const data=plain(fill) as Record<string,unknown>|null;
  const none={value:'none',opacity:1};
  if(!data||typeof data!=='object')return none;
  if(data['fill-type']==='solid'&&typeof data['fill-color']==='number'){
    const c=argb(data['fill-color']);return {value:c.color,opacity:c.opacity};
  }
  if(data['fill-type']==='linear-gradient'){
    const offsets=items(field(fill,'fill-offsets')),colors=items(field(fill,'fill-colors'));
    const from=point(field(fill,'fill-center-point')),to=point(field(fill,'fill-axis1'));
    if(!from||!to||!offsets.length||offsets.length!==colors.length)return none;
    const stops:VectorGradient['stops']=[];
    for(let i=0;i<offsets.length;i++){
      const offset=number(offsets[i],NaN),color=number(colors[i],NaN);
      if(!Number.isFinite(offset)||!Number.isFinite(color))return none;
      const c=argb(color);stops.push({offset:Number(fmt(Math.max(0,Math.min(1,offset)))),color:c.color,opacity:Number(fmt(c.opacity))});
    }
    return {value:`url(#${id})`,opacity:1,gradient:{id,from,to,stops}};
  }
  return none;
}
function linePattern(pattern:number,width:number):string|undefined {
  const patterns:Record<number,number[]>={2:[8,3],3:[5,3],4:[3,3],5:[5,3,1,3],6:[5,3,1,3,1,3],7:[8,3,3,3],8:[1,2]};
  return patterns[pattern]?.map(n=>fmt(n*Math.max(width,1))).join(' ');
}
function marker(kind:number,id:string,color:string):VectorMarker|undefined {
  const paths:Record<number,string>={2:'M 0 0 L 6 3 L 0 6',3:'M 0 0 L 6 3 L 0 6 Z',4:'M 0 1 L 6 3 L 0 5 Z',5:'M 0 3 L 3 0 L 6 3 L 3 6 Z',6:'M 6 0 L 6 6'};
  return paths[kind]?{id,data:paths[kind],color,filled:[3,4,5].includes(kind)}:undefined;
}
/** Normalize native points into editable path/paint semantics; no serialized SVG markup. */
export function parseVector(widget:Value,props:Map<number,Value>,width:number,height:number,id:string):VectorGraphic|undefined {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<0||height<0)return;
  const nativePaths=items(field(widget.body,'ControlPoints'));
  const d=nativePaths.map(p=>pathData(items(p),width,height)).filter(Boolean).join(' ');
  if(!d)return;
  const fill=paint(props.get(7),`${id}-fill`),stroke=paint(props.get(8),`${id}-stroke`);
  const pattern=number(props.get(16),1),borderVisibility=number(props.get(80),15)&15;
  const strokeWidth=pattern===9||borderVisibility===0?0:Math.max(0,number(props.get(15),stroke.value==='none'?0:1));
  const lineEnds=props.get(17);
  const startMarker=strokeWidth?marker(number(field(lineEnds,'Start'),1),`${id}-start`,stroke.value):undefined;
  const endMarker=strokeWidth?marker(number(field(lineEnds,'End'),1),`${id}-end`,stroke.value):undefined;
  let borderPath=d;
  const rectangle=nativePaths.length===1&&items(nativePaths[0]).length===4&&items(nativePaths[0]).every(anchor=>{
    const p=point(field(anchor,'Path'));
    return p&&(p.x===0||p.x===1)&&(p.y===0||p.y===1)&&!point(field(anchor,'LowerHandle'))&&!point(field(anchor,'HigherHandle'));
  });
  // RP9 exports plain rectangles with CSS border-box borders. SVG strokes
  // otherwise straddle the outer contour and add a half-pixel fringe.
  const insetRectangle=rectangle&&number(field(widget.body,'Shape'),-1)===0&&
    !number(props.get(71))&&items(nativePaths[0]).every(a=>field(a,'HigherSegmentExists')?.value===true);
  if(insetRectangle&&strokeWidth){
    const x=Math.min(strokeWidth/2,width/2),y=Math.min(strokeWidth/2,height/2);
    borderPath=`M ${fmt(x)} ${fmt(y)} L ${fmt(width-x)} ${fmt(y)} L ${fmt(width-x)} ${fmt(height-y)} L ${fmt(x)} ${fmt(height-y)} Z`;
  }
  if(borderVisibility!==15&&rectangle){
    const x=insetRectangle?Math.min(strokeWidth/2,width/2):0,y=insetRectangle?Math.min(strokeWidth/2,height/2):0;
    const edges:[number,string][]=[[1,`M ${fmt(x)} ${fmt(y)} L ${fmt(x)} ${fmt(height-y)}`],[2,`M ${fmt(x)} ${fmt(y)} L ${fmt(width-x)} ${fmt(y)}`],[4,`M ${fmt(width-x)} ${fmt(y)} L ${fmt(width-x)} ${fmt(height-y)}`],[8,`M ${fmt(x)} ${fmt(height-y)} L ${fmt(width-x)} ${fmt(height-y)}`]];
    borderPath=edges.filter(([mask])=>mask&borderVisibility).map(([,path])=>path).join(' ');
  }
  const line={stroke:strokeWidth?stroke.value:'none',strokeOpacity:Number(fmt(stroke.opacity)),strokeWidth:Number(fmt(strokeWidth)),dashArray:linePattern(pattern,strokeWidth),markerStart:startMarker?.id,markerEnd:endMarker?.id};
  const paths:VectorPath[]=borderPath===d?[{data:d,fill:fill.value,fillOpacity:Number(fmt(fill.opacity)),...line}]:[{data:d,fill:fill.value,fillOpacity:Number(fmt(fill.opacity))},{data:borderPath,fill:'none',fillOpacity:1,...line}];
  return {kind:'vector',width,height,paths,gradients:[fill.gradient,stroke.gradient].filter((g):g is VectorGradient=>!!g),markers:[startMarker,endMarker].filter((m):m is VectorMarker=>!!m)};
}
