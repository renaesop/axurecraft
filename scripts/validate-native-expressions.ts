import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { evaluateExpression } from '../src/expression.ts';
import type { BinaryOperator, Scalar, UIExpression } from '../src/model.ts';
const directory = '/Volumes/Axure RP 9/Axure RP 9.app/Contents/Resources/DefaultSettings/Prototype_Files/resources/scripts/axure/';
const ax: any = {};
const context = vm.createContext({ $axure: { internal: (callback: (ax: any) => void) => callback(ax) } });
const sources = ['sto.js', 'expr.js'].map(name => {
  const bytes = readFileSync(directory + name); vm.runInContext(bytes.toString(), context, { filename: name });
  return { name, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const values: Scalar[] = ['', '0', '1', '2.5', '-2', 'abc', 'True', 'false', false, true, 0, 1, -2, 2.5];
const literal = (value: Scalar): UIExpression => ({ kind: 'literal', value });
const nativeLiteral = (value: Scalar) => ({ sto: 'literal', value });
let arithmetic = 0, comparisons = 0, methods = 0, matchingExceptions = 0;
for (const op of ['+', '-', '*', '/', '%'] as BinaryOperator[]) for (const left of values) for (const right of values) {
  const expected = ax.evaluateSTO({ sto: 'binOp', op, leftSTO: nativeLiteral(left), rightSTO: nativeLiteral(right) }, {}, {});
  assert.equal(evaluateExpression({ kind: 'binary', operator: op, left: literal(left), right: literal(right) }, { readWidget: () => undefined }), expected, `${left} ${op} ${right}`); arithmetic++;
}
for (const op of ['==', '!=', '>', '<', '>=', '<=', '&&', '||'] as BinaryOperator[]) for (const left of [...values, undefined]) for (const right of [...values, undefined]) {
  let expected:unknown;
  try{expected = ax.expr.evaluateExpr({ exprType: 'binaryOp', op, leftExpr: { exprType: 'booleanLiteral', value: left }, rightExpr: { exprType: 'booleanLiteral', value: right } }, {});}
  catch(error){
    assert.equal(right,undefined);assert.ok(op==='&&'||op==='||');
    assert.equal((error as Error).name,'TypeError');
    assert.throws(()=>evaluateExpression({kind:'binary',operator:op,left:left===undefined?{kind:'widget',target:'missing',property:'text'}:literal(left),right:{kind:'widget',target:'missing',property:'text'}},{readWidget:()=>undefined}),TypeError);
    matchingExceptions++;continue;
  }
  assert.equal(evaluateExpression({ kind: 'binary', operator: op, left: left===undefined?{kind:'widget',target:'missing',property:'text'}:literal(left), right: right===undefined?{kind:'widget',target:'missing',property:'text'}:literal(right) }, { readWidget: () => undefined }), expected, `${left} ${op} ${right}`); comparisons++;
}
for (const value of [1, 2.345, -1.25, 0]) for (const digits of [0, 1, 2, 5]) {
  const expected = ax.evaluateSTO({ sto: 'fCall', func: 'toFixed', thisSTO: nativeLiteral(value), arguments: [nativeLiteral(digits)] }, {}, {});
  assert.equal(evaluateExpression({ kind: 'call', method: 'toFixed', receiver: literal(value), args: [literal(digits)] }, { readWidget: () => undefined }), expected); methods++;
}
const report = { passed: true, sources, arithmetic, comparisons, methods, matchingExceptions, missingValuePolicy: "For missing right operands in evaluated logical branches, both native getBool(undefined) and this evaluator throw TypeError; exception checks are counted separately from returned values.", scope: 'Official RP9 primitive arithmetic/coercion, condition operators and decimal formatting; excludes native DOM, case menu, widget resolution and visuals.' };
writeFileSync('research/interactions/native-expression-validation.json', JSON.stringify(report, null, 2)); console.log(report);
