import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pageToJsx,pageDefinition} from '../src/jsx.ts';
import {structureCases} from './fixtures/structure.ts';
const body=(code:string)=>code.slice(code.indexOf('export default function'));
test('simple and mixed text stay editable as one text component with explicit runs',()=>{
 const cases=structureCases();for(const key of ['plain','rich']){
  const code=body(pageToJsx(cases[key]));assert.equal((code.match(/<RpWidget\s/g)??[]).length,1);assert.equal((code.match(/<RpText\s/g)??[]).length,1);assert.doesNotMatch(code,/dangerouslySetInnerHTML|innerHTML|iframe/);
 }
 const edited=structuredClone(cases.rich);const content=edited.widgets[0].content[0];assert.equal(content.kind,'text');if(content.kind!=='text')return;content.paragraphs[0].runs[1].text='emphasis';
 const before=body(pageToJsx(cases.rich)).split('\n'),after=body(pageToJsx(edited)).split('\n');assert.equal(before.filter((line,i)=>line!==after[i]).length,1,'A one-run copy edit should change one JSX line');
});
test('one thousand repeater rows keep one template and no duplicated materialized row metadata',()=>{
 const one=structureCases(1).repeater,thousand=structureCases(1000).repeater,a=pageDefinition(one),b=pageDefinition(thousand);
 assert.equal(body(pageToJsx(one)),body(pageToJsx(thousand)),'Data growth must not expand the component body');
 assert.equal(b.widgets.length,a.widgets.length);assert.equal(b.widgets.filter(w=>w.rowInstance).length,0);assert.equal(b.repeaters.rows.template.length,1);assert.equal(b.repeaters.rows.rows.length,1000);
 // Once row data is removed, all remaining metadata must be independent of row count.
 a.repeaters.rows.rows=[];b.repeaters.rows.rows=[];assert.deepEqual(a,b);
});
test('tables and panels retain visible semantic hierarchy instead of opaque renderer blobs',()=>{
 const cases=structureCases(),table=body(pageToJsx(cases.table)),panel=body(pageToJsx(cases.panel));
 assert.equal((table.match(/role="row"/g)??[]).length,3);assert.equal((table.match(/type=\{"TableCell"\}/g)??[]).length,6);assert.equal((panel.match(/<RpState\s/g)??[]).length,2);
 const action=pageDefinition(cases.assignment).widgets[0].behaviors[0].actions[0];assert.equal(action.kind,'set-rich-text');assert.equal(action.richText!.paragraphs[0].runs[1].expression?.kind,'variable');assert.ok(!('html' in action));
});
