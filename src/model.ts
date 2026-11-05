/** Editable UI model. RP storage details stay in the lossless AST and source references.
 * This describes visual widgets and supported behavior, not inferred business components.
 */
export type Scalar = string | number | boolean;
export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '>' | '<' | '>=' | '<=' | '&&' | '||';
/** Portable, inspectable expressions; native RP references are resolved during conversion. */
export type UIExpression =
    | { kind: 'literal'; value: Scalar }
    | { kind: 'widget'; target: string; property: 'text' | 'selected' }
    | { kind: 'variable'; name: string }
    | { kind: 'length'; value: UIExpression }
    | { kind: 'column'; columnId: number }
    | { kind: 'concat'; parts: UIExpression[] }
    | { kind: 'binary'; operator: BinaryOperator; left: UIExpression; right: UIExpression }
    | { kind: 'unary'; operator: '+' | '-' | '!'; operand: UIExpression }
    | { kind: 'call'; method: 'slice' | 'toFixed'; receiver: UIExpression; args: UIExpression[] };
export interface ConditionalBranch {
    condition?: UIExpression;
    actions: Action[];
}
export interface Action {
    kind: 'link' | 'back' | 'refresh' | 'show' | 'hide' | 'toggle' | 'state' | 'enable' | 'wait' | 'repeater-sort' | 'repeater-page' | 'set-text' | 'set-selected' | 'set-variable' | 'branch';
    target?: string;
    value?: string | number | boolean;
    sort?: RepeaterSort;
    expression?: UIExpression;
    variable?: string;
    includeVariables?: boolean;
    /** First matching branch executes; separate branch actions represent independent if groups. */
    branches?: ConditionalBranch[];
}
export interface Behavior {
    event: string;
    actions: Action[];
}
export type Css = Record<string, string>;
export interface TextRun {
    text: string;
    css: Css;
}
export interface RichText {
    kind: 'text';
    css: Css;
    paragraphs: {
        css: Css;
        runs: TextRun[];
    }[];
}
export interface VectorPath {
    data: string;
    fill: string;
    fillOpacity: number;
    stroke?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
    dashArray?: string;
    markerStart?: string;
    markerEnd?: string;
}
export interface VectorGradient {
    id: string;
    from: {
        x: number;
        y: number;
    };
    to: {
        x: number;
        y: number;
    };
    stops: {
        offset: number;
        color: string;
        opacity: number;
    }[];
}
export interface VectorMarker {
    id: string;
    data: string;
    color: string;
    filled: boolean;
}
export interface VectorGraphic {
    kind: 'vector';
    width: number;
    height: number;
    paths: VectorPath[];
    gradients: VectorGradient[];
    markers: VectorMarker[];
}
export interface ImageContent {
    kind: 'image';
    asset: string;
    alt: string;
}
export interface FormControl {
    kind: 'control';
    control: 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'button';
    label: string;
    value: string;
    placeholder: string;
    disabled: boolean;
    readOnly: boolean;
    checked?: boolean;
    group?: string;
    richLabel?: RichText;
    options?: {
        label: string;
        value: string;
    }[];
}
export type WidgetContent = RichText | VectorGraphic | ImageContent | FormControl;
/** State paint. Omitted content reuses the widget's content; layout and behavior stay on the widget. */
export interface WidgetAppearance {
    css: Css;
    content?: WidgetContent[];
}
/** Provenance for diagnostics and native binding resolution; not rendered content. */
export interface SourceReference {
    record: number;
    objectId: number;
    guid: string;
    className: string;
}
export type DataCell = {
    kind: 'text';
    value: string;
} | {
    kind: 'image';
    asset: string | null;
} | {
    kind: 'unsupported';
    type: number;
};
export type RowExpression = {
    kind: 'literal';
    value: string;
} | {
    kind: 'column';
    columnId: number;
} | {
    kind: 'concat';
    parts: RowExpression[];
};
export interface RowBinding {
    targetGuid: string;
    property: 'text' | 'image';
    expression: RowExpression;
    sourceText?: string;
}
export interface RepeaterSort {
    columnId: number;
    ascending: boolean;
    type: 'number' | 'text';
    label: string;
    toggle?: boolean;
}
/** Runtime state, held separately from the serialized repeater template and rows. */
export interface RepeaterState {
    page: number;
    sorts: RepeaterSort[];
    revision: number;
}
/** Canonical repeater definition. Derive visible instances from template + rows + bindings. */
export interface RepeaterData {
    columns: {
        id: number;
        name: string;
    }[];
    rows: {
        id: string;
        cells: Record<string, DataCell>;
    }[];
    bindings: RowBinding[];
    template: Widget[];
    isolateRadioGroups: boolean;
    /** RP9 can scope exclusive selection groups to individual repeater rows. */
    isolateSelectionGroups?: boolean;
    layout: {
        direction: 'vertical' | 'horizontal';
        horizontalSpacing: number;
        verticalSpacing: number;
        pageSize: number;
        startPage: number;
        wrap: number;
        paddingLeft: number;
        paddingTop: number;
    };
    templateSource: SourceReference;
}
export interface Widget {
    id: string;
    /** Native class shorthand, retained for compatibility; kind is the UI classification. */
    type: string;
    name: string;
    /** Parent-relative geometry. For groups, size describes member bounds, not a painted hit area. */
    x: number;
    y: number;
    width: number;
    height: number;
    css: Css;
    content: WidgetContent[];
    behaviors: Behavior[];
    source: SourceReference;
    /** Initial widget state; when omitted, legacy FormControl.disabled is used. */
    disabled?: boolean;
    selected?: boolean;
    selectionGroup?: string;
    variants?: { disabled?: WidgetAppearance; selected?: WidgetAppearance };
    kind: 'group' | 'shape' | 'image' | 'hotspot' | 'panel' | 'repeater' | 'control' | 'unsupported';
    repeater?: RepeaterData;
    /** Derived view only: materializeRepeater adds this; conversion does not serialize it. */
    instance?: {
        repeaterId: string;
        rowId: string;
        templateId: string;
    };
    /** Ordinary descendants. Canonical repeaters use repeater.template, never cached row children. */
    children?: Widget[];
    states?: {
        css?: Css;
        id: string;
        name: string;
        widgets: Widget[];
    }[];
}
export interface Page {
    alignment?: 'left' | 'center';
    /** Authored left edge, retained separately from source coordinates. */
    contentLeft?: number;
    id: string;
    name: string;
    file: string;
    width: number;
    height: number;
    background: string;
    widgets: Widget[];
    behaviors: Behavior[];
}
export interface ConversionIssue {
    page?: string;
    widget?: string;
    feature: string;
    detail: string;
}
export interface GlobalVariable {
    name: string;
    defaultValue: string;
    /** Identity in the source RP, used to resolve aliases after variable renames. */
    sourceGuid?: string;
}
/** Version 2 uses executable repeater templates instead of expanded initial rows. */
export interface Project {
    schema: 'axure-semantic';
    schemaVersion: 2;
    sourceSha256: string;
    variables?: GlobalVariable[];
    pages: Page[];
    issues: ConversionIssue[];
    stats: Record<string, number>;
}
