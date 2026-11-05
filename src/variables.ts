import type { GlobalVariable, Scalar } from './model.ts';

/** RP9 scalar globals are case-insensitive strings, scoped to a loaded page. */
export function createVariables(definitions: GlobalVariable[] = [], hash = '', pageName = '') {
  const defaults = new Map(definitions.map(variable => [variable.name.toLowerCase(), variable.defaultValue]));
  const values = new Map<string, string>();
  const read = (name: string): string => {
    const key = name.toLowerCase();
    return values.get(key) ?? defaults.get(key) ?? (key === 'pagename' ? pageName : '');
  };
  const write = (name: string, value: Scalar): void => { values.set(name.toLowerCase(), String(value)); };
  // Match RP9's fragment protocol: '+' is literal; only values are URI-decoded.
  for (const part of hash.replace(/^#/, '').split('&')) {
    const [name, value] = part.split('=');
    if (name && name !== 'CSUM') write(name, decodeURIComponent(String(value)));
  }
  const link = (base: string): string => {
    const changed = definitions.filter(variable => read(variable.name) !== variable.defaultValue);
    if (!changed.length) return base;
    return base + '#' + changed.map(variable => variable.name + '=' + encodeURIComponent(read(variable.name))).join('&') + '&CSUM=1';
  };
  return { read, write, link };
}

/** Serialize current values before a prototype reload; ordinary browser reload uses its existing URL. */
export function reloadWithVariables(variables: ReturnType<typeof createVariables>, include = true): void {
  const base = location.href.split('#')[0];
  history.replaceState(history.state, '', include ? variables.link(base) : base);
  location.reload();
}
