import {nativeKeyValue} from './input-events.ts';
import {datasetColumns,type NativeContext} from './native-reference.ts';
import { field, items, number, object, prop, str, type Graph, type Value } from './graph.ts';
import type { Action, BinaryOperator, UIExpression, GlobalVariable, WidgetProperty } from './model.ts';
import { parseFormula } from './expression-parser.ts';
const zeroGuid = '00000000000000000000000000000000';
// Axure.Platform.LogicalComparison, verified from the official RP9 API enum.
const comparisons: Record<number, BinaryOperator> = { 1: '&&', 2: '||', 3: '==', 4: '!=', 5: '>', 6: '<', 7: '>=', 8: '<=' };

/** Compile native expression records into the public UI expression tree. */
export function nativeExpressions(g: Graph, owner: Value, variables: GlobalVariable[] = [], targetDataset?:Value, context:NativeContext={}) {
  const variableById = (id: number): GlobalVariable | undefined => variables.find(v => v.sourceGuid && v.sourceGuid === g.guids[id - 1]);
  const variableByName = (name: string): GlobalVariable | undefined => variables.find(v => v.name.toLowerCase() === name.toLowerCase());
  const variableArgument = (node: Value | undefined): string => {
    if (node?.className !== 'Axure:Expr:GlobalVariableLiteral') throw new Error('Expected global variable argument');
    // The official GlobalVariableLiteral getter resolves identity first, then its cached name.
    const variable = variableById(number(field(node.body, 'value'))) ?? variableByName(str(field(node.body, 'variable-name')));
    if (!variable) throw new Error('Unresolved global variable ' + str(field(node.body, 'variable-name')));
    return variable.name;
  };
  const idFor = (value: Value): string => `w-${g.guids[value.id! - 1]}`;
  const parentRepeater = owner.className==='Axure:DiagramObject:Repeater'?owner:[...g.objects.values()].find(w => w.className === 'Axure:DiagramObject:Repeater' &&
    items(field(prop(g, w, 'BaseDiagram')?.body, 'diagram-objects')).some(ref => number(ref) === owner.id));
  const target = (path: Value | undefined): string => {
    if (!path) throw new Error('Missing widget path');
    if (items(field(path.body, 'rdo-path')).length) throw new Error('Master-scoped expression target is unsupported');
    const id = number(field(path.body, 'object-id'), -1);
    if (g.guids[id - 1] === zeroGuid) return idFor(owner);
    const widget = g.objects.get(id)??context.references?.get(g.guids[id-1])?.widget;
    if (!widget?.className?.startsWith('Axure:DiagramObject:')) throw new Error(`Unresolved widget reference ${g.guids[id - 1] ?? id}`);
    const scope = items(field(path.body, 'repeater-path'));
    if(scope.some(ref=>{const id=number(ref),repeater=g.objects.get(id)??context.references?.get(g.guids[id-1])?.widget;return repeater?.className!=='Axure:DiagramObject:Repeater';}))throw new Error('Unresolved repeater scope');
    return `w-${g.guids[id-1]}`;
  };
  const pathArgument = (node: Value | undefined): string => {
    if (node?.className !== 'Axure:Expr:DiagramObjectPathLiteral') throw new Error('Expected widget path argument');
    return target(prop(g, node, 'value'));
  };
  const compile = (node: Value | undefined, actionTarget?: string, depth = 0): UIExpression => {
    if (!node || depth > 64) throw new Error('Missing expression or nesting exceeds 64');
    if(node.className==='Axure:Expr:DynamicPanelDiagramLiteral'){const id=g.guids[number(field(node.body,'panel-diagram-id-objectid'))-1],name=context.stateNames?.get(id);if(name===undefined)throw new Error('Unresolved panel state '+id);return {kind:'literal',value:name};}
    if(node.className==='Axure:Expr:KeyPressLiteral')return {kind:'literal',value:nativeKeyValue(number(field(node.body,'keys')),number(field(node.body,'character')))};
    if (node.className === 'Axure:Expr:BooleanLiteral') {
      const value = str(field(node.body, 'value')).toLowerCase();
      if (value !== 'true' && value !== 'false') throw new Error('Invalid boolean literal');
      return { kind: 'literal', value: value === 'true' };
    }
    if (node.className === 'Axure:Expr:BinaryExpr') {
      const operator = comparisons[number(field(node.body, 'operation'))];
      if (!operator) throw new Error('Unknown comparison operation');
      return { kind: 'binary', operator, left: compile(prop(g, node, 'left-expr'), actionTarget, depth + 1), right: compile(prop(g, node, 'right-expr'), actionTarget, depth + 1) };
    }
    if (node.className === 'Axure:Expr:FCall') {
      const name = str(field(node.body, 'function-name')), args = items(field(node.body, 'args'));
      if (['GetGlobalVariableValue', 'GetGlobalVariableLength'].includes(name) && args.length === 1) {
        const value: UIExpression = { kind: 'variable', name: variableArgument(object(g, args[0])) };
        return name === 'GetGlobalVariableValue' ? value : { kind: 'length', value };
      }
      if(name==='GetKeyPressed'&&!args.length)return {kind:'event',property:'key'};
      if(name==='GetPanelState'&&args.length===1)return {kind:'widget',target:pathArgument(object(g,args[0])),property:'state'};
      if(name==='GetWidgetVisibility'&&args.length===1)return {kind:'widget',target:pathArgument(object(g,args[0])),property:'visible'};
      if(name==='GetWidgetValueLength'&&args.length===1)return {kind:'length',value:{kind:'widget',target:pathArgument(object(g,args[0])),property:'text'}};
      if (['GetWidget','GetSelectedOption'].includes(name)&&args.length===1)return {kind:'widget',target:pathArgument(object(g,args[0])),property:'text'};
      if (!['GetWidgetText', 'GetCheckState'].includes(name) || args.length !== 1) throw new Error(`Unsupported value function ${name}`);
      return { kind: 'widget', target: pathArgument(object(g, args[0])), property: name === 'GetWidgetText' ? 'text' : 'selected' };
    }
    if (node.className !== 'Axure:Expr:StringLiteral') throw new Error(`Unsupported expression ${node.className}`);
    const resolve = (name: string): UIExpression => {
      const local = field(node.body,'scope')?.entries?.find(([key])=>str(key).toLowerCase()===name.toLowerCase())?.[1];
      if (local) return compile(object(g, local), actionTarget, depth + 1);
      const identifier = items(field(node.body, 'variable-identifiers')).map(ref => object(g, ref)).find(v => str(field(v?.body, 'Name')).toLowerCase() === name.toLowerCase());
      const global = (identifier && variableById(number(field(identifier.body, 'Id')))) ?? variableByName(name);
      if (global) return { kind: 'variable', name: global.name };
      if(['dragx','dragy','totaldragx','totaldragy','dragtime','mousex','mousey'].includes(name.toLowerCase()))return {kind:'event',property:name.toLowerCase()};
      if(name.toLowerCase()==='now')return {kind:'now'};
      if (name.toLowerCase() === 'pagename') return { kind: 'variable', name: 'PageName' };
      const match = /^(Target|This)\.(text|selected|x|y|left|right|top|bottom|width|height|rotation|visible|disabled)$/i.exec(name);
      if (match) {
        const id = match[1].toLowerCase() === 'this' ? idFor(owner) : actionTarget;
        if (!id) throw new Error('Target expression outside an action');
        return { kind: 'widget', target: id, property: match[2].toLowerCase() as WidgetProperty };
      }
      if(/^(?:Item|TargetItem)\.index$/i.test(name))return {kind:'row-index'};
      const columnMatch = /^(?:Item|TargetItem)\.(.+)$/i.exec(name);
      if (columnMatch) {
        const data = object(g, field(node.body, 'repeater-scope'));
        const parentData=targetDataset??(parentRepeater&&prop(g,parentRepeater,'Data'))??object(g,field(node.body,'TargetRepeaterScope'));
        if(!parentData&&!context.columns)throw new Error('Expression has no owning repeater dataset');
        const columns=context.columns??datasetColumns(g,parentData!);
        const alias = items(field(node.body, 'variable-identifiers')).map(ref => object(g, ref)).find(v => str(field(v?.body, 'Name')).toLowerCase() === name.toLowerCase());
        const aliasId = number(field(alias?.body, 'Id'), -1),aliasGuid=g.guids[aliasId-1];
        const byId=aliasId<0?undefined:columns.find(c=>aliasGuid?c.guid===aliasGuid:c.id===aliasId);
        // Cached source snapshots may differ; the owning dataset's stable column identity wins.
        if(!context.columns&&!targetDataset&&data?.id!==parentData?.id&&!byId&&object(g,field(node.body,'TargetRepeaterScope'))?.id!==parentData?.id)throw new Error('Expression belongs to another repeater dataset');
        const column = byId ?? columns.find(c => c.name.toLowerCase() === columnMatch[1].toLowerCase());
        if (!column) throw new Error(`Unresolved data column ${name}`);
        return { kind: 'column', columnId: column.id };
      }
      throw new Error(`Unsupported variable ${name}`);
    };
    const text = str(field(node.body, 'value')), parts: UIExpression[] = [];
    if(/\[\[|\]\]/.test(text.replace(/\[\[[\s\S]*?\]\]/g,'')))throw new Error('Unmatched expression interpolation delimiters');
    let cursor = 0;
    for (const match of text.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
      if (match.index > cursor) parts.push({ kind: 'literal', value: text.slice(cursor, match.index) });
      parts.push(parseFormula(match[1], resolve)); cursor = match.index + match[0].length;
    }
    if (cursor < text.length || !parts.length) parts.push({ kind: 'literal', value: text.slice(cursor) });
    // A native StringLiteral returns text even when the whole string is one calculation.
    return parts.length === 1 && parts[0].kind === 'literal' ? parts[0] : { kind: 'concat', parts };
  };
  const actions = (node: Value | undefined, depth = 0): Action[] => {
    if (!node || depth > 64) throw new Error('Missing action expression or nesting exceeds 64');
    if (node.className === 'Axure:Expr:Block') return items(field(node.body, 'subexpressions')).flatMap(ref => actions(object(g, ref), depth + 1));
    if (node.className !== 'Axure:Expr:FCall') throw new Error(`Unsupported action expression ${node.className}`);
    const name = str(field(node.body, 'function-name')), args = items(field(node.body, 'args'));
    if (name === 'SetGlobalVariableValue') {
      if (args.length !== 2) throw new Error('Invalid global variable assignment arity');
      return [{ kind: 'set-variable', variable: variableArgument(object(g, args[0])), expression: compile(object(g, args[1])) }];
    }
    if(name==='SetWidgetImage')return [{kind:'set-image',target:pathArgument(object(g,args[0])),expression:compile(object(g,args[1]))}];
    if (!['SetWidgetRichText', 'SetWidgetText', 'SetWidgetFormText', 'SetCheckState'].includes(name)) throw new Error(`Unsupported action function ${name}`);
    if (name === 'SetWidgetRichText') {
      const plain = compile(object(g, args[2]));
      if (plain.kind !== 'literal' || plain.value !== true) throw new Error('Formatted HTML text assignment is unsupported');
    }
    const id = pathArgument(object(g, args[0]));
    return [{ kind: name === 'SetCheckState' ? 'set-selected' : 'set-text', target: id, expression: compile(object(g, args[1]), id) }];
  };
  return { compile, actions, target };
}
