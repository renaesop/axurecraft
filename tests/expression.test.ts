import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFormula } from '../src/expression-parser.ts';
import { evaluateExpression } from '../src/expression.ts';
import { executeActions } from '../src/behavior-runtime.ts';
import type { UIExpression, Action, Behavior, Scalar } from '../src/model.ts';
const literal = (value: Scalar): UIExpression => ({ kind: 'literal', value });
const read = (target: string): UIExpression => ({ kind: 'widget', target, property: 'text' });

test('formula parser respects precedence, Axure numeric addition, formatting and restricted methods', () => {
  const evaluate = (source: string) => evaluateExpression(parseFormula(source, name => {
    if (name === 'Target.text') return read('quantity');
    throw new Error('Unknown variable');
  }), { readWidget: () => '9' });
  assert.equal(evaluate('Target.text+1'), 10);
  assert.equal(evaluate('(Target.text+1)*2-4/2'), 18);
  assert.equal(evaluate('(-2.5+Target.text).toFixed(2)'), '6.50');
  assert.equal(evaluate('"￥20.25".slice(1)-2'), 18.25);
  for (const source of ['globalThis.alert(1)', 'Target.constructor', 'Target.text[0]', '1;alert(1)', '(1+2', '1e999', 'Target.text.toFixed(1,2)', '1 constructor 2', Array(100).fill('1').join('+')]) {
    assert.throws(() => evaluate(source));
  }
});

test('conditional groups run only their first matching case and read preceding writes', async () => {
  const values: Record<string, string> = { quantity: '1', result: '' };
  const write = (target: string, expression: UIExpression): Action => ({ kind: 'set-text', target, expression });
  const events: Record<string, Behavior[]> = { quantity: [{ event: 'textchange', actions: [write('result', read('quantity'))] }] };
  const changes: string[] = [];
  const host = {
    readWidget: (id: string) => values[id], writeText: (id: string, value: string) => { values[id] = value; changes.push(id); },
    writeSelected: () => {}, behaviors: (id: string) => events[id] ?? [], isDisabled: () => false, apply: () => {},
  };
  await executeActions([
    write('quantity', { kind: 'binary', operator: '+', left: read('quantity'), right: literal(1) }),
    { kind: 'branch', branches: [
      { condition: { kind: 'binary', operator: '==', left: read('quantity'), right: literal('2') }, actions: [write('result', literal('matched'))] },
      { actions: [write('result', literal('wrong else'))] },
    ] },
    { kind: 'branch', branches: [{ condition: literal(true), actions: [write('quantity', literal('3'))] }] },
  ], host);
  assert.deepEqual(values, { quantity: '3', result: '3' });
  assert.deepEqual(changes, ['quantity', 'result', 'result', 'quantity', 'result']);
});

test('missing row values do not become false text assignments', async () => {
  const expr:UIExpression={kind:'binary',operator:'*',left:{kind:'column',columnId:999},right:literal(2)};
  assert.equal(evaluateExpression(expr,{readWidget:()=>undefined}),undefined);
  let writes=0;
  await executeActions([{kind:'set-text',target:'target',expression:expr}],{
    readWidget:()=>undefined,writeText:()=>{writes++;},writeSelected:()=>{},behaviors:()=>[],isDisabled:()=>false,apply:()=>{},
  });
  assert.equal(writes,0);
});

test('search filters chain lowercase/indexOf and date methods read an injected clock',()=>{
 const context={readWidget:()=>undefined,now:()=>Date.UTC(2024,1,29,12,34,56,789)};
 const compile=(text:string)=>parseFormula(text,name=>name==='Now'?{kind:'now'}:{kind:'literal',value:'  Alpha BETA  '});
 assert.equal(evaluateExpression(compile("query.trim().toLowerCase().indexOf('beta')"),context),6);
 assert.equal(evaluateExpression(compile('Now.getFullYear()'),context),new Date(context.now()).getFullYear());
 assert.equal(evaluateExpression(compile('Now.getMilliseconds()'),context),789);
 assert.throws(()=>compile('query.constructor()'),/Unsupported/);
});
