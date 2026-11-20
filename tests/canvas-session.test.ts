import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasSessionDirty,canvasSessionsDirty} from '../src/canvas-session.ts';
import {canvasPageSessionCases} from './fixtures/canvas-page-session.ts';
import {translateSelection} from '../src/canvas-selection.ts';
test('page checkpoints track content across undo, redo and divergent history',()=>{
 const empty={moves:[],texts:[]},[page]=canvasPageSessionCases();
 const first=translateSelection(page,empty,['entry'],10,0),second=translateSelection(page,first,['entry'],10,0);
 const session={history:[empty,first,second],cursor:1,saved:first};
 assert.equal(canvasSessionDirty(session),false);
 assert.equal(canvasSessionDirty({...session,cursor:0}),true);
 assert.equal(canvasSessionDirty({...session,cursor:2}),true);
 assert.equal(canvasSessionDirty({...session,history:[empty,structuredClone(first)]}),false);
 assert.equal(canvasSessionDirty({...session,history:[empty,second]}),true);
 assert.equal(canvasSessionDirty({history:[empty],cursor:0}),false);
});
test('inactive page edits keep the project dirty; saving another page cannot clear them',()=>{
 const [a,b]=canvasPageSessionCases(),empty={moves:[],texts:[]};
 const changed=translateSelection(a,empty,['entry'],10,0),other=translateSelection(b,empty,['entry'],20,0);
 const sessions=new Map([['a',{history:[empty,changed],cursor:1,saved:empty}],['b',{history:[empty,other],cursor:1,saved:other}]]);
 assert.equal(canvasSessionsDirty(sessions.values()),true);
 sessions.set('a',{history:[empty,changed],cursor:1,saved:changed});
 assert.equal(canvasSessionsDirty(sessions.values()),false);
 assert.equal(canvasSessionsDirty([]),false);
});
