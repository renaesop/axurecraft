import {flowCases} from './flow.ts';
import {nestGroups} from '../../src/groups.ts';
import {translateGeometry} from '../../src/connector-geometry.ts';
import type {Page,Widget} from '../../src/model.ts';

/** Whole-canvas fixture: disconnected content must survive, not just graph nodes. */
export function flowCanvasCase():Page {
 const page=flowCases().flowDecision;page.id='canvas';page.name='全画布验证';page.width=1150;page.height=900;
 const source=flowCases().flowChain;
 const shift=(w:Widget,dx:number,dy:number):Widget=>({...w,x:w.x+dx,y:w.y+dy,...(w.connection?.geometry?{connection:{...w.connection,geometry:translateGeometry(w.connection.geometry,dx,dy)}}:{})});
 const members=source.widgets.map(w=>shift(w,40,560));
 const group:Widget={...structuredClone(source.widgets.find(w=>w.id==='start')!),id:'group',name:'组合',type:'Layer',kind:'group',x:0,y:0,width:0,height:0,css:{},content:[]};
 page.widgets.push(...nestGroups([group,...members],new Map([['group',members.map(w=>w.id)]])));
 const cross=structuredClone(page.widgets.find(w=>w.id==='entry-check')!);cross.id='cross-group';cross.connection!.start.target='finish';cross.connection!.end.target='start';
 cross.connection!.geometry={space:'parent',start:{x:370,y:514},end:{x:150,y:620},points:[]};
 // Fixture line geometry authored explicitly, not inferred from rendered pixels.
 cross.x=150;cross.y=514;cross.width=220;cross.height=106;
 const vector=cross.content.find(c=>c.kind==='vector')!;Object.assign(vector,{width:220,height:106});vector.paths[0].data='M 220 0 L 0 106';
 page.widgets.push(cross);
 const free=structuredClone(source.widgets[0]);free.id='free-end';free.connection!.end={};free.connection!.start.target='entry';
 free.connection!.geometry={space:'parent',start:{x:440,y:42},end:{x:700,y:42},points:[],label:{x:570,y:42}};
 free.x=440;free.y=42;free.width=260;free.height=0;const fv=free.content.find(c=>c.kind==='vector')!;fv.width=260;fv.height=1;fv.paths[0].data='M 0 0 L 260 0';page.widgets.push(free);
 const note=structuredClone(source.widgets.find(w=>w.id==='start')!);note.id='isolated';note.name='没有连线的说明';note.x=800;note.y=80;note.width=240;note.content=[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'没有连线的说明',css:{color:'#234'}}]}]}];page.widgets.push(note);
 const table:Widget={...structuredClone(note),id:'table',name:'规格表',type:'Table',kind:'table',x:780,y:200,width:260,height:100,css:{},content:[],table:{rowHeights:[40,60],columnWidths:[100,160]},children:Array.from({length:4},(_,i):Widget=>({...structuredClone(note),id:'cell-'+i,type:'TableCell',x:0,y:0,width:100,height:40,css:{border:'1px solid #445'},content:[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'单元格 '+i,css:{}}]}]}]}))};page.widgets.push(table);
 const frame:Widget={...structuredClone(note),id:'frame',name:'外部内容',type:'InlineFrame',kind:'frame',x:780,y:400,width:260,height:70,css:{},content:[{kind:'frame',src:'https://example.invalid/prototype',name:'external',title:'外部内容',border:true,scrolling:'auto'}]};page.widgets.push(frame);
 const hiddenChild:Widget={...structuredClone(note),id:'hidden-note',x:0,y:0};
 page.widgets.push({...structuredClone(group),id:'hidden-group',x:900,y:600,width:240,height:44,css:{display:'none'},children:[hiddenChild]});
 // Values deliberately differ from labels; the single selection is not first.
 for(const multiple of [false,true])page.widgets.push({
  ...structuredClone(note),id:multiple?'multi-select':'single-select',name:multiple?'多选状态':'单选状态',
  type:multiple?'ListBox':'ComboBox',x:780,y:multiple?570:510,width:240,height:multiple?80:40,
  content:[{kind:'control',control:'select',label:multiple?'多选状态':'单选状态',value:'approved',multiple,listBox:multiple,
   selectedValues:multiple?['draft','approved']:undefined,
   options:[{value:'draft',label:'草稿'},{value:'review',label:'审核中'},{value:'approved',label:'已通过'}]}],
 });
 const walk=(widgets:Widget[])=>{for(const w of widgets){const g=w.connection?.geometry;if(g?.label)for(const c of w.content)if(c.kind==='text')c.css={...c.css,left:`${g.label.x-w.x-50}px`,top:`${g.label.y-w.y-10}px`,right:'auto',bottom:'auto',width:'100px',height:'20px'};walk(w.children??[]);}};walk(page.widgets);
 return page;
}
