import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {pageToJsx,pageDefinition} from '../src/jsx.ts';
import {parseSemanticProject} from '../src/semantic.ts';
import {structureCases} from '../tests/fixtures/structure.ts';
const [input,output='output/structure-audit.json']=process.argv.slice(2);
const cases=input?Object.fromEntries(parseSemanticProject(readFileSync(input,'utf8')).pages.map(p=>[p.name,p])):{...structureCases(),repeater1000:structureCases(1000).repeater};
const reports=Object.entries(cases).map(([name,page])=>{
 const jsx=pageToJsx(page),body=jsx.slice(jsx.indexOf('export default function')),definition=pageDefinition(page);
 return {name,semanticBytes:Buffer.byteLength(JSON.stringify(page)),tsxBytes:Buffer.byteLength(jsx),renderBytes:Buffer.byteLength(body),renderLines:body.split('\n').length,widgetDeclarations:(body.match(/<RpWidget\s/g)??[]).length,textDeclarations:(body.match(/<RpText\s/g)??[]).length,repeaterTemplates:(body.match(/<RpRepeater\s/g)??[]).length,metadataWidgets:definition.widgets.length,materializedRowMetadata:definition.widgets.filter(w=>w.rowInstance).length,maxRenderIndent:Math.max(...body.split('\n').map(s=>(s.match(/^ */)?.[0].length??0)/2)),opaqueHtml:/dangerouslySetInnerHTML|\binnerHTML\b/.test(jsx)};
});mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({note:'Structural proxies, not a universal readability score. Row data size is expected to grow; rendered template size should stay constant.',reports},null,2));console.table(reports);
