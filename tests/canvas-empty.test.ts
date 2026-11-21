import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasEmptyProject} from './fixtures/canvas-empty.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import {createCanvasObject} from '../src/canvas-objects.ts';
import {editCanvas,saveCanvasState,restoreCanvasState} from '../src/flow-canvas-model.ts';
test('JSON rejects zero-page projects; valid empty pages create and restore their first object',()=>{
 assert.throws(()=>parseSemanticProject(JSON.stringify(canvasEmptyProject())),/at least one page/);
 assert.deepEqual(parseSemanticProject(JSON.stringify(canvasEmptyProject(true))),canvasEmptyProject(true));
 const project=canvasEmptyProject(true),page=project.pages[0],before=structuredClone(page);
 const state=createCanvasObject(page,{moves:[],texts:[]},'first','rectangle');
 assert.equal(editCanvas(page,state).widgets.length,1);
 const saved=saveCanvasState(page,project.sourceSha256,state);
 assert.deepEqual(restoreCanvasState(JSON.stringify(saved),page,project.sourceSha256),state);
 assert.deepEqual(page,before);
});
