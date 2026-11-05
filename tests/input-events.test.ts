import {test} from 'node:test';import assert from 'node:assert/strict';import {nativeKeyValue,keyValue} from '../src/input-events.ts';
import {evaluateExpression} from '../src/expression.ts';
test('RP9 key literals retain modifiers and decode platform key codes',()=>{assert.equal(nativeKeyValue(26,63233),keyValue('ArrowDown'));assert.equal(nativeKeyValue(44|131072,65),keyValue('A',false,true));assert.notEqual(nativeKeyValue(24|65536,63232),nativeKeyValue(24,63232));assert.throws(()=>nativeKeyValue(24|1048576,63232),/Space modifier/);});
test('event expressions read the current interaction context',()=>{assert.equal(evaluateExpression({kind:'event',property:'dragx'},{readWidget:()=>undefined,readEvent:key=>key==='dragx'?12:undefined}),12);});
