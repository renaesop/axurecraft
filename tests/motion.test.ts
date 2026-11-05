import assert from 'node:assert/strict';
import {test} from 'node:test';
import {movedGeometry} from '../src/motion.ts';
import {nextPanelState} from '../src/panel.ts';
import {executeActions} from '../src/behavior-runtime.ts';
import type {Action} from '../src/model.ts';
const before={x:10,y:20,width:100,height:60,rotation:0};
const literal=(value:number)=>({kind:'literal' as const,value});
test('motion respects absolute/delta coordinates, anchored resize and rotation pivot',()=>{
 assert.deepEqual(movedGeometry(before,{kind:'move',motion:{relative:true,x:literal(-5),y:literal(12)}}),{...before,x:5,y:32});
 assert.deepEqual(movedGeometry(before,{kind:'resize',motion:{width:literal(60),height:literal(40),anchor:'bottom right'}}),{...before,x:50,y:40,width:60,height:40});
 const rotated=movedGeometry(before,{kind:'rotate',motion:{angle:literal(90),anchor:'top left'}});
 assert.equal(rotated.rotation,90);assert.ok(Math.abs(rotated.x+70)<1e-9);assert.equal(rotated.y,40);
 assert.equal(movedGeometry({...before,rotation:45},{kind:'rotate',motion:{angle:literal(90),relative:true,clockwise:false}}).rotation,-45);
});
test('motion expressions read current variables; invalid axes do not partially apply',async()=>{
 const applied:Action[]=[];
 const host={readWidget:()=>undefined,readVariable:()=> '32',behaviors:()=>[],isDisabled:()=>false,writeText:()=>{},writeSelected:()=>{},apply:(a:Action)=>{applied.push(a);}};
 await executeActions([{kind:'move',target:'box',motion:{x:{kind:'variable',name:'X'},y:literal(4)}},{kind:'resize',target:'box',motion:{width:{kind:'literal',value:'oops'},height:literal(8)}}],host);
 assert.equal(applied.length,1);assert.deepEqual(applied[0].motion?.x,literal(32));
});
test('panel steps clamp or loop and state numbers are one based',()=>{
 const states=['a','b'];assert.equal(nextPanelState(states,'b','next',false),'b');assert.equal(nextPanelState(states,'a','previous',false),'a');assert.equal(nextPanelState(states,'b','next',true),'a');assert.equal(nextPanelState(states,'a',2),'b');assert.equal(nextPanelState([],'a','next'),undefined);
});
test('drag boundaries clamp global edges in a parent-relative coordinate frame',()=>{
 const result=movedGeometry(before,{kind:'move',motion:{relative:true,x:literal(300),bounds:{left:literal(100),right:literal(300)}}},{x:100,y:0});assert.equal(result.x,100);
 const left=movedGeometry(before,{kind:'move',motion:{relative:true,x:literal(-300),bounds:{left:literal(100),right:literal(300)}}},{x:100,y:0});assert.equal(left.x,0);
});
