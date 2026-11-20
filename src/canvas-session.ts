import type {CanvasState} from './flow-canvas-model.ts';
/** Memory-only checkpoint; a download initiation is not proof of a file written to disk. */
export interface CanvasSession {history:CanvasState[];cursor:number;saved?:CanvasState}
export function canvasSessionDirty(session:CanvasSession):boolean {
 return JSON.stringify(session.history[session.cursor])!==JSON.stringify(session.saved??{moves:[],texts:[]});
}
export function canvasSessionsDirty(sessions:Iterable<CanvasSession>):boolean {
 for(const session of sessions)if(canvasSessionDirty(session))return true;
 return false;
}
