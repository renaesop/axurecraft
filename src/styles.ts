import { type Graph, type Value, field, number, str, bool, items, object, prop } from './graph.ts';

/** Property ids extracted from the official Axure RP 9 API assembly. */
export const P = {
  "LOCATION": 101,
  "SIZE": 105,
  "ANCHOR_HORIZONTAL": 106,
  "ANCHOR_VERTICAL": 107,
  "VISIBLE": 110,
  "PLACED": 111,
  "BASE_STYLE": 0,
  "FONT_NAME": 1,
  "TYPEFACE": 1000,
  "FONT_WEIGHT": 1001,
  "FONT_STYLE": 1002,
  "FONT_STRETCH": 1003,
  "FONT_SIZE": 2,
  "BOLD": 3,
  "ITALIC": 4,
  "UNDERLINE": 5,
  "FORE_GROUND_FILL": 6,
  "FILL": 7,
  "BORDER_FILL": 8,
  "HORIZONTAL_ALIGNMENT": 9,
  "VERTICAL_ALIGNMENT": 10,
  "PADDING_LEFT": 11,
  "PADDING_TOP": 12,
  "PADDING_RIGHT": 13,
  "PADDING_BOTTOM": 14,
  "BORDER_WIDTH": 15,
  "LINE_PATTERN": 16,
  "LINE_ENDS": 17,
  "BULLETED_LIST_LEGACY": 18,
  "NUMBERED_LIST": 19,
  "LINE_SPACING": 20,
  "IX_STYLES": 21,
  "ROTATION": 50,
  "TEXT_ROTATION": 51,
  "HORIZONTAL_ALIGNMENT2": 22,
  "HORIZONTAL_ALIGNMENT3": 23,
  "VERTICAL_ALIGNMENT2": 24,
  "VERTICAL_ALIGNMENT3": 25,
  "PAGE_ALIGNMENT": 26,
  "IMAGE": 27,
  "IMAGE_HORIZONTAL_ALIGNMENT": 28,
  "IMAGE_VERTICAL_ALIGNMENT": 29,
  "IMAGE_REPEAT": 30,
  "COLOR_STYLE": 31,
  "SKETCH_FACTOR": 32,
  "FAVICON": 33,
  "IMAGE_ALIGNMENT": 34,
  "BACK_IMAGE": 35,
  "WRAP": 1200,
  "VERTICAL": 1201,
  "HORIZONTAL_SPACING": 1202,
  "VERTICAL_SPACING": 1203,
  "ITEM_BACK_COLOR": 1204,
  "ITEM_HAS_ALT_COLOR": 1205,
  "ITEM_ALT_COLOR": 1206,
  "ITEMS_PER_PAGE": 1208,
  "START_PAGE": 1209,
  "LOAD_LOCAL_DEFAULT": 1210,
  "OPACITY": 70,
  "CORNER_RADIUS": 71,
  "OUTER_SHADOW": 72,
  "INNER_SHADOW": 73,
  "TEXT_SHADOW": 74,
  "BORDER_VISIBILITY": 80,
  "CORNER_VISIBILITY": 81,
  "IMAGE_FILTER": 90,
  "CHARACTER_SPACING": 91,
  "TEXT_BASELINE": 92,
  "LETTER_CASE": 93,
  "BUTTON_SIZE": 94,
  "STRIKETHROUGH": 95,
  "MASTER_VIEW": 96,
  "BULLETED_LIST": 97
} as const;

export function styleProperties(style: Value | undefined): Map<number, Value> {
  const out = new Map<number, Value>();
  for (const entry of items(field(style?.body ?? style, 'PropList') ?? field(style, 'Props'))) {
    const value = field(entry, 'Value');
    if (value) out.set(number(field(entry, 'DOAName')) & 0x0fffffff, value);
  }
  return out;
}
const guid = (g: Graph, n: Value | undefined): string => g.guids[number(n) - 1] ?? '';

/** Cached named style props are deltas over the document's default style. */
export function resolveStyle(g: Graph, widget: Value, docGraph?: Graph, includeDefaults = true): Map<number, Value> {
  const isStyle = /Style$/.test(widget.className ?? '');
  const ownStyle = isStyle ? widget : prop(g, widget, 'MyStyle');
  const isPage = ownStyle?.className === 'Axure:PageStyle';
  const isPanel = ownStyle?.className === 'Axure:PanelDiagramStyle';
  const result = new Map<number, Value>();
  const merge = (props: Map<number, Value>) => { for (const [key, value] of props) result.set(key, value); };
  const styles = items(field(field(g.root?.body, 'StyleCache'), 'Styles'));
  const defaultCached = styles.find(s => {
    const info = field(s, 'Info');
    return str(field(info, 'Name')) === 'Default' && str(field(info, 'LibraryName')) === '';
  });
  const docSheet = docGraph && prop(docGraph, docGraph.root, isPage ? 'PageStyleSheet' : 'StyleSheet');
  const docDefault = docGraph && prop(docGraph, docSheet, isPage ? 'DefaultPageStyle' : 'DefaultStyle');
  // Page and panel backgrounds have their own defaults, not widget white/border defaults.
  if (includeDefaults && !isPanel) {
    if (isPage && docDefault) merge(styleProperties(docDefault));
    else if (defaultCached) merge(styleProperties(defaultCached));
    else if (docDefault) merge(styleProperties(docDefault));
  }
  const seen = new Set<string>();
  const apply = (graph: Graph, style: Value | undefined) => {
    if (!style) return;
    const props = styleProperties(style);
    const id = guid(graph, props.get(P.BASE_STYLE) ?? field(field(style.body, 'MatchInfo'), 'Id'));
    if (id && !seen.has(id)) {
      seen.add(id);
      const cached = styles.find(s => guid(g, field(field(s, 'Info'), 'Id')) === id);
      if (cached && cached !== style) apply(g, cached);
      else if (docGraph) {
        const base = [...docGraph.objects.values()].find(s => /Style$/.test(s.className ?? '') && guid(docGraph, field(s.body, 'Id')) === id);
        if (base && base !== style) apply(docGraph, base);
      }
    }
    merge(props);
  };
  apply(g, ownStyle);
  return result;
}

/** Interaction styles override an existing widget; document defaults must not overwrite it. */
export function resolveStyleDelta(g: Graph, style: Value, docGraph?: Graph): Map<number, Value> {
  return resolveStyle(g, style, docGraph, false);
}

/** .rp stores colors as unsigned ARGB; transparent white is 0x00ffffff. */
export function argb(value: number): string {
  const n = value >>> 0;
  return `rgba(${(n >>> 16) & 255},${(n >>> 8) & 255},${n & 255},${Number(((n >>> 24) / 255).toFixed(6))})`;
}
export function fillToCss(fill: Value | undefined): string {
  if (!fill) return 'transparent';
  const type = str(field(fill, 'fill-type'));
  if (type === 'solid') return argb(number(field(fill, 'fill-color')));
  const colors = items(field(fill, 'fill-colors'));
  const offsets = items(field(fill, 'fill-offsets'));
  const stops = colors.map((c, i) => `${argb(number(c))} ${100 * number(offsets[i], i / Math.max(1, colors.length - 1))}%`).join(',');
  if (type === 'linear-gradient' && colors.length) {
    const center = field(fill, 'fill-center-point'), axis = field(fill, 'fill-axis1');
    const dx = number(field(axis, 'X'), 1) - number(field(center, 'X'));
    const dy = number(field(axis, 'Y')) - number(field(center, 'Y'));
    return `linear-gradient(${90 + Math.atan2(dy, dx) * 180 / Math.PI}deg,${stops})`;
  }
  if (type === 'radial-gradient' && colors.length) return `radial-gradient(ellipse,${stops})`;
  return 'transparent';
}
const px = (value: number): string => `${Number(value.toFixed(6))}px`;
const truth = (n: Value | undefined): boolean => bool(n) || number(n) === 1;
const fontName = (name: string): string => `${JSON.stringify(name)}, sans-serif`;

/** CSS keys use kebab-case, suitable for serialization to a style attribute. */
export function styleToCss(props: Map<number, Value>): Record<string, string> {
  const get = (id: number, fallback = 0) => number(props.get(id), fallback);
  const css: Record<string, string> = { 'box-sizing': 'border-box' };
  if (props.has(P.FILL)) css.background = fillToCss(props.get(P.FILL));
  if (props.has(P.FORE_GROUND_FILL)) css.color = fillToCss(props.get(P.FORE_GROUND_FILL));
  if (props.has(P.FONT_NAME)) css['font-family'] = fontName(str(props.get(P.FONT_NAME)));
  if (props.has(P.FONT_SIZE)) css['font-size'] = px(get(P.FONT_SIZE) * 4 / 3);
  if (props.has(P.FONT_WEIGHT)) css['font-weight'] = String(get(P.FONT_WEIGHT, 400));
  if (get(P.BOLD) === 1) css['font-weight'] = '700';
  if (get(P.BOLD) === 2) css['font-weight'] = '400';
  if (props.has(P.FONT_STYLE)) css['font-style'] = ['normal', 'italic', 'oblique'][get(P.FONT_STYLE)] ?? 'normal';
  if (get(P.ITALIC) === 1) css['font-style'] = 'italic';
  if (get(P.ITALIC) === 2) css['font-style'] = 'normal';
  const decorations = [truth(props.get(P.UNDERLINE)) ? 'underline' : '', truth(props.get(P.STRIKETHROUGH)) ? 'line-through' : ''].filter(Boolean);
  if (decorations.length) css['text-decoration'] = decorations.join(' ');
  if (props.has(P.CHARACTER_SPACING)) css['letter-spacing'] = px(get(P.CHARACTER_SPACING) * 4 / 3);
  if (get(P.LINE_SPACING) > 0) css['line-height'] = px(get(P.LINE_SPACING) * 4 / 3);
  if (props.has(P.HORIZONTAL_ALIGNMENT)) css['text-align'] = ['left', 'center', 'right', 'justify'][get(P.HORIZONTAL_ALIGNMENT)] ?? 'left';
  if (props.has(P.VERTICAL_ALIGNMENT)) css['justify-content'] = ['flex-start', 'center', 'flex-end'][get(P.VERTICAL_ALIGNMENT)] ?? 'center';
  if (props.has(P.LETTER_CASE)) css['text-transform'] = ['none', 'uppercase', 'lowercase'][get(P.LETTER_CASE)] ?? 'none';
  for (const [name, id] of [['left', P.PADDING_LEFT], ['top', P.PADDING_TOP], ['right', P.PADDING_RIGHT], ['bottom', P.PADDING_BOTTOM]] as const) {
    if (props.has(id)) css[`padding-${name}`] = px(get(id));
  }
  if (props.has(P.BORDER_WIDTH)) {
    css['border-width'] = px(get(P.BORDER_WIDTH));
    css['border-style'] = get(P.LINE_PATTERN) === 9 ? 'none' : get(P.LINE_PATTERN) === 8 ? 'dotted' : get(P.LINE_PATTERN, 1) > 1 ? 'dashed' : 'solid';
    css['border-color'] = fillToCss(props.get(P.BORDER_FILL));
  }
  if (props.has(P.BORDER_VISIBILITY)) {
    const mask = get(P.BORDER_VISIBILITY, 15);
    for (const [side, bit] of [['left', 1], ['top', 2], ['right', 4], ['bottom', 8]] as const) {
      if (!(mask & bit)) css[`border-${side}-width`] = '0px';
    }
  }
  if (props.has(P.CORNER_RADIUS)) css['border-radius'] = px(get(P.CORNER_RADIUS));
  if (props.has(P.OPACITY)) css.opacity = String(get(P.OPACITY, 1));
  if (get(P.ROTATION)) css.transform = `rotate(${get(P.ROTATION)}deg)`;
  if (props.has(P.VISIBLE) && props.get(P.VISIBLE)?.tag === 25 && !bool(props.get(P.VISIBLE))) css.display = 'none';
  const shadows: string[] = [];
  for (const id of [P.OUTER_SHADOW, P.INNER_SHADOW]) {
    const s = props.get(id);
    if (bool(field(s, 'On'))) shadows.push(`${id === P.INNER_SHADOW ? 'inset ' : ''}${px(number(field(s, 'OffsetX')))} ${px(number(field(s, 'OffsetY')))} ${px(number(field(s, 'BlurRadius')))} ${px(number(field(s, 'Spread')))} ${argb(number(field(s, 'Color')))}`);
  }
  if (shadows.length) css['box-shadow'] = shadows.join(',');
  return css;
}

export function textRunToCss(run: Value): Record<string, string> {
  const css: Record<string, string> = {};
  if (field(run, 'Family')) css['font-family'] = fontName(str(field(run, 'Family')));
  if (field(run, 'Size')) css['font-size'] = px(number(field(run, 'Size')) * 4 / 3);
  if (field(run, 'Weight')) css['font-weight'] = String(number(field(run, 'Weight')));
  if (field(run, 'Style')) css['font-style'] = ['normal', 'italic', 'oblique'][number(field(run, 'Style'))] ?? 'normal';
  if (field(run, 'Color')) css.color = argb(number(field(run, 'Color')));
  if (field(run, 'CharacterSpacing')) css['letter-spacing'] = px(number(field(run, 'CharacterSpacing')) * 4 / 3);
  const decorations = [truth(field(run, 'Underline')) ? 'underline' : '', truth(field(run, 'Strikethrough')) ? 'line-through' : ''].filter(Boolean);
  if (decorations.length) css['text-decoration'] = decorations.join(' ');
  const baseline = number(field(run, 'Baseline'));
  if (baseline) css['vertical-align'] = baseline === 1 ? 'super' : 'sub';
  return css;
}
