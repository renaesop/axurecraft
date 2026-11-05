import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isNavigationUrl} from '../src/navigation.ts';
import {executeActions} from '../src/behavior-runtime.ts';
import type {Action} from '../src/model.ts';
test('navigation accepts prototype pages and rejects executable URL schemes even with embedded whitespace',()=>{
 for(const value of ['page-2.html','#section','https://example.test','mailto:a@example.test','tel:123','about:blank'])assert.equal(isNavigationUrl(value),true);
 for(const value of ['javascript:alert(1)','java\nscript:alert(1)',' data:text/html,<script></script>','vbscript:1'])assert.equal(isNavigationUrl(value),false);
});
test('dynamic links evaluate variables before navigation without losing new-window metadata',async()=>{
 const actions:Action[]=[];
 await executeActions([{kind:'link',navigation:'new',expression:{kind:'variable',name:'url'}}],{readWidget:()=>undefined,readVariable:()=> 'https://example.test/item/7',behaviors:()=>[],isDisabled:()=>false,writeText:()=>{},writeSelected:()=>{},apply:action=>{actions.push(action);}});
 assert.equal(actions[0].value,'https://example.test/item/7');assert.equal(actions[0].navigation,'new');
});
