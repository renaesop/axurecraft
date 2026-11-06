/** Public forum files are downloaded on request, verified, and kept outside git. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {convertRp9} from '../src/convert.ts';
import {parseProject,field,number} from '../src/graph.ts';
import {connectorPort,connectorPoint} from '../src/connector-point.ts';
import {resolveStyle,P} from '../src/styles.ts';
import {parseRp9Payload,encodeRp9Payload} from '../src/parser/rp9-payload.ts';
import {flowStructure} from '../src/flow.ts';
import {flattenWidgets} from '../src/repeater-model.ts';
import {emitProject} from '../src/emit.ts';

interface Sample {
  name:string;title:string;source:string;url:string;sha256:string;
  expected:{widgets:number;nodes:number;connectors:number;markers:number;hollowCircles:number;freeEnds:number;roundTrips:number};
}
const samples:Sample[]=JSON.parse(readFileSync('examples/flow-samples.json','utf8'));
const args=process.argv.slice(2),download=args.includes('--download');
const input=resolve(args.find(a=>a!=='--download')??'research/flow-samples'),out=resolve('output/flow-samples');
mkdirSync(input,{recursive:true});mkdirSync(out,{recursive:true});
// Embedded SVG images can rasterize differently on the macOS GPU between
// initial HTML parsing and React insertion. Keep screenshot rasterization fixed.
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu']});
const reports:unknown[]=[],errors:string[]=[];
try {
  for(const sample of samples){
    const file=join(input,sample.name+'.rp');
    if(!existsSync(file)){
      assert.ok(download,`Missing ${file}; use npm run test:flow-samples -- --download`);
      const bytes=execFileSync('curl',['--fail','--silent','--show-error','--location','--retry','2','--max-time','60',sample.url],{maxBuffer:16*1024*1024});
      assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256,'download checksum');
      writeFileSync(file,bytes);
    }
    const bytes=readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256,'input checksum');
    const native=parseProject(bytes);let roundTrips=0;
    for(const r of native.records){
      if(!r.inner)continue;
      const data=r.payload.subarray(r.inner.payloadStart),ast=parseRp9Payload(data,r.inner.strings);
      assert.deepEqual(encodeRp9Payload(JSON.parse(JSON.stringify(ast.roots)),r.inner.strings),data);roundTrips++;
    }
    const nativeConnectors=native.graphs.flatMap(g=>[...g.objects.values()]).filter(w=>w.className==='Axure:DiagramObject:Connector').length;
    const {project,assets}=convertRp9(bytes);assert.deepEqual(project.issues,[]);assert.equal(project.pages.length,1);
    const page=project.pages[0],widgets=flattenWidgets(page.widgets),connectors=widgets.filter(w=>w.connection),flow=flowStructure(page.widgets);
    const vectors=connectors.flatMap(w=>w.content.filter(c=>c.kind==='vector'));
    const doc=native.graphs.find(g=>g.className==='Axure:DesignDocument');
    const probes=connectors.flatMap(w=>{
      const g=native.graphs.find(g=>g.record.index===w.source.record)!;
      const raw=g.objects.get(w.source.objectId)!,props=resolveStyle(g,raw,doc);
      return (['start','end'] as const).flatMap(side=>{
        const end=w.connection![side];if(!end.target)return [];
        const target=g.objects.get(number(field(raw.body,side+'-diagram-object')))!;
        const port=connectorPort(g,target,end.port!),point=connectorPoint(g,target,end.port!,resolveStyle(g,target,doc));
        assert.ok(port&&point,`${sample.name} ${w.id} ${side}: unresolved port`);
        const saved=side==='start'?{x:number(field(props.get(P.LOCATION),'X')),y:number(field(props.get(P.LOCATION),'Y'))}:{x:number(field(raw.body,'end-point-x')),y:number(field(raw.body,'end-point-y'))};
        return [{connector:w.id,side,target:end.target,port,cacheDistance:Math.hypot(saved.x-point.x,saved.y-point.y)}];
      });
    });
    assert.equal(nativeConnectors,sample.expected.connectors);assert.equal(connectors.length,nativeConnectors);
    assert.equal(widgets.length,sample.expected.widgets);assert.equal(flow.nodes.length,sample.expected.nodes);
    assert.deepEqual(flow.danglingTargets,[]);assert.equal(flow.missingMetadata,0);assert.equal(flow.unattachedEnds,sample.expected.freeEnds);
    assert.equal(probes.length,nativeConnectors*2-sample.expected.freeEnds,'every attached endpoint is checked');
    assert.equal(roundTrips,sample.expected.roundTrips);
    assert.equal(vectors.reduce((n,v)=>n+v.markers.length,0),sample.expected.markers);
    assert.equal(vectors.flatMap(v=>v.markers).filter(m=>m.units==='userSpaceOnUse'&&!m.filled).length,sample.expected.hollowCircles);
    const destination=join(out,sample.name);await emitProject(project,assets,destination,sample.title);
    const comparisons:unknown[]=[];
    for(const dpr of [1,2]){
      const context=await browser.newContext({viewport:{width:1920,height:1000},deviceScaleFactor:dpr});
      try {
        const tab=await context.newPage();tab.on('pageerror',e=>errors.push(e.message));
        for(const zoom of [1,1.1]){
          const shots:Buffer[]=[],endpointChecks:unknown[]=[];
          for(const renderer of ['','react']){
            await tab.goto(pathToFileURL(join(destination,renderer,page.file)).href,{waitUntil:'networkidle'});
            await tab.evaluate(z=>{document.documentElement.style.zoom=String(z);},zoom);
            const ends=await tab.evaluate(({probes,zoom})=>probes.map(probe=>{
              const target=document.getElementById(probe.target)!,rect=target.getBoundingClientRect(),style=getComputedStyle(target),matrix=new DOMMatrix(style.transform==='none'?undefined:style.transform);
              const dx=(probe.port.x-.5)*parseFloat(style.width),dy=(probe.port.y-.5)*parseFloat(style.height);
              const expected={x:rect.x+rect.width/2+(matrix.a*dx+matrix.c*dy)*zoom,y:rect.y+rect.height/2+(matrix.b*dx+matrix.d*dy)*zoom};
              const path=document.getElementById(probe.connector)!.querySelector<SVGPathElement>('svg > path')!,point=path.getPointAtLength(probe.side==='start'?0:path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
              return {connector:probe.connector,side:probe.side,target:probe.target,expected,actual:{x:point.x,y:point.y},distance:Math.hypot(point.x-expected.x,point.y-expected.y)/zoom};
            }),{probes,zoom});
            // Native endpoints round each page coordinate to an integer. The
            // geometric port can therefore be up to sqrt(.5² + .5²) away.
            for(const end of ends)assert.ok(end.distance<=Math.SQRT1_2+.05,`${sample.name}/${renderer||'html'} ${end.connector} ${end.side}: ${end.distance}px gap`);
            endpointChecks.push({renderer:renderer||'html',checked:ends.length,maxDistance:Math.max(0,...ends.map(e=>e.distance)),endpoints:ends});
            const lines=await tab.locator('[data-kind="Connector"] > svg').evaluateAll(es=>es.map(e=>{
              const svg=e as SVGSVGElement,rect=svg.getBoundingClientRect(),p=svg.querySelector<SVGPathElement>(':scope > path')!,matrix=p.getScreenCTM()!;
              const rgb=getComputedStyle(p).stroke.match(/[\d.]+/g)!.slice(0,3).map(Number);
              const points=Array.from({length:19},(_,i)=>{const point=p.getPointAtLength(p.getTotalLength()*(i+1)/20).matrixTransform(matrix);return {x:point.x,y:point.y};});
              return {id:svg.parentElement!.id,width:rect.width,height:rect.height,length:p.getTotalLength(),rgb,points};
            }));
            assert.equal(lines.length,nativeConnectors);
            for(const line of lines)assert.ok(line.width>0&&line.height>0&&line.length>0,line.id+' is drawable');
            const refs=await tab.locator('[data-kind="Connector"] > svg').evaluateAll(es=>es.flatMap(e=>[...e.querySelectorAll(':scope > path')].flatMap(p=>['marker-start','marker-end','clip-path'].flatMap(attr=>{
              const id=p.getAttribute(attr)?.match(/^url\(#(.+)\)$/)?.[1];return id?[{id,count:[...document.querySelectorAll('[id]')].filter(n=>n.id===id).length}]:[];
            }))));
            assert.equal(refs.filter(r=>!r.id.includes('-holes-')).length,sample.expected.markers);
            for(const ref of refs)assert.equal(ref.count,1,ref.id+' resolves once');
            assert.ok(await tab.locator('img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
            await tab.mouse.move(1910,990);
            const shot=await tab.screenshot({path:join(destination,`${renderer||'html'}-zoom${zoom}-dpr${dpr}.png`),fullPage:true});shots.push(shot);
            const png=PNG.sync.read(shot);
            // Check paint, not just path strings or SVG bounds. Sample away from
            // endpoints so attached widgets and hollow marker interiors are excluded.
            for(const line of lines){
              const visible=line.points.some(p=>{
                for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
                  const x=Math.round(p.x*dpr)+dx,y=Math.round(p.y*dpr)+dy;if(x<0||x>=png.width||y<0||y>=png.height)continue;
                  const i=(y*png.width+x)*4;
                  for(const bg of [[255,255,255],[...png.data.subarray(0,3)]]){
                    const v=line.rgb.map((c,k)=>c-bg[k]),norm=v.reduce((n,c)=>n+c*c,0);
                    if(!norm)continue;
                    const alpha=v.reduce((n,c,k)=>n+c*(png.data[i+k]-bg[k]),0)/norm;
                    if(alpha>=0.15&&alpha<=1.01&&v.every((c,k)=>Math.abs(png.data[i+k]-(bg[k]+alpha*c))<=3))return true;
                  }
                }return false;
              });
              assert.ok(visible,`${sample.name}/${renderer||'html'} ${line.id}: no painted line samples`);
            }
          }
          const a=PNG.sync.read(shots[0]),b=PNG.sync.read(shots[1]);assert.deepEqual([a.width,a.height],[b.width,b.height]);
          let differentPixels=0,significantPixels=0,maxChannelDelta=0;
          for(let i=0;i<a.data.length;i+=4){let delta=0;for(let k=0;k<4;k++)delta=Math.max(delta,Math.abs(a.data[i+k]-b.data[i+k]));if(delta)differentPixels++;if(delta>1)significantPixels++;maxChannelDelta=Math.max(maxChannelDelta,delta);}
          // Keep exact differences in the report. One color step can vary at
          // rasterized shadow edges; larger differences always fail this check.
          assert.equal(significantPixels,0,`${sample.name} zoom ${zoom}, DPR ${dpr}`);
          assert.ok(differentPixels<=64,`${sample.name}: excessive rounding differences`);
          comparisons.push({zoom,deviceScaleFactor:dpr,width:a.width,height:a.height,differentPixels,significantPixels,maxChannelDelta,paintedConnectors:nativeConnectors,endpointChecks});
        }
      } finally {await context.close();}
    }
    const report={name:sample.name,source:sample.source,sha256:sample.sha256,stats:project.stats,roundTrips,legacyRecords:native.records.filter(r=>r.inner?.words[1]===8).length,flow,reattachedEndpoints:probes.filter(p=>p.cacheDistance>1e-6),authoredBehaviorWidgets:widgets.filter(w=>w.behaviors.length).length,comparisons};
    reports.push(report);writeFileSync(join(destination,'validation.json'),JSON.stringify(report,null,2));
    console.log({name:sample.name,widgets:widgets.length,connectors:nativeConnectors,roundTrips,comparisons});
  }
  assert.deepEqual(errors,[]);
  writeFileSync(join(out,'validation.json'),JSON.stringify({note:'Two converted renderers with GPU rasterization disabled. CSS zoom and device scale are tested separately; no paired native HTML is available.',reports,errors},null,2));
} finally {await browser.close();}
