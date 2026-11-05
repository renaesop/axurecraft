import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {appearanceVariant,canSelectWidget,type WidgetStateDefinition} from '../src/widget-state.ts';
import {executeActions,valueAction} from '../src/behavior-runtime.ts';

const directory=process.env.AXURE_SCRIPT_DIRECTORY??'/Volumes/Axure RP 9/Axure RP 9.app/Contents/Resources/DefaultSettings/Prototype_Files/resources/scripts/axure/';
const style=readFileSync(directory+'style.js','utf8'),querySource=readFileSync(directory+'axQuery.std.js','utf8');
const selectedStart=style.indexOf('$ax.style.SetWidgetSelected = function('),selectedEnd=style.indexOf('$ax.style.SetWidgetPlaceholder = function(',selectedStart);
const queryStart=querySource.indexOf('$ax.public.fn.selected = function('),queryEnd=querySource.indexOf('$ax.public.fn.focus = function(',queryStart);
assert.ok(selectedStart>=0&&selectedEnd>selectedStart&&queryStart>=0&&queryEnd>queryStart);
let comparisons=0,eventChecks=0;
for(const type of ['image','checkbox'])for(const hasSelected of [false,true])for(const hasDisabled of [false,true]){
  const widget:WidgetStateDefinition={id:'widget',kind:type==='image'?'image':'control',selectionControl:type==='checkbox'?'checkbox':undefined,visible:true,disabled:false,selected:false,children:[],states:[],behaviors:[],rowInstance:false};
  const nativeDisabled:Record<string,boolean>={},nativeSelected:Record<string,boolean>={};
  let nativeChecked=false,nativePaint='normal',nativeEvents:boolean[]=[];
  const variants={selected:hasSelected,disabled:hasDisabled};
  const fn:any={};
  for(const predicate of ['IsTreeNodeObject','IsImageBox','IsVector','IsTableCell','IsDynamicPanel','IsLayer','IsTextArea','IsTextBox','IsListBox','IsComboBox','IsCheckBox','IsRadioButton'])fn[predicate]=()=>predicate===(type==='image'?'IsImageBox':'IsCheckBox');
  const object={id:'widget',type,isContained:false};
  const jquery:any=()=>({attr:()=>undefined,hasClass:()=>false,find:()=>({css:()=>{}}),prop:(key:string,value?:boolean)=>{
    if(key==='checked'){if(value!==undefined)nativeChecked=value;return nativeChecked;}
  }});
  jquery.inArray=(value:unknown,array:unknown[])=>array.indexOf(value);
  const ax:any={style:{},public:{fn},getTypeFromElementId:()=>type,INPUT:(id:string)=>id+'_input',getObjectFromElementId:()=>object,
    repeater:{getItemIdFromElementId:()=>undefined,getScriptIdFromElementId:(id:string)=>id},getPathFromScriptId:(id:string)=>[id],getElementIdFromPath:(path:string[])=>path.at(-1),
    event:{mouseOverIds:[],raiseSelectedEvents:(_id:string,value:boolean)=>nativeEvents.push(value)}};
  const query=()=>({getElementIds:()=>['widget']});
  const context=vm.createContext({$ax:ax,$axure:query,$obj:()=>object,$jobj:jquery,$:jquery,
    _selectedWidgets:nativeSelected,_disabledWidgets:nativeDisabled,_isWidgetDisabled:(id:string)=>!!nativeDisabled[id],
    _widgetHasState:(_id:string,state:string)=>state==='disabled'?hasDisabled:state==='selected'?hasSelected:false,
    _generateMouseState:(_id:string,_mouse:string,selected:boolean)=>selected&&hasSelected?'selected':'normal',
    _applyImageAndTextJson:(_id:string,state:string)=>nativePaint=state,_updateElementIdImageStyle:()=>{},
    MOUSE_DOWN:'mouseDown',MOUSE_OVER:'mouseOver',NORMAL:'normal',SELECTED:'selected',DISABLED:'disabled'});
  // Original selection/cache/disabled logic; DOM, hover resolution and painting are adapters.
  vm.runInContext(style.slice(selectedStart,selectedEnd),context);
  vm.runInContext(querySource.slice(queryStart,queryEnd),context);
  const actual={disabled:false,selected:false,selectedPaint:false};let actualEvents:boolean[]=[];
  const host={
    readWidget:()=>actual.selected,isDisabled:()=>actual.disabled,canSelect:()=>canSelectWidget(widget,actual.disabled),selectionEventState:()=>actual.selectedPaint,
    writeText:()=>{},writeSelected:(_id:string,value:boolean)=>{actual.selected=value;if(!actual.disabled)actual.selectedPaint=value;},
    behaviors:()=>[{event:'select',actions:[{kind:'link' as const,value:'selected'}]},{event:'unselect',actions:[{kind:'link' as const,value:'unselected'}]}],
    apply:(action:any)=>{actualEvents.push(action.value==='selected');},
  };
  // Includes checked/style-cache divergence after programmatically clearing a disabled checkbox.
  const sequence:[string,boolean][]=[['select',true],['enable',false],['select',false],['enable',true],['select',true],['select',false],['enable',false],['select',true],['enable',true],['select',false]];
  for(let cycle=0;cycle<10;cycle++)for(const [operation,value]of sequence){
    nativeEvents=[];actualEvents=[];
    if(operation==='enable'){ax.style.SetWidgetEnabled('widget',value);actual.disabled=!value;}
    else{fn.selected.call(query(),value);await executeActions([valueAction('widget','selected',value)],host);}
    const nativeValue=fn.selected.call(query());
    assert.equal(actual.selected,nativeValue,`${type} selected/${hasSelected} disabled/${hasDisabled}: ${operation}=${value}`);
    assert.equal(appearanceVariant(variants,actual),nativePaint);
    assert.deepEqual(actualEvents,nativeEvents);comparisons++;eventChecks++;
  }
}
const report={passed:true,comparisons,eventChecks,sources:[['style.js',style],['axQuery.std.js',querySource]].map(([name,source])=>({name,sha256:createHash('sha256').update(source).digest('hex')})),scope:'Original RP9 selected() and SetWidgetSelected/Enabled with image/checkbox fixtures. Disabled write policy, checked/style-cache distinction, event suppression and normal/selected/disabled paint choice. DOM, hover/focus, selection groups and initial exported HTML classes are adapters or excluded; not native visual parity.'};
writeFileSync('research/native-selection-validation.json',JSON.stringify(report,null,2));console.log(report);
