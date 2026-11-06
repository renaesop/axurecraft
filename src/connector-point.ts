import {field,number,type Graph,type Value} from './graph.ts';
import {P} from './styles.ts';

export interface Point {x:number;y:number}
// GUIDs use the byte order of the RP GUID table, not System.Guid.ToString().
const defaults:Record<string,Point>={
 '4ffb380b33f19a4791117af9ea33bbd0':{x:.5,y:0},
 '0c0da41305fd2748bca3d523cb855c91':{x:0,y:.5},
 'a70aa02f1f4bdc499321e356041b831c':{x:1,y:.5},
 'a70aa03f1f4bdc499321e356041b831c':{x:.5,y:1},
};
const xy=(v:Value|undefined):Point=>({x:number(field(v,'X'),NaN),y:number(field(v,'Y'),NaN)});
const valid=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
/** An explicit dictionary replaces the defaults, including moved/deleted default ports. */
export function connectorPort(g:Graph,target:Value,port:string):Point|undefined {
 const custom=field(target.body,'ConnectorPoints');
 const p=custom?xy(custom.entries?.find(([key])=>g.guids[number(key)-1]===port)?.[1]):defaults[port];
 return p&&valid(p)?{...p}:undefined;
}
/** RP9 Connector.StartPoint/EndPoint resolve the target's rotated sizing rect,
 * then round to whole page units with MidpointRounding.AwayFromZero. */
export function connectorPoint(g:Graph,target:Value,port:string,props:Map<number,Value>):Point|undefined {
 const p=connectorPort(g,target,port);if(!p)return;
 const loc=xy(props.get(P.LOCATION)),size=props.get(P.SIZE),width=number(field(size,'Width'),NaN),height=number(field(size,'Height'),NaN);
 if(!valid(loc)||!Number.isFinite(width)||!Number.isFinite(height))return;
 const angle=number(props.get(P.ROTATION))*Math.PI/180,dx=(p.x-.5)*width,dy=(p.y-.5)*height;
 const round=(v:number)=>Math.sign(v)*Math.round(Math.abs(v));
 return {x:round(loc.x+width/2+dx*Math.cos(angle)-dy*Math.sin(angle)),y:round(loc.y+height/2+dx*Math.sin(angle)+dy*Math.cos(angle))};
}
