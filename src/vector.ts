import type { VectorGraphic, VectorGradient, VectorMarker, VectorPath } from './model.ts';
import { field, number, items, plain, type Value } from './graph.ts';

interface Point { x: number; y: number }
interface Anchor { at: Point; incoming?: Point; outgoing?: Point; continues: boolean }
const fmt = (value: number): string => Number.isFinite(value) ? String(Number(value.toFixed(5))) : '0';
const xy = (point: Point): string => `${fmt(point.x)} ${fmt(point.y)}`;

/** Native plain rectangles use CSS, including its corner antialiasing. Edited paths stay SVG. */
export function isCssRectangle(widget:Value,props:Map<number,Value>,width:number,height:number):boolean {
  const stroke=paint(props.get(8),'');
  if(stroke.opacity>0&&stroke.opacity<1&&number(props.get(15),1)>0)return false;
  return isNativeRectangle(widget,props,width,height);
}
function isNativeRectangle(widget:Value,props:Map<number,Value>,width:number,height:number):boolean {
  if(number(field(widget.body,'Shape'),-1)!==0)return false;
  const paths=items(field(widget.body,'ControlPoints'));
  if(paths.length!==1)return false;
  const anchors=items(paths[0]);
  if(!anchors.every(a=>field(a,'HigherSegmentExists')?.value===true))return false;
  const r=Math.min(Math.max(0,number(props.get(71))),width/2,height/2);
  const expected=r?[[0,r],[r,0],[width-r,0],[width,r],[width,height-r],[width-r,height],[r,height],[0,height-r]]:[[0,0],[width,0],[width,height],[0,height]];
  if(anchors.length!==expected.length)return false;
  const near=(a:number,b:number)=>Math.abs(a-b)<1e-5;
  return expected.every(([x,y])=>anchors.some(a=>{
    const p=point(field(a,'Path'),width,height);
    if(!p||!near(p.x,x)||!near(p.y,y))return false;
    const handles=['LowerHandle','HigherHandle'].map(k=>point(field(a,k),width,height)).filter((p):p is Point=>!!p);
    if(!r)return handles.length===0;
    return handles.length===1&&handles.every(h=>
      (near(h.x,x)&&near(Math.abs(h.y-y),r*.56)&&(x===0||x===width))||
      (near(h.y,y)&&near(Math.abs(h.x-x),r*.56)&&(y===0||y===height)));
  }));
}

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
export function paint(fill:Value|undefined,id:string):Paint {
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
export function linePattern(pattern:number,width:number):string|undefined {
  const patterns:Record<number,number[]>={2:[8,3],3:[5,3],4:[3,3],5:[5,3,1,3],6:[5,3,1,3,1,3],7:[8,3,3,3],8:[1,2]};
  return patterns[pattern]?.map(n=>fmt(n*Math.max(width,1))).join(' ');
}
export function marker(kind:number,id:string,color:string,strokeWidth=1):VectorMarker|undefined {
  // Native Arrowhead.OneArrowhead cases 18/19 are filled/outlined circles.
  // OuterCircle uses radius 2.5 + BorderWidth/2; InnerCircle subtracts it.
  if(kind===18||kind===19){
    const size=5+strokeWidth,c=size/2;
    return {id,data:`M ${fmt(c+2.5)} ${fmt(c)} A 2.5 2.5 0 1 0 ${fmt(c-2.5)} ${fmt(c)} A 2.5 2.5 0 1 0 ${fmt(c+2.5)} ${fmt(c)} Z`,color,filled:kind===18,viewport:{width:size,height:size,refX:c,refY:c},units:'userSpaceOnUse',strokeWidth};
  }
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
  const startMarker=strokeWidth?marker(number(field(lineEnds,'Start'),1),`${id}-start`,stroke.value,strokeWidth):undefined;
  const endMarker=strokeWidth?marker(number(field(lineEnds,'End'),1),`${id}-end`,stroke.value,strokeWidth):undefined;
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
  // Axure paints translucent rectangle borders over the page, not over the fill.
  // The inner fill and half-inset circular border are separate contours.
  if(isNativeRectangle(widget,props,width,height)&&strokeWidth&&stroke.opacity<1){
    const radius=Math.min(Math.max(0,number(props.get(71))),width/2,height/2);
    const contour=(inset:number):string=>{
      const x=Math.min(inset,width/2),y=Math.min(inset,height/2),r=Math.max(0,radius-inset),right=width-x,bottom=height-y;
      return r?`M ${fmt(x)} ${fmt(y+r)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x+r)} ${fmt(y)} L ${fmt(right-r)} ${fmt(y)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(right)} ${fmt(y+r)} L ${fmt(right)} ${fmt(bottom-r)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(right-r)} ${fmt(bottom)} L ${fmt(x+r)} ${fmt(bottom)} A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(x)} ${fmt(bottom-r)} Z`:`M ${fmt(x)} ${fmt(y)} H ${fmt(right)} V ${fmt(bottom)} H ${fmt(x)} Z`;
    };
    return {kind:'vector',width,height,paths:[{data:contour(strokeWidth),fill:fill.value,fillOpacity:fill.opacity},{data:contour(strokeWidth/2),fill:'none',fillOpacity:1,...line}],gradients:[fill.gradient,stroke.gradient].filter((g):g is VectorGradient=>!!g),markers:[]};
  }
  const paths:VectorPath[]=borderPath===d?[{data:d,fill:fill.value,fillOpacity:Number(fmt(fill.opacity)),...line}]:[{data:d,fill:fill.value,fillOpacity:Number(fmt(fill.opacity))},{data:borderPath,fill:'none',fillOpacity:1,...line}];
  return {kind:'vector',width,height,paths,gradients:[fill.gradient,stroke.gradient].filter((g):g is VectorGradient=>!!g),markers:[startMarker,endMarker].filter((m):m is VectorMarker=>!!m)};
}
