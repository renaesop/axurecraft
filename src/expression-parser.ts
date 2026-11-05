import type { BinaryOperator, UIExpression } from './model.ts';

const precedence: Record<BinaryOperator, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};

/** Parse the supported Axure [[...]] grammar, never JavaScript source execution. */
export function parseFormula(source: string, resolve: (name: string) => UIExpression): UIExpression {
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { offset++; continue; }
    const match = /^(?:\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[\p{L}_$][\p{L}\p{N}\p{M}_$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|&&|\|\||==|!=|>=|<=|[()+\-*/%!,<>.])/u.exec(source.slice(offset));
    if (!match) throw new Error(`Unsupported formula token at ${offset}`);
    tokens.push(match[0]); offset += match[0].length;
    if (tokens.length > 4096) throw new Error('Formula exceeds 4096 tokens');
  }
  let cursor = 0;
  const take = (token: string): void => { if (tokens[cursor++] !== token) throw new Error(`Expected ${token}`); };
  const parse = (minimum = 0, depth = 0): UIExpression => {
    if (depth > 64) throw new Error('Formula nesting exceeds 64');
    const token = tokens[cursor++];
    let left: UIExpression;
    if (token === '(') { left = parse(0, depth + 1); take(')'); }
    else if (token === '-' || token === '+' || token === '!') left = { kind: 'unary', operator: token, operand: parse(7, depth + 1) };
    else if (/^(?:\d|\.\d)/.test(token ?? '')) {
      const value = Number(token); if (!Number.isFinite(value)) throw new Error('Nonfinite numeric literal');
      left = { kind: 'literal', value };
    } else if (/^["']/.test(token ?? '')) {
      // Only the small string escape set is accepted; no executable escape expansion.
      const value = token.slice(1, -1).replace(/\\([\\'"nrt])/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t' }[c] ?? c));
      if (/\\/.test(value)) throw new Error('Unsupported string escape');
      left = { kind: 'literal', value };
    } else if (/^[\p{L}_$][\p{L}\p{N}\p{M}_$]*$/u.test(token ?? '')) {
      let name = token;
      if (['target', 'this', 'item', 'targetitem'].includes(name.toLowerCase()) && tokens[cursor] === '.') {
        cursor++; name += '.' + tokens[cursor++];
      }
      left = name === 'true' || name === 'false' ? { kind: 'literal', value: name === 'true' } : resolve(name);
    } else throw new Error('Expected formula operand');
    while (cursor < tokens.length) {
      if (tokens[cursor] === '.') {
        cursor++; const method = tokens[cursor++];
        if (method === 'length' && tokens[cursor] !== '(') { left = { kind: 'length', value: left }; continue; }
        if (method !== 'slice' && method !== 'toFixed') throw new Error(`Unsupported formula method ${method}`);
        take('('); const args: UIExpression[] = [];
        if (tokens[cursor] !== ')') {
          args.push(parse(0, depth + 1));
          while (tokens[cursor] === ',') { cursor++; args.push(parse(0, depth + 1)); }
        }
        take(')');
        if (args.length > (method === 'slice' ? 2 : 1)) throw new Error(`Invalid ${method} argument count`);
        left = { kind: 'call', method, receiver: left, args }; continue;
      }
      const operator = tokens[cursor] as BinaryOperator, rank = Object.hasOwn(precedence, operator) ? precedence[operator] : undefined;
      if (rank === undefined || rank < minimum) break;
      cursor++; left = { kind: 'binary', operator, left, right: parse(rank + 1, depth + 1) };
    }
    return left;
  };
  const result = parse();
  if (cursor !== tokens.length) throw new Error(`Unexpected formula token ${tokens[cursor]}`);
  const bound=(node:UIExpression,depth=0):void=>{
    if(depth>64)throw new Error('Formula expression depth exceeds 64');
    if(node.kind==='length')bound(node.value,depth+1);
    if(node.kind==='binary'){bound(node.left,depth+1);bound(node.right,depth+1);}
    if(node.kind==='unary')bound(node.operand,depth+1);
    if(node.kind==='call'){bound(node.receiver,depth+1);for(const arg of node.args)bound(arg,depth+1);}
    if(node.kind==='concat')for(const part of node.parts)bound(part,depth+1);
  };
  bound(result);
  return result;
}
