import type {Project} from '../../src/model.ts';
/** Original empty-project and empty-page semantic fixtures. */
export function canvasEmptyProject(withPage=false):Project {
 return {schema:'axure-semantic',schemaVersion:2,sourceSha256:'0'.repeat(64),issues:[],stats:{pages:withPage?1:0,widgets:0},pages:withPage?[{id:'blank',name:'空白页',file:'blank.html',width:800,height:600,background:'#ffffff',widgets:[],behaviors:[]}]:[]};
}
