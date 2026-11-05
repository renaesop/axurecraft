export interface PointerWidget {id:string;children:string[];propagateStyles?:boolean}
/** A propagating container owns pointer paint until a non-propagating container boundary. */
export function pointerTargets(widgets:PointerWidget[],id:string):string[] {
 const byId=new Map(widgets.map(w=>[w.id,w])),parents=new Map(widgets.flatMap(w=>w.children.map(child=>[child,w.id] as const)));
 let parent=parents.get(id);const seen=new Set<string>();
 while(parent&&!seen.has(parent)){seen.add(parent);const w=byId.get(parent);if(w?.propagateStyles===false)break;if(w?.propagateStyles)return [];parent=parents.get(parent);}
 const result:string[]=[],visited=new Set<string>();
 const visit=(id:string)=>{if(visited.has(id))return;visited.add(id);const w=byId.get(id);if(!w)return;result.push(id);for(const child of w.children)if(byId.get(child)?.propagateStyles!==false)visit(child);};
 const w=byId.get(id);if(w?.propagateStyles)visit(id);else if(w)result.push(id);return result;
}
