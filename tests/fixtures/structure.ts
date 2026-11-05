import type {Page,Widget,RichText,RepeaterData} from '../../src/model.ts';
const text=(value:string):RichText=>({kind:'text',css:{},paragraphs:[{css:{},runs:[{text:value,css:{}}]}]});
const widget=(id:string):Widget=>({id,name:id,type:'VectorShape',kind:'shape',x:20,y:20,width:260,height:40,css:{},content:[text('Editable label')],behaviors:[],source:{record:0,objectId:0,guid:id,className:'VectorShape'}});
const page=(name:string,widgets:Widget[]):Page=>({id:name,name,file:name+'.html',width:800,height:600,background:'#fff',widgets,behaviors:[]});
export function structureCases(rowCount=100):Record<string,Page> {
 const mixed=widget('mixed');mixed.content=[{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'Normal ',css:{}},{text:'bold',css:{'font-weight':'700'}},{text:' and ',css:{}},{text:'blue',css:{color:'#06c'}}]}]}];
 const dynamic=widget('dynamic');dynamic.behaviors=[{event:'click',actions:[{kind:'set-rich-text',target:'dynamic',richText:{kind:'text',css:{},paragraphs:[{css:{},runs:[{text:'Total: ',css:{}},{text:'',css:{'font-weight':'700'},expression:{kind:'variable',name:'total'}}]}]}}]}];
 const table=widget('table');table.kind='table';table.type='Table';table.content=[];table.table={columnWidths:[100,160],rowHeights:[30,30,30]};table.children=Array.from({length:6},(_,i)=>({...widget('cell-'+i),type:'TableCell',content:[text('Cell '+i)]}));
 const repeated=widget('rows');repeated.kind='repeater';repeated.type='Repeater';repeated.content=[];
 const data:RepeaterData={columns:[{id:1,name:'Name'}],rows:Array.from({length:rowCount},(_,i)=>({id:String(i),cells:{1:{kind:'text',value:'Value '+i}}})),bindings:[{property:'text',targetGuid:'row-label',expression:{kind:'column',columnId:1}}],template:[widget('row-label')],isolateRadioGroups:true,layout:{direction:'vertical',horizontalSpacing:0,verticalSpacing:2,pageSize:0,startPage:1,wrap:0,paddingLeft:0,paddingTop:0},templateSource:repeated.source};repeated.repeater=data;
 const panel=widget('panel');panel.kind='panel';panel.type='DynamicPanel';panel.content=[];panel.states=[{id:'a',name:'Empty',widgets:[]},{id:'b',name:'Details',widgets:[mixed]}];
 return {plain:page('plain',[widget('plain-label')]),rich:page('rich',[mixed]),assignment:page('assignment',[dynamic]),table:page('table',[table]),repeater:page('repeater',[repeated]),panel:page('panel',[panel])};
}
