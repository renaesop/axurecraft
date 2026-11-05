import { readFileSync,writeFileSync,mkdirSync,copyFileSync } from 'node:fs';
const project=JSON.parse(readFileSync('output/campus/project.json','utf8'));
const thumbs=JSON.parse(readFileSync('research/public-sample/campus-thumbnails/index.json','utf8'));
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
mkdirSync('output/campus/baseline-thumbnails',{recursive:true});
const rows=project.pages.map((p,i)=>{
  const dest=`baseline-thumbnails/page-${i+1}.jpg`;
  copyFileSync('research/public-sample/'+thumbs[i].file,'output/campus/'+dest);
  return `<section><h2>${escape(p.name)}</h2><div class="pair"><figure><figcaption>RP 内嵌缩略图 · 放大显示</figcaption><img src="${dest}" alt="原始缩略图"></figure><figure><figcaption>TS 生成的 HTML · Chromium 截图</figcaption><a href="${p.file}"><img src="screenshots/${p.file.replace('.html','.png')}" alt="生成页面截图"></a></figure></div></section>`;
}).join('');
writeFileSync('output/campus/comparison.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RP9 转换对照</title><style>body{font:16px system-ui;margin:32px;background:#f2f4f8;color:#17212e}h1{font-size:26px}p{max-width:850px;line-height:1.7}.pair{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}figcaption{margin:12px 0;font-size:14px;color:#536075}img{display:block;width:360px;height:auto;border:1px solid #ddd;background:#fff}section{margin:40px 0}a{color:#245ac3}</style><h1>RP9 → HTML 视觉对照</h1><p>左侧为同一 RP 文件保存的约 121×256 JPEG 缩略图，可能包含编辑态或旧状态；右侧为实际生成 HTML 的运行态截图。这个对照用于发现布局问题，不能作为原生全尺寸像素等价证明。点击右侧图片可操作生成页面。</p><p><a href="index.html">打开全部页面</a> · <a href="conversion-report.json">未支持项报告</a> · <a href="browser-validation.json">浏览器验证结果</a></p>${rows}</html>`);
