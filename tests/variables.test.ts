import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createVariables} from '../src/variables.ts';
import {parseFormula} from '../src/expression-parser.ts';
import {evaluateExpression} from '../src/expression.ts';
import {executeActions} from '../src/behavior-runtime.ts';

test('global variables survive URL transfer with casing, Unicode and reserved characters',()=>{
 const definitions=[{name:'User',defaultValue:''},{name:'Counter',defaultValue:'0'}];
 const first=createVariables(definitions,'#USER=%E5%BC%A0%E4%B8%89%26x%3D1%23&Counter=2&CSUM=1','Login');
 assert.equal(first.read('user'),'张三&x=1#');
 assert.equal(first.read('PAGENAME'),'Login');
 first.write('counter',3);
 const next=createVariables(definitions,first.link('next.html').split('#')[1],'Next');
 assert.equal(next.read('User'),'张三&x=1#');assert.equal(next.read('Counter'),'3');
 next.write('User','');next.write('Counter','0');assert.equal(next.link('next.html'),'next.html');
 assert.equal(createVariables([],'#x=a+b').read('x'),'a+b');
 assert.equal(createVariables([],'#x=a=b').read('x'),'a');
 assert.equal(createVariables([],'#x').read('x'),'undefined');
});

test('variable writes feed subsequent Unicode expressions and text actions',async()=>{
 const variables=createVariables([{name:'用户名',defaultValue:''}]);
 const writes:string[]=[];
 const host={readWidget:()=>'',readVariable:variables.read,writeVariable:variables.write,
  behaviors:()=>[],isDisabled:()=>false,writeText:(_id:string,value:string)=>{writes.push(value)},writeSelected:()=>{},apply:()=>{}};
 const expr=parseFormula('用户名.length+1',name=>({kind:'variable',name}));
 await executeActions([{kind:'set-variable',variable:'用户名',expression:{kind:'literal',value:'你好'}},
  {kind:'set-text',target:'label',expression:expr}],host);
 assert.deepEqual(writes,['3']);
 assert.equal(evaluateExpression({kind:'variable',name:'用户名'},host),'你好');
});
