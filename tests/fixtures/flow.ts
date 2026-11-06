import {parseConnector} from '../../src/connector.ts';
import type {Graph,Value} from '../../src/graph.ts';
import type {Widget,Page,RichText,ConnectorInfo} from '../../src/model.ts';
type Point={x:number;y:number};
const value=(v:unknown):Value=>Array.isArray(v)?{tag:2,items:v.map(value)}:v!==null&&typeof v==='object'?{tag:1,entries:Object.entries(v).map(([k,v])=>[{tag:8,text:k},value(v)])}:typeof v==='string'?{tag:8,text:v}:{tag:3,value:v as number};
const text=(label:string):RichText=>({kind:'text',css:{'justify-content':'center','text-align':'center','font-family':'Arial','font-size':'16px'},paragraphs:[{css:{},runs:[{text:label,css:{}}]}]});
const widget=(id:string,x:number,y:number,width:number,height:number):Widget=>({id,name:id,type:'VectorShape',kind:'shape',x,y,width,height,css:{},content:[],behaviors:[],source:{record:0,objectId:0,guid:id,className:'VectorShape'}});
function node(id:string,x:number,y:number,label:string,shape:'box'|'end'|'decision'='box'):Widget {
 const w=widget(id,x,y,140,shape==='decision'?80:44);w.name=label;w.css={background:'#edf4ff',border:'2px solid #2b5c88','border-radius':shape==='end'?'22px':'4px'};w.content=[text(label)];
 if(shape==='decision'){w.css={};w.content.unshift({kind:'vector',width:140,height:80,gradients:[],markers:[],paths:[{data:'M 70 1 L 139 40 L 70 79 L 1 40 Z',fill:'#fff1ce',fillOpacity:1,stroke:'#2b5c88',strokeWidth:2}]});}
 return w;
}
interface End extends Point {target?:string}
function edge(id:string,start:End,end:End,routing:ConnectorInfo['routing']='straight',points:Point[]=[],label='',double=false,dash=false,endings={Start:double?3:1,End:3}):Widget {
 const type=['rounded','orthogonal','straight','curve'].indexOf(routing),objects=new Map<number,Value>(),segments=[...points,end];segments.forEach((p,i)=>{const from=i?points[i-1]:start;objects.set(i+1,{tag:9,body:value({'from-x':from.x,'from-y':from.y,'to-x':p.x,'to-y':p.y})});});
 const raw:Value={tag:9,body:value({'end-point-x':end.x,'end-point-y':end.y,'connector-type':type,segments:segments.map((_,i)=>i+1),'control-points':routing==='curve'?[{LowerHandle:{X:points[0]?.x,Y:points[0]?.y},HigherHandle:{X:points[1]?.x,Y:points[1]?.y}}]:[]})};
 const geometry=parseConnector({objects,guids:[]} as unknown as Graph,raw,new Map([[101,value({X:start.x,Y:start.y})],[8,value({'fill-type':'solid','fill-color':0xff2b5c88})],[15,value(2)],[16,value(dash?2:1)],[17,value(endings)]]),id)!;
 const w=widget(id,geometry.x,geometry.y,geometry.width,geometry.height);w.type='Connector';w.connection={routing,start:start.target?{target:start.target}:{},end:end.target?{target:end.target}:{}};w.content=[geometry.graphic];if(label){w.name=label;w.content.push(text(label));}return w;
}
const page=(id:string,widgets:Widget[]):Page=>({id,name:id,file:id+'.html',width:760,height:600,background:'#fff',behaviors:[],widgets});
/** Original fixture reproducing the stale endpoint cache found in a public RP9. */
export function flowAttachmentCase():Page {
 const a=node('source',40,300,'Source'),b=node('target',400,20,'Target');
 const g={guids:['source','target','a70aa02f1f4bdc499321e356041b831c','a70aa03f1f4bdc499321e356041b831c'],objects:new Map<number,Value>([
  [1,{tag:9,body:value({})}],[2,{tag:9,body:value({})}],
  [5,{tag:9,body:value({'from-x':180,'from-y':322,'to-x':470,'to-y':322})}],
  [6,{tag:9,body:value({'from-x':470,'from-y':322,'to-x':470,'to-y':64})}],
 ])} as unknown as Graph;
 const raw:Value={tag:9,body:value({'start-diagram-object':1,'end-diagram-object':2,'start-connector-id':3,'end-connector-id':4,'end-point-x':472,'end-point-y':69,'connector-type':0,segments:[5,6]})};
 const {graphic,...geometry}=parseConnector(g,raw,new Map([[101,value({X:180,Y:322})],[8,value({'fill-type':'solid','fill-color':0xff2b5c88})],[15,value(2)],[17,value({Start:1,End:3})]]),'reattached',target=>{
  const w=target===g.objects.get(1)?a:b;return new Map([[101,value({X:w.x,Y:w.y})],[105,value({Width:w.width,Height:w.height})]]);
 })!;
 const line:Widget={...widget('reattached',geometry.x,geometry.y,geometry.width,geometry.height),type:'Connector',connection:{routing:'rounded',start:{target:a.id},end:{target:b.id}},content:[graphic]};
 return page('flow-attachments',[line,a,b,
  edge('thin',{x:670,y:114,target:'thin-a'},{x:672,y:424,target:'thin-b'},'rounded',[{x:672,y:114}]),
  node('thin-a',600,70,'Thin source'),node('thin-b',602,424,'Thin target'),
 ]);
}
export function flowEndingCase():Page {
 return {...page('flow-endings',[
  edge('horizontal-circles',{x:60.5,y:80.5},{x:220.5,y:80.5},'straight',[],'',false,false,{Start:18,End:19}),
  edge('vertical-circles',{x:340.5,y:40.5},{x:340.5,y:180.5},'straight',[],'',false,false,{Start:19,End:18}),
 ]),background:'rgba(242,242,242,0.6)'};
}
export function flowCases():Record<string,Page> {
 const start=node('start',40,60,'Start','end'),process=node('process',300,60,'Process'),end=node('end',300,230,'End','end');
 const chain=page('flow-chain',[edge('start-process',{x:180,y:82,target:'start'},{x:300,y:82,target:'process'}),edge('process-end',{x:370,y:104,target:'process'},{x:370,y:230,target:'end'}),start,process,end]);
 const decision=page('flow-decision',[
  edge('entry-check',{x:370,y:64,target:'entry'},{x:370,y:140,target:'check'}),
  edge('check-accept',{x:300,y:180,target:'check'},{x:160,y:300,target:'accept'},'orthogonal',[{x:160,y:180}], 'Yes'),
  edge('check-reject',{x:440,y:180,target:'check'},{x:580,y:300,target:'reject'},'rounded',[{x:580,y:180}], 'No'),
  edge('accept-finish',{x:160,y:344,target:'accept'},{x:300,y:492,target:'finish'},'orthogonal',[{x:160,y:492}]),
  edge('reject-finish',{x:580,y:344,target:'reject'},{x:440,y:492,target:'finish'},'curve',[{x:580,y:460},{x:490,y:492}]),
  node('entry',300,20,'Start','end'),node('check',300,140,'Approved?','decision'),node('accept',90,300,'Accept'),node('reject',510,300,'Revise'),node('finish',300,470,'Finish','end'),
 ]);
 const loop=page('flow-loop',[
  edge('check-work',{x:230,y:140,target:'loop-check'},{x:420,y:162,target:'work'},'orthogonal',[{x:325,y:140},{x:325,y:162}]),
  edge('work-check',{x:490,y:184,target:'work'},{x:160,y:180,target:'loop-check'},'rounded',[{x:490,y:300},{x:160,y:300}], 'Retry',false,true),
  edge('check-self',{x:90,y:140,target:'loop-check'},{x:160,y:100,target:'loop-check'},'curve',[{x:0,y:20},{x:140,y:0}]),
  edge('work-done',{x:560,y:162,target:'work'},{x:620,y:162,target:'done'},'straight',[], '',true),
  node('loop-check',90,100,'Ready?','decision'),node('work',420,140,'Work'),node('done',620,140,'Done','end'),
 ]);
 const lane=(id:string,y:number,label:string,children:Widget[]):Widget=>({...widget(id,20,y,720,200),name:label,type:'Layer',kind:'group',children:[{...widget(id+'-background',0,0,720,200),css:{border:'1px solid #b6c7d9',background:'#f8fafc'}},{...node(id+'-title',10,6,label),width:120,height:30,css:{},content:[text(label)]},...children]});
 const lanes=page('flow-lanes',[
  lane('user-lane',20,'User',[node('submit',50,70,'Submit'),node('receive',500,70,'Receive')]),
  lane('service-lane',280,'Service',[node('validate',50,70,'Validate'),node('store',500,70,'Store')]),
  edge('submit-validate',{x:140,y:134,target:'submit'},{x:140,y:350,target:'validate'}),
  edge('validate-store',{x:210,y:372,target:'validate'},{x:520,y:372,target:'store'},'straight',[],'Saved'),
  edge('store-receive',{x:590,y:350,target:'store'},{x:590,y:134,target:'receive'}),
 ]);
 return {flowChain:chain,flowDecision:decision,flowLoop:loop,flowLanes:lanes};
}
