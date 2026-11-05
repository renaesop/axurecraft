import {nativeExpressions} from './native-expression.ts';
import type { GlobalVariable,RowExpression} from './model.ts';
import { field, number, str, bool, items, object, prop, type Graph, type Value } from './graph.ts';

export interface RepeaterBinding { text?: string; image?: Value }
interface Cell { text?: string; image?: Value }
export interface NativeRowBinding {target:string;kind:'text'|'image';expression?:RowExpression;image?:Value;sourceText?:string}
interface BindingJob { target: string; kind: 'text' | 'image'; expression?: Value; image?: Value }
const ZERO_GUID = '00000000000000000000000000000000';

/** Evaluate only static Item.column interpolation in unconditional template load actions. */
export function repeaterRows(g: Graph, widget: Value, variables: GlobalVariable[] = []): { bindings: Map<string, RepeaterBinding>[]; programs:NativeRowBinding[]; issues: string[] } {
  const problems = new Set<string>();
  const dataset = prop(g, widget, 'Data'), base = prop(g, widget, 'BaseDiagram');
  if (!dataset || !base) return { bindings: [], programs:[], issues: ['Repeater dataset or template is missing'] };
  const columns = new Map<number, string>();
  for (const ref of items(field(dataset.body, 'columns'))) {
    const column = object(g, ref); const name = str(field(column?.body, 'name'));
    if (name) columns.set(number(field(column?.body, 'variable-id'), -1), name.toLowerCase());
  }
  const rows = items(field(dataset.body, 'rows')).map(ref => {
    const row = object(g, ref), cells = new Map<string, Cell>();
    for (const item of items(field(row?.body, 'elements'))) {
      const element = object(g, item), column = columns.get(number(field(element?.body, 'column-id'), -1));
      if (!column) { problems.add('Dataset element has an unresolved column'); continue; }
      const type = number(field(element?.body, 'type'), -1);
      if (type === 0) cells.set(column, { text: str(field(element?.body, 'value')) });
      else if (type === 2) cells.set(column, { image: field(element?.body, 'value-image') });
      else problems.add(`Unsupported dataset cell type ${type}`);
    }
    return cells;
  });
  const owners = [widget, ...items(field(base.body, 'diagram-objects')).map(ref => object(g, ref)).filter((v): v is Value => !!v)];
  const jobs: BindingJob[] = [];
  const guid = (id: number): string | undefined => g.guids[id - 1];
  function target(path: Value | undefined, owner: Value): string | undefined {
    if (!path) return undefined;
    if (items(field(path.body, 'rdo-path')).length) { problems.add('Master-scoped repeater binding omitted'); return undefined; }
    const scope = items(field(path.body, 'repeater-path'));
    if (scope.some(ref => number(ref) !== widget.id)) { problems.add('Binding targets another repeater scope'); return undefined; }
    const id = guid(number(field(path.body, 'object-id'), -1));
    return id === ZERO_GUID ? guid(owner.id ?? -1) : id;
  }
  function call(expression: Value | undefined, owner: Value, depth = 0): void {
    if (!expression || depth > 16) return;
    if (expression.className === 'Axure:Expr:Block') {
      for (const ref of items(field(expression.body, 'subexpressions'))) call(object(g, ref), owner, depth + 1);
      return;
    }
    if (expression.className !== 'Axure:Expr:FCall') { problems.add('Unsupported repeater load expression'); return; }
    const name = str(field(expression.body, 'function-name'));
    if (['SetGlobalVariableValue','SetCheckState','SetWidgetFormText'].includes(name)) return; // Compiled by the runtime action path.
    if (!['SetWidgetRichText', 'SetWidgetText', 'SetWidgetImage'].includes(name)) { problems.add(`Unsupported repeater load function ${name}`); return; }
    const args = items(field(expression.body, 'args'));
    const valueExpression=object(g,args[1]);
    const rawText=str(field(valueExpression?.body,'value'));
    const dynamic=!!field(valueExpression?.body,'scope')?.entries?.length || /\[\[|\]\]/.test(rawText.replace(/\[\[\s*(?:Item|TargetItem)\.[^\[\]\s.()+*/]+\s*\]\]/gi,''));
    if(dynamic){
      try{nativeExpressions(g,owner,variables).actions(expression);return;}catch{/* Retain the binding diagnostic if runtime compilation also fails. */}
    }
    const pathLiteral = object(g, args[0]);
    const path = prop(g, pathLiteral, 'value');
    const id = target(path, owner), value = object(g, args[1]);
    if (id && value) jobs.push({ target: id, kind: name === 'SetWidgetImage' ? 'image' : 'text', expression: value });
    else problems.add('Repeater binding target or expression is unresolved');
  }
  function action(value: Value, owner: Value): void {
    if (bool(field(value.body, 'Disabled'))) return;
    if (value.className === 'Axure:InterationActionSetFunction') { call(prop(g, value, 'action'), owner); return; }
    if (value.className === 'Axure:InteractionSetImageAction') {
      const paths = items(field(value.body, 'ImagePaths')), infos = items(field(value.body, 'ImageStatesInfos'));
      if (paths.length !== infos.length) { problems.add('Image binding parameter lists do not match'); return; }
      for (let i = 0; i < paths.length; i++) {
        const id = target(object(g, paths[i]), owner), info = object(g, infos[i]), normal = prop(g, info, 'Normal');
        if (!id || !normal) { problems.add('Image binding target or state is unresolved'); continue; }
        if (bool(field(normal.body, 'is-static-image'))) jobs.push({ target: id, kind: 'image', image: field(normal.body, 'static-image') });
        else jobs.push({ target: id, kind: 'image', expression: prop(g, normal, 'image-literal') });
      }
      return;
    }
    problems.add(`Unsupported repeater load action ${value.className ?? 'unknown'}`);
  }
  for (const owner of owners) {
    const map = prop(g, owner, 'InteractionMap') ?? prop(g, owner, 'interactionmap');
    if (!map) continue;
    const nodeTable = field(map.body, 'node-table');
    const semantic = (node: Value): Value | undefined => object(g, nodeTable?.entries?.find(([key]) => number(key, -1) === node.id)?.[1]);
    const children = (node: Value | undefined): Value[] => items(field(node?.body, 'children')).map(ref => object(g, ref)).filter((v): v is Value => !!v);
    for (const eventNode of children(prop(g, map, 'tree'))) {
      const event = semantic(eventNode);
      if (!event || bool(field(event.body, 'Disabled')) || ![288, 289].includes(number(field(event.body, 'event-type'), -1))) continue;
      let conditional = false;
      for (const caseNode of children(eventNode)) {
        const kase = semantic(caseNode); if (!kase || bool(field(kase.body, 'Disabled'))) continue;
        if (bool(field(kase.body, 'IsNewIfGroup'))) conditional = false;
        const condition = field(kase.body, 'Condition');
        if (condition && guid(number(condition, -1)) !== ZERO_GUID) conditional = true;
        if (conditional) { problems.add('Conditional repeater load case omitted'); continue; }
        for (const actionNode of children(caseNode)) { const a = semantic(actionNode); if (a) action(a, owner); }
      }
    }
  }
  function compile(expression:Value|undefined,kind:'text'|'image'):RowExpression|undefined {
    if(!expression||expression.className!=='Axure:Expr:StringLiteral'){problems.add('Nonliteral repeater expression omitted');return;}
    const scope=field(expression.body,'scope');
    if(scope?.entries?.length||scope?.items?.length){problems.add('Local-variable repeater expression omitted');return;}
    const scopeId=number(field(expression.body,'repeater-scope'),-1);
    if(scopeId!==dataset!.id&&guid(scopeId)!==ZERO_GUID){problems.add('Expression belongs to another dataset');return;}
    const aliases=new Map<string,number>();
    for(const ref of items(field(expression.body,'variable-identifiers'))){
      const identifier=object(g,ref),name=str(field(identifier?.body,'Name'));
      const match=/^(?:Item|TargetItem)\.(.+)$/i.exec(name),id=number(field(identifier?.body,'Id'),-1);
      if(match&&columns.has(id))aliases.set(match[1].toLowerCase(),id);
    }
    const column=(name:string):number|undefined=>aliases.get(name.toLowerCase())??[...columns].find(([,label])=>label===name.toLowerCase())?.[0];
    const text=str(field(expression.body,'value'));
    const pattern=/\[\[\s*(?:Item|TargetItem)\.([^\[\]\s.()+*/]+)\s*\]\]/gi;
    if(/\[\[|\]\]/.test(text.replace(pattern,''))){problems.add('Unsupported arithmetic or function in repeater expression');return;}
    let cursor=0;const parts:RowExpression[]=[];
    for(const match of text.matchAll(pattern)){
      if(match.index>cursor)parts.push({kind:'literal',value:text.slice(cursor,match.index)});
      const id=column(match[1]);if(id===undefined){problems.add(`Unresolved repeater column ${match[1]}`);return;}
      parts.push({kind:'column',columnId:id});cursor=match.index+match[0].length;
    }
    if(cursor<text.length||!parts.length)parts.push({kind:'literal',value:text.slice(cursor)});
    if(kind==='image'&&(parts.length!==1||parts[0].kind!=='column')){problems.add('Unsupported repeater image expression');return;}
    return parts.length===1?parts[0]:{kind:'concat',parts};
  }
  const programs:NativeRowBinding[]=[];
  for(const job of jobs){
    if(job.image)programs.push({target:job.target,kind:job.kind,image:job.image});
    else {const expression=compile(job.expression,job.kind);if(expression)programs.push({target:job.target,kind:job.kind,expression,sourceText:str(field(job.expression?.body,'value'))});}
  }
  function evaluate(expression:RowExpression,cells:Map<string,Cell>):Cell|undefined {
    if(expression.kind==='literal')return {text:expression.value};
    if(expression.kind==='column')return cells.get(columns.get(expression.columnId)??'');
    const parts=expression.parts.map(e=>evaluate(e,cells));
    return parts.every(p=>p?.text!==undefined)?{text:parts.map(p=>p!.text).join('')}:undefined;
  }
  const bindings=rows.map(cells=>{
    const bound=new Map<string,RepeaterBinding>();
    for(const program of programs){
      const value=program.image?{image:program.image}:program.expression?evaluate(program.expression,cells):undefined;
      if(!value||(program.kind==='image'?!value.image:value.text===undefined)){problems.add(`Missing ${program.kind} value for binding ${program.target}`);continue;}
      bound.set(program.target,{...bound.get(program.target),...value});
    }
    return bound;
  });
  return {bindings,programs,issues:[...problems]};
}
