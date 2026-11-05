import { field, items, number, object, prop, str, type Graph } from './graph.ts';
import type { GlobalVariable } from './model.ts';

export function readGlobalVariables(document: Graph): GlobalVariable[] {
  const set = prop(document, document.root, 'GlobalVariableSet');
  const names = new Set<string>();
  return items(field(set?.body, 'global-variables')).map(ref => {
    const variable = object(document, ref);
    if (!variable || variable.className !== 'Axure:GlobalVariable') throw new Error('Unresolved global variable definition');
    const name = str(field(variable.body, 'name'));
    if (!name || names.has(name.toLowerCase())) throw new Error('Empty or duplicate global variable name');
    names.add(name.toLowerCase());
    return { name, defaultValue: str(field(variable.body, 'default-value')), sourceGuid: document.guids[number(field(variable.body, 'variable-id')) - 1] };
  });
}
