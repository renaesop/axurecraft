/** Editable UI model. RP storage details stay in the lossless AST and source references.
 * This describes visual widgets and supported behavior, not inferred business components.
 */
export type WidgetProperty='left'|'right'|'top'|'bottom'|'state'|'text'|'selected'|'x'|'y'|'width'|'height'|'rotation'|'visible'|'disabled'|'itemCount'|'visibleItemCount'|'dataCount'|'pageCount'|'pageIndex';
export type Scalar = string | number | boolean;
export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '>' | '<' | '>=' | '<=' | '&&' | '||';
/** Portable, inspectable expressions; native RP references are resolved during conversion. */
export type UIExpression =
    | {kind:'row-index'}
    | {kind:'event';property:string}
    | {kind:'now'}
    | { kind: 'literal'; value: Scalar }
    | { kind: 'widget'; target: string; property: WidgetProperty }
    | { kind: 'variable'; name: string }
    | { kind: 'length'; value: UIExpression }
    | { kind: 'column'; columnId: number }
    | { kind: 'concat'; parts: UIExpression[] }
    | { kind: 'binary'; operator: BinaryOperator; left: UIExpression; right: UIExpression }
    | { kind: 'unary'; operator: '+' | '-' | '!'; operand: UIExpression }
    | { kind: 'call'; method: import('./expression-methods.ts').FormulaMethod; receiver: UIExpression; args: UIExpression[] };
export interface ConditionalBranch {
    condition?: UIExpression;
    actions: Action[];
}
export type ImageState='normal'|'selected'|'disabled'|'hover'|'pressed';
export interface Action {
    kind: 'link' | 'back' | 'refresh' | 'show' | 'hide' | 'toggle' | 'state' | 'enable' | 'wait' | 'move' | 'resize' | 'rotate' | 'set-image' | 'tree-toggle' | 'adaptive-view' | 'repeater-data' | 'repeater-sort' | 'repeater-page' | 'focus' | 'fire-event' | 'set-text' | 'set-rich-text' | 'set-selected' | 'set-variable' | 'branch';
    target?: string;
    value?: string | number | boolean;
    sort?: RepeaterSort;
    repeaterAction?: RepeaterAction;
    expression?: UIExpression;
    richText?: RichTextTemplate;
    variable?: string;
    includeVariables?: boolean;
    imageState?:ImageState;
    navigation?: 'current' | 'new' | 'popup' | 'parent' | 'frame' | 'parent-frame';
    windowFeatures?: string;
    loop?: boolean;
    repeat?:{interval:number;skipFirst?:boolean};
    showWhenSet?:boolean;
    transition?: {show:number;hide:number;showDuration:number;hideDuration:number;bringToFront?:boolean};
    popup?:{mode:'flyout'|'lightbox';source?:string;background?:string};
    compression?: {vertical:boolean;easing:number;duration:number};
    motion?: {
        bounds?:Partial<Record<'left'|'right'|'top'|'bottom',UIExpression>>;
        x?: UIExpression; y?: UIExpression; width?: UIExpression; height?: UIExpression;
        angle?: UIExpression; offsetX?: UIExpression; offsetY?: UIExpression;
        relative?: boolean; clockwise?: boolean; anchor?: string; duration?: number; easing?: number;
    };
    /** First matching branch executes; separate branch actions represent independent if groups. */
    branches?: ConditionalBranch[];
}
export interface Behavior {
    event: string;
    actions: Action[];
}
export type Css = Record<string, string>;
export interface TextRun {
    link?: {behaviors:Behavior[]};
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
/** Rich assignments retain authored runs; only interpolation fragments are evaluated. */
export type RichTextTemplate = Omit<RichText, 'paragraphs'> & {
    paragraphs: (Omit<RichText['paragraphs'][number], 'runs'> & {
        runs: (TextRun & {expression?: UIExpression})[];
    })[];
};
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
    /** Null retains an empty repeater image slot and its frame until row binding. */
    asset: string | null;
    alt: string;
    frame?: { id: string; width: number; height: number; radius: number; borderWidth: number; borderColor: string };
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
    listBox?: boolean;
    maxLength?: number;
    inputType?: import('./controls.ts').InputType;
    hideHintOnFocus?: boolean;
    richLabel?: RichText;
    indicator?:Css;
    multiple?:boolean;
    selectedValues?:string[];
    options?: {
        label: string;
        value: string;
    }[];
}
export interface FrameContent {
    kind: 'frame';
    src: string;
    name: string;
    title: string;
    border: boolean;
    scrolling: 'auto' | 'yes' | 'no';
}
export type WidgetContent = RichText | VectorGraphic | ImageContent | FormControl | FrameContent;
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
    type: 'number' | 'text' | 'text-case';
    label: string;
    toggle?: boolean;
}
export type RepeaterCellValue = DataCell | {kind:'expression';expression:UIExpression};
export interface RepeaterAction {
 operation:'filter'|'remove-filter'|'remove-sort'|'add'|'delete'|'update'|'mark';
 label?:string;clear?:boolean;condition?:UIExpression;
 selection?:'this'|'all'|'rule'|'marked';rowId?:string;mark?:boolean;
 rows?:Record<string,RepeaterCellValue>[];values?:Record<string,RepeaterCellValue>;
}
/** Runtime state, held separately from the serialized repeater template and rows. */
export interface RepeaterState {
    page: number;
    sorts: RepeaterSort[];
    revision: number;
    rows?: RepeaterData['rows'];
    filters?: {label:string;condition:UIExpression}[];
    marked?: string[];
    nextRowId?: number;
}
/** Canonical repeater definition. Derive visible instances from template + rows + bindings. */
export interface RepeaterData {
    itemLoad?:Behavior[];
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
    /** Native connector topology. Geometry remains the authored vector path. */
    connection?: ConnectorInfo;
    adaptive?:Record<string,import('./adaptive.ts').AdaptivePaint>;
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
    propagateStyles?:boolean;
    variants?: Partial<Record<'disabled'|'selected'|'hover'|'pressed',WidgetAppearance>>;
    kind: 'group' | 'shape' | 'image' | 'hotspot' | 'panel' | 'repeater' | 'table' | 'menu' | 'frame' | 'tree' | 'control' | 'unsupported';
    /** Fixed native table tracks; children are cells in row-major order. */
    panel?: import('./panel.ts').PanelLayout;
    tree?: import('./tree.ts').TreeNode;
    menu?: {trigger:string};
    table?: { rowHeights: number[]; columnWidths: number[] };
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
export interface ConnectorInfo {
    routing:'straight'|'orthogonal'|'rounded'|'curve';
    /** A missing target means a deliberately unattached endpoint, not a guessed node. */
    start:{target?:string;port?:string};
    end:{target?:string;port?:string};
}
export interface Page {
    adaptive?:import('./adaptive.ts').AdaptiveDefinition;
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
