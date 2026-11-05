import {PNG} from 'pngjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]??'output/campus');
const project=JSON.parse(readFileSync(join(root,'project.json'),'utf8'));
const comparisons=project.pages.map(page=>{
 const name=page.file.replace('.html','.png');
 const a=PNG.sync.read(readFileSync(join(root,'screenshots',name))),b=PNG.sync.read(readFileSync(join(root,'react/screenshots',name)));
 if(a.width!==b.width||a.height!==b.height)throw new Error('Screenshot dimensions differ: '+name);
 let different=0,max=0,totalAbsoluteDifference=0;
 for(let j=0;j<a.data.length;j+=4){let pixel=false;for(let c=0;c<4;c++){const d=Math.abs(a.data[j+c]-b.data[j+c]);if(d)pixel=true;max=Math.max(max,d);totalAbsoluteDifference+=d;}if(pixel)different++;}
 return {page:page.file,differentPixels:different,totalPixels:a.width*a.height,maxChannelDifference:max,meanChannelDifference:totalAbsoluteDifference/a.data.length};
});
writeFileSync(join(root,'react/pixel-validation.json'),JSON.stringify({scope:'Same-browser HTML vs React renderer comparison; NOT native Axure parity',comparisons},null,2));
console.log(JSON.stringify(comparisons,null,2));
