import {callFormulaMethod} from './expression-methods.ts';
import type { UIExpression, Scalar, WidgetProperty } from './model.ts';

export interface ExpressionContext {
  now?():number;
  readRowIndex?():number|undefined;
  readEvent?(property:string):Scalar|undefined;
  readWidget(id: string, property: WidgetProperty): Scalar | undefined;
  readColumn?(id:number):Scalar|undefined;
  readVariable?(name: string): string;
}

/** RP9 converts only the words true/false; other strings retain their value. */
export function axureBoolean(value: Scalar | undefined): Scalar | undefined {
  if (typeof value !== 'string') return value;
  const lower = value.toLowerCase();
  return lower === 'true' ? true : lower === 'false' ? false : value;
}

/** Explicit expression interpreter. No eval, Function, or arbitrary property access. */
export function evaluateExpression(expr: UIExpression, context: ExpressionContext): Scalar | undefined {
  const evaluate = (node: UIExpression): Scalar | undefined => evaluateExpression(node, context);
  if(expr.kind==='row-index')return context.readRowIndex?.();
  if(expr.kind==='event')return context.readEvent?.(expr.property);
  if(expr.kind==='now')return new Date(context.now?.()??Date.now()).toString();
  if (expr.kind === 'literal') return expr.value;
  if (expr.kind === 'widget') return context.readWidget(expr.target, expr.property);
  if (expr.kind === 'variable') return context.readVariable?.(expr.name);
  if (expr.kind === 'length') { const value = evaluate(expr.value); return value === undefined ? undefined : String(value).length; }
  // Columns are bound to row literals by materializeRepeater before execution.
  if (expr.kind === 'column') return context.readColumn?.(expr.columnId);
  if (expr.kind === 'concat') {
    const parts = expr.parts.map(evaluate);
    return parts.some(v => v === undefined) ? undefined : parts.join('');
  }
  if (expr.kind === 'unary') {
    const value = evaluate(expr.operand);
    if (value === undefined) return undefined;
    return expr.operator === '!' ? !axureBoolean(value) : expr.operator === '-' ? -Number(value) : Number(value);
  }
  if (expr.kind === 'call') {
    const value = evaluate(expr.receiver), args = expr.args.map(evaluate);
    if (value === undefined || args.some(v => v === undefined)) return undefined;
    return callFormulaMethod(expr.method,value,args as Scalar[],expr.receiver.kind==='now'?context.now?.()??Date.now():undefined);
  }
  const left = evaluate(expr.left);
  if (left === undefined) return expr.operator === '!=' ? true : ['+','-','*','/','%'].includes(expr.operator) ? undefined : false;
  if (expr.operator === '&&' && !axureBoolean(left)) return axureBoolean(left);
  if (expr.operator === '||' && axureBoolean(left)) return axureBoolean(left);
  const right = evaluate(expr.right);
  if (right === undefined) {
    if(expr.operator==='&&'||expr.operator==='||')throw new TypeError('Missing right operand in logical expression');
    return expr.operator === '!=' ? true : ['+','-','*','/','%'].includes(expr.operator) ? undefined : false;
  }
  switch (expr.operator) {
    case '&&': case '||': return axureBoolean(right);
    case '+': { const n = Number(left) + Number(right); return Number.isNaN(n) ? String(left) + String(right) : n; }
    case '-': return Number(left) - Number(right);
    case '*': return Number(left) * Number(right);
    case '/': return Number(left) / Number(right);
    case '%': return Number(left) % Number(right);
    // Native equality deliberately coerces numeric strings and boolean words.
    case '==': return axureBoolean(left) == axureBoolean(right);
    case '!=': return axureBoolean(left) != axureBoolean(right);
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
  }
}

/** Visit references when a canonical template becomes a row instance. */
export function bindExpression(expr: UIExpression, target: (id: string) => string, column: (id: number) => Scalar | undefined, rowIndex?:number): UIExpression {
  switch (expr.kind) {
    case 'row-index':return rowIndex===undefined?expr:{kind:'literal',value:rowIndex};
    case 'length': return { ...expr, value: bindExpression(expr.value, target, column,rowIndex) };
    case 'widget': return { ...expr, target: target(expr.target) };
    case 'column': { const value = column(expr.columnId); return value === undefined ? expr : { kind: 'literal', value }; }
    case 'binary': return { ...expr, left: bindExpression(expr.left, target, column,rowIndex), right: bindExpression(expr.right, target, column,rowIndex) };
    case 'unary': return { ...expr, operand: bindExpression(expr.operand, target, column,rowIndex) };
    case 'call': return { ...expr, receiver: bindExpression(expr.receiver, target, column,rowIndex), args: expr.args.map(e => bindExpression(e, target, column,rowIndex)) };
    case 'concat': return { ...expr, parts: expr.parts.map(e => bindExpression(e, target, column,rowIndex)) };
    default: return expr;
  }
}

/** Snapshot external values when a repeater action starts; columns stay row-dependent. */
export function snapshotExpression(expr:UIExpression,context:ExpressionContext):UIExpression {
 if(expr.kind==='event'||expr.kind==='widget'||expr.kind==='variable'||expr.kind==='now'||expr.kind==='call'&&expr.receiver.kind==='now'){const value=evaluateExpression(expr,context);return value===undefined?expr:{kind:'literal',value};}
 const visit=(e:UIExpression)=>snapshotExpression(e,context);
 if(expr.kind==='binary')return {...expr,left:visit(expr.left),right:visit(expr.right)};
 if(expr.kind==='unary')return {...expr,operand:visit(expr.operand)};
 if(expr.kind==='length')return {...expr,value:visit(expr.value)};
 if(expr.kind==='concat')return {...expr,parts:expr.parts.map(visit)};
 if(expr.kind==='call')return {...expr,receiver:visit(expr.receiver),args:expr.args.map(visit)};
 return expr;
}
