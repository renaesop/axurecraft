import {test} from 'node:test';import assert from 'node:assert/strict';import {pointerTargets} from '../src/pointer.ts';import {appearanceVariant} from '../src/widget-state.ts';
test('pointer styles respect native selected and disabled priority',()=>{
 const variants={hover:{},pressed:{},selected:{},disabled:{}};assert.equal(appearanceVariant(variants,{hovered:true}),'hover');assert.equal(appearanceVariant(variants,{hovered:true,pressed:true}),'pressed');assert.equal(appearanceVariant(variants,{hovered:true,pressed:true,selected:true}),'selected');assert.equal(appearanceVariant(variants,{hovered:true,pressed:true,selected:true,disabled:true}),'disabled');assert.equal(appearanceVariant({hover:{}},{disabled:true,hovered:true}),'normal');assert.equal(appearanceVariant({hover:{}},{hovered:true,pressed:true}),'hover');
});
test('group pointer propagation owns descendants and stops at explicit container boundaries',()=>{
 const widgets=[{id:'outer',propagateStyles:true,children:['a','inner','boundary']},{id:'a',children:[]},{id:'inner',propagateStyles:true,children:['b']},{id:'b',children:[]},{id:'boundary',propagateStyles:false,children:['c']},{id:'c',children:[]}];
 assert.deepEqual(pointerTargets(widgets,'outer'),['outer','a','inner','b']);assert.deepEqual(pointerTargets(widgets,'a'),[]);assert.deepEqual(pointerTargets(widgets,'inner'),[]);assert.deepEqual(pointerTargets(widgets,'c'),['c']);
});
