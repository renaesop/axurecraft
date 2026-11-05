import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {readTable,tableCellCss} from '../src/native-table.ts';
import {layoutTable,tableRows} from '../src/table.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import {widgetHtml} from '../src/html.ts';
import type {Graph,Value} from '../src/graph.ts';
import type {Css,Widget} from '../src/model.ts';

const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:typeof v==='object'&&v!==null?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='string'?{tag:8,text:v}:{tag:3,value:v as number};
const base=JSON.parse(readFileSync('examples/hello.project.json','utf8'));
const table=():Widget=>({...structuredClone(base.pages[0].widgets[0]),id:'table',type:'Table',kind:'table',content:[],behaviors:[],variants:undefined,table:{rowHeights:[30,45],columnWidths:[80,160]},children:Array.from({length:4},(_,i)=>({...structuredClone(base.pages[0].widgets[0]),id:`cell${i}`,type:'TableCell',kind:'shape',behaviors:[],variants:undefined}))});

test('native cells are row-major independently of diagram paint-list ordering',()=>{
  const cells=[1,2,3,4].map(id=>({tag:9,id,className:'Axure:DiagramObject:TableCell'}));
  const g={objects:new Map(cells.map(c=>[c.id,c]))} as Graph;
  const w={tag:9,body:value({rows:2,columns:2,cells:[1,3,2,4],'diagram-objects':[1,2,3,4],'row-heights':[30,45],'column-widths':[80,160]})};
  assert.deepEqual(readTable(g,w),{table:{rowHeights:[30,45],columnWidths:[80,160]},cellIds:[1,3,2,4]});
  g.objects.delete(3);assert.throws(()=>readTable(g,w),/unresolved/);
});
test('table tracks resize all rows without mutating authored children or losing behaviors',()=>{
  const w=table(),before=structuredClone(w);w.children![3].behaviors=[{event:'click',actions:[{kind:'hide',target:'cell0'}]}];
  w.table!.columnWidths[0]=120;
  const rendered=layoutTable(w);
  assert.deepEqual(rendered.children!.map(c=>[c.x,c.y,c.width,c.height]),[[0,0,120,30],[120,0,160,30],[0,30,120,45],[120,30,160,45]]);
  assert.deepEqual(rendered.children![3].behaviors,w.children![3].behaviors);
  assert.equal(w.children![0].x,before.children![0].x);
  assert.equal(rendered.width,280);assert.equal(rendered.height,75);
  assert.deepEqual(tableRows(rendered).map(row=>row.map(c=>c.id)),[['cell0','cell1'],['cell2','cell3']]);
  const html=widgetHtml(w);assert.equal((html.match(/role="row"/g)??[]).length,2);assert.equal((html.match(/role="cell"/g)??[]).length,4);
});
test('cell edges remain independent and table schema rejects missing or invalid cells',()=>{
  const css:Css={'border-width':'1px','border-color':'black'};
  tableCellCss({tag:9,body:value({'left-border-width':0,'right-border-width':2,'right-border-color':0xffff0000})},css);
  assert.equal(css['border-width'],'0px');assert.equal(css['--rp-cell-left-width'],'0px');assert.equal(css['--rp-cell-right-width'],'2px');assert.equal(css['--rp-cell-right-color'],'rgba(255,0,0,1)');
  const p=structuredClone(base);p.pages[0].widgets=[table()];
  assert.doesNotThrow(()=>parseSemanticProject(JSON.stringify(p)));
  p.pages[0].widgets[0].table.columnWidths[0]=-1;assert.throws(()=>parseSemanticProject(JSON.stringify(p)),/nonnegative track/);
  p.pages[0].widgets[0]=table();p.pages[0].widgets[0].children.pop();assert.throws(()=>parseSemanticProject(JSON.stringify(p)),/one cell/);
});
