import type { Project } from './model.ts';

/** Validate the public JSON boundary instead of trusting a TypeScript cast. */
export function parseSemanticProject(json:string):Project {
  const project:unknown=JSON.parse(json);
  const fail=(path:string,expected:string):never=>{throw new Error(`Invalid semantic project at ${path}: expected ${expected}`);};
  const object=(v:unknown,path:string):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail(path,'object');
  const array=(v:unknown,path:string):unknown[]=>Array.isArray(v)&&v.length<=100000?v:fail(path,'array with at most 100000 items');
  const string=(v:unknown,path:string):string=>typeof v==='string'?v:fail(path,'string');
  const number=(v:unknown,path:string):number=>typeof v==='number'&&Number.isFinite(v)?v:fail(path,'finite number');
  const boolean=(v:unknown,path:string):void=>{if(typeof v!=='boolean')fail(path,'boolean');};
  const css=(v:unknown,path:string):void=>{for(const [k,x]of Object.entries(object(v,path)))string(x,path+'.'+k);};
  const asset=(v:unknown,path:string):void=>{if(!/^assets\/[a-f\d]{24}\.(png|jpg|gif|svg)$/.test(string(v,path)))fail(path,'content-addressed relative image asset');};
  const source=(v:unknown,path:string):void=>{const x=object(v,path);number(x.record,path+'.record');number(x.objectId,path+'.objectId');string(x.guid,path+'.guid');string(x.className,path+'.className');};
  const uiExpression=(v:unknown,path:string,depth=0):void=>{
    if(depth>64)fail(path,'expression depth <= 64');
    const e=object(v,path),child=(x:unknown,key:string)=>uiExpression(x,path+'.'+key,depth+1);
    if(e.kind==='literal'){
      if(!['string','number','boolean'].includes(typeof e.value))fail(path+'.value','scalar');
      if(typeof e.value==='number')number(e.value,path+'.value');
    }else if(e.kind==='widget'){
      string(e.target,path+'.target');if(!['text','selected'].includes(string(e.property,path+'.property')))fail(path+'.property','text or selected');
    }else if(e.kind==='variable')string(e.name,path+'.name');
    else if(e.kind==='length')child(e.value,'value');
    else if(e.kind==='column')number(e.columnId,path+'.columnId');
    else if(e.kind==='concat')array(e.parts,path+'.parts').forEach((x,i)=>child(x,'parts.'+i));
    else if(e.kind==='binary'){
      if(!['+','-','*','/','%','==','!=','>','<','>=','<=','&&','||'].includes(string(e.operator,path+'.operator')))fail(path+'.operator','supported binary operator');
      child(e.left,'left');child(e.right,'right');
    }else if(e.kind==='unary'){
      if(!['+','-','!'].includes(string(e.operator,path+'.operator')))fail(path+'.operator','supported unary operator');child(e.operand,'operand');
    }else if(e.kind==='call'){
      if(!['slice','toFixed'].includes(string(e.method,path+'.method')))fail(path+'.method','slice or toFixed');
      child(e.receiver,'receiver');const args=array(e.args,path+'.args');
      if(args.length>(e.method==='slice'?2:1))fail(path+'.args','valid method arity');args.forEach((x,i)=>child(x,'args.'+i));
    }else fail(path+'.kind','supported UI expression');
  };
  const actions=(v:unknown,path:string,depth=0):void=>{
    if(depth>64)fail(path,'action nesting <= 64');
    array(v,path).forEach((value,i)=>{
      const p=path+'.'+i,a=object(value,p);
      if(!['link','back','refresh','show','hide','toggle','state','enable','wait','repeater-sort','repeater-page','branch','set-text','set-selected','set-variable'].includes(string(a.kind,p+'.kind')))fail(p+'.kind','supported action kind');
      if(a.target!==undefined)string(a.target,p+'.target');
      if(a.value!==undefined&&!['string','number','boolean'].includes(typeof a.value))fail(p+'.value','scalar action value');
      if(typeof a.value==='number')number(a.value,p+'.value');
      if(a.kind==='set-text'||a.kind==='set-selected'){string(a.target,p+'.target');uiExpression(a.expression,p+'.expression');}
      if(a.kind==='set-variable'){if(!string(a.variable,p+'.variable'))fail(p+'.variable','nonempty variable name');uiExpression(a.expression,p+'.expression');}
      if(a.includeVariables!==undefined)boolean(a.includeVariables,p+'.includeVariables');
      if(a.kind==='branch')array(a.branches,p+'.branches').forEach((value,j)=>{const b=object(value,p+'.branch');if(b.condition!==undefined)uiExpression(b.condition,p+'.condition');actions(b.actions,p+'.branches.'+j+'.actions',depth+1);});
      if(a.kind==='repeater-sort'){const sort=object(a.sort,p+'.sort');number(sort.columnId,p+'.columnId');boolean(sort.ascending,p+'.ascending');string(sort.label,p+'.label');if(!['number','text'].includes(string(sort.type,p+'.type')))fail(p+'.type','number or text');if(sort.toggle!==undefined)boolean(sort.toggle,p+'.toggle');}
    });
  };
  const behaviors=(v:unknown,path:string):void=>{array(v,path).forEach((value,i)=>{
    const b=object(value,path+'.'+i);string(b.event,path+'.event');actions(b.actions,path+'.'+i+'.actions');
  });};
  const text=(v:unknown,path:string):void=>{const t=object(v,path);if(t.kind!=='text')fail(path+'.kind','text');css(t.css,path+'.css');array(t.paragraphs,path+'.paragraphs').forEach(value=>{const p=object(value,path+'.paragraph');css(p.css,path+'.css');array(p.runs,path+'.runs').forEach(value=>{const r=object(value,path+'.run');string(r.text,path+'.text');css(r.css,path+'.css');});});};
  const point=(v:unknown,path:string):void=>{const p=object(v,path);number(p.x,path+'.x');number(p.y,path+'.y');};
  const content=(v:unknown,path:string):void=>{
    const c=object(v,path);
    if(c.kind==='text')return text(c,path);
    if(c.kind==='image'){asset(c.asset,path+'.asset');string(c.alt,path+'.alt');return;}
    if(c.kind==='vector'){
      number(c.width,path+'.width');number(c.height,path+'.height');
      array(c.paths,path+'.paths').forEach(value=>{const p=object(value,path+'.path');for(const k of ['data','fill'])string(p[k],path+'.'+k);number(p.fillOpacity,path+'.fillOpacity');for(const k of ['stroke','dashArray','markerStart','markerEnd'])if(p[k]!==undefined)string(p[k],path+'.'+k);for(const k of ['strokeOpacity','strokeWidth'])if(p[k]!==undefined)number(p[k],path+'.'+k);});
      array(c.gradients,path+'.gradients').forEach(value=>{const g=object(value,path+'.gradient');string(g.id,path+'.id');point(g.from,path+'.from');point(g.to,path+'.to');array(g.stops,path+'.stops').forEach(value=>{const s=object(value,path+'.stop');number(s.offset,path+'.offset');number(s.opacity,path+'.opacity');string(s.color,path+'.color');});});
      array(c.markers,path+'.markers').forEach(value=>{const m=object(value,path+'.marker');for(const k of ['id','data','color'])string(m[k],path+'.'+k);boolean(m.filled,path+'.filled');});return;
    }
    if(c.kind==='control'){
      if(!['text','textarea','radio','checkbox','select','button'].includes(string(c.control,path+'.control')))fail(path+'.control','form control kind');
      for(const k of ['label','value','placeholder'])string(c[k],path+'.'+k);
      for(const k of ['disabled','readOnly'])boolean(c[k],path+'.'+k);
      if(c.checked!==undefined)boolean(c.checked,path+'.checked');if(c.group!==undefined)string(c.group,path+'.group');if(c.richLabel!==undefined)text(c.richLabel,path+'.richLabel');
      if(c.options!==undefined)array(c.options,path+'.options').forEach(value=>{const o=object(value,path+'.option');string(o.label,path+'.label');string(o.value,path+'.value');});return;
    }
    fail(path+'.kind','text, image, vector or control');
  };
  let count=0;
  const widgets=(v:unknown,path:string,ids:Set<string>,depth=0):void=>{
    if(depth>64)fail(path,'widget nesting <= 64');
    array(v,path).forEach((value,i)=>{
      if(++count>100000)fail(path,'at most 100000 widgets');
      const p=path+'.'+i,w=object(value,p),id=string(w.id,p+'.id');
      if(ids.has(id))fail(p+'.id','unique widget id per page');ids.add(id);
      if('markup'in w)fail(p,'structured content, no HTML markup');
      for(const k of ['type','name'])string(w[k],p+'.'+k);
      for(const k of ['x','y','width','height'])number(w[k],p+'.'+k);
      if(Number(w.width)<0||Number(w.height)<0)fail(p,'nonnegative size');
      if(!['group','shape','image','hotspot','panel','repeater','control','unsupported'].includes(string(w.kind,p+'.kind')))fail(p+'.kind','semantic widget kind');
      css(w.css,p+'.css');source(w.source,p+'.source');behaviors(w.behaviors,p+'.behaviors');array(w.content,p+'.content').forEach((c,j)=>content(c,p+'.content.'+j));
      if(w.disabled!==undefined)boolean(w.disabled,p+'.disabled');
      if(w.selected!==undefined)boolean(w.selected,p+'.selected');
      if(w.selectionGroup!==undefined)string(w.selectionGroup,p+'.selectionGroup');
      if(w.variants!==undefined){
        const variants=object(w.variants,p+'.variants');
        for(const [name,value]of Object.entries(variants)){
          if(!['disabled','selected'].includes(name))fail(p+'.variants.'+name,'supported appearance variant');
          const appearance=object(value,p+'.variants.'+name);css(appearance.css,p+'.variants.'+name+'.css');
          if(appearance.content!==undefined)array(appearance.content,p+'.variants.'+name+'.content').forEach((c,j)=>content(c,p+'.variants.'+name+'.content.'+j));
        }
      }
      if(w.children!==undefined)widgets(w.children,p+'.children',ids,depth+1);
      if(w.states!==undefined)array(w.states,p+'.states').forEach(value=>{const s=object(value,p+'.state');string(s.id,p+'.id');string(s.name,p+'.name');if(s.css!==undefined)css(s.css,p+'.css');widgets(s.widgets,p+'.widgets',ids,depth+1);});
      if(w.repeater!==undefined){
        if(w.children!==undefined)fail(p+'.children','repeater templates and data only, no stale expanded children');
        const r=object(w.repeater,p+'.repeater');source(r.templateSource,p+'.templateSource');
        widgets(r.template,p+'.template',new Set(),depth+1);boolean(r.isolateRadioGroups,p+'.isolateRadioGroups');
        if(r.isolateSelectionGroups!==undefined)boolean(r.isolateSelectionGroups,p+'.isolateSelectionGroups');
        array(r.columns,p+'.columns').forEach(value=>{const c=object(value,p+'.column');number(c.id,p+'.id');string(c.name,p+'.name');});
        const layout=object(r.layout,p+'.layout');if(!['vertical','horizontal'].includes(string(layout.direction,p+'.direction')))fail(p+'.direction','vertical or horizontal');for(const k of ['horizontalSpacing','verticalSpacing','pageSize','startPage','wrap','paddingLeft','paddingTop'])number(layout[k],p+'.'+k);
        if(!Number.isInteger(layout.wrap)||Number(layout.wrap)<0)fail(p+'.wrap','nonnegative integer');
        if(!Number.isInteger(layout.pageSize)||Number(layout.pageSize)<0||!Number.isInteger(layout.startPage)||Number(layout.startPage)<1)fail(p+'.layout','pageSize >= 0 and startPage >= 1 integers');
        const expression=(v:unknown,path:string,depth=0):void=>{
          if(depth>64)fail(path,'expression depth <= 64');const e=object(v,path);
          if(e.kind==='literal')string(e.value,path+'.value');
          else if(e.kind==='column')number(e.columnId,path+'.columnId');
          else if(e.kind==='concat')array(e.parts,path+'.parts').forEach(x=>expression(x,path+'.parts',depth+1));
          else fail(path+'.kind','literal, column or concat');
        };
        array(r.bindings,p+'.bindings').forEach(value=>{const b=object(value,p+'.binding');string(b.targetGuid,p+'.targetGuid');if(!['text','image'].includes(string(b.property,p+'.property')))fail(p+'.property','text or image');expression(b.expression,p+'.expression');const e=object(b.expression,p+'.expression');if(b.property==='image'&&e.kind==='literal')asset(e.value,p+'.asset');});
        const rowIds=new Set<string>();
        array(r.rows,p+'.rows').forEach(value=>{const row=object(value,p+'.row'),id=string(row.id,p+'.row.id');if(!/^[\w-]+$/.test(id)||rowIds.has(id))fail(p+'.row.id','unique alphanumeric row id');rowIds.add(id);for(const v of Object.values(object(row.cells,p+'.cells'))){const c=object(v,p+'.cell');if(c.kind==='text')string(c.value,p+'.value');else if(c.kind==='image'){if(c.asset!==null)asset(c.asset,p+'.asset');}else if(c.kind==='unsupported')number(c.type,p+'.type');else fail(p+'.kind','cell kind');}});
      }
    });
  };
  const root=object(project,'$');if(root.schema!=='axure-semantic'||root.schemaVersion!==2)fail('$','axure-semantic schema version 2');
  if(!/^[a-f\d]{64}$/.test(string(root.sourceSha256,'$.sourceSha256')))fail('$.sourceSha256','SHA256');
  if(root.variables!==undefined){
    const names=new Set<string>();
    array(root.variables,'$.variables').forEach((value,i)=>{
      const path='$.variables.'+i,v=object(value,path),name=string(v.name,path+'.name').toLowerCase();
      if(!name||names.has(name))fail(path+'.name','nonempty case-insensitively unique name');names.add(name);
      string(v.defaultValue,path+'.defaultValue');
      if(v.sourceGuid!==undefined&&!/^[a-f\d]{32}$/.test(string(v.sourceGuid,path+'.sourceGuid')))fail(path+'.sourceGuid','source GUID');
    });
  }
  const files=new Set<string>();
  array(root.pages,'$.pages').forEach((value,i)=>{const path='$.pages.'+i,p=object(value,path);string(p.id,path+'.id');string(p.name,path+'.name');string(p.background,path+'.background');if(p.alignment!==undefined&&!['left','center'].includes(String(p.alignment)))fail(path+'.alignment','left or center');if(p.contentLeft!==undefined)number(p.contentLeft,path+'.contentLeft');const file=string(p.file,path+'.file');if(!/^[\w-]+\.html$/.test(file)||files.has(file))fail(path+'.file','unique plain HTML filename');files.add(file);for(const k of ['width','height'])if(number(p[k],path+'.'+k)<0)fail(path+'.'+k,'nonnegative dimension');behaviors(p.behaviors,path+'.behaviors');widgets(p.widgets,path+'.widgets',new Set());});
  if(files.size===0)fail('$.pages','at least one page');
  array(root.issues,'$.issues').forEach(value=>{const i=object(value,'$.issue');string(i.feature,'$.feature');string(i.detail,'$.detail');});
  for(const value of Object.values(object(root.stats,'$.stats')))number(value,'$.stats');
  return project as Project;
}
