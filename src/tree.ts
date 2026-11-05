import type {Widget} from './model.ts';
export interface TreeNode {root:boolean;expanded:boolean;nodes:string[];toggleId?:string;labelId?:string;rowHeight:number}
interface Node {id:string;tree?:TreeNode;geometry?:{x:number;y:number;width:number;height:number}}
export interface TreePlacement {id:string;y:number;visible:boolean;height:number}
/** A collapsed subtree contributes no rows; subsequent siblings close the exact gap. */
export function treePlacements(nodes:Node[],expanded:Record<string,boolean>={}):TreePlacement[]{
 const byId=new Map(nodes.map(n=>[n.id,n])),result:TreePlacement[]=[],visiting=new Set<string>();
 const visit=(node:Node,y:number,visible:boolean):number=>{
  const t=node.tree;if(!t)return node.geometry?.height??0;
  if(visiting.has(node.id))throw new Error('Cyclic tree node membership');visiting.add(node.id);
  const open=expanded[node.id]??t.expanded;let height=t.root?0:t.rowHeight;
  for(const id of t.nodes){const child=byId.get(id);if(!child)continue;const childHeight=visit(child,height,visible&&open);if(open)height+=childHeight;}
  result.push({id:node.id,y,visible,height:t.root?height:t.rowHeight});visiting.delete(node.id);return height;
 };
 for(const node of nodes)if(node.tree?.root)visit(node,node.geometry?.y??0,true);
 return result;
}
/** Canonical tree storage keeps node children/labels; only the initial layout is derived. */
export function layoutTree(root:Widget):Widget {
 const clone=structuredClone(root),all:Widget[]=[];const collect=(w:Widget)=>{all.push(w);for(const c of w.children??[])collect(c);};collect(clone);
 const byId=new Map(all.map(w=>[w.id,w]));
 for(const placement of treePlacements(all.map(w=>({...w,geometry:w})))){const w=byId.get(placement.id)!;w.y=placement.y;w.height=placement.height;if(!placement.visible)w.css.display='none';}
 return clone;
}
