# 两份公开 RP9 连线样本验证

本轮从 Axure 论坛取得两份此前未使用的文件。第一份是控件规格标注图，第二份是住宿评价表单的跨屏用户流程；均包含原生 Connector。原始 RP 和作者图片不随仓库分发，下载 URL、SHA-256 和预期计数保存在 [flow-samples.json](../examples/flow-samples.json)。

| 文件与来源 | 控件 | 被引用节点 | 连线 | 修复后诊断 |
| --- | ---: | ---: | ---: | ---: |
| [Axure9_ConnectorLines_Bug-01.rp](https://forum.axure.com/t/bug-connector-line-issues/63835) | 62 | 27 | 29 | 0 |
| [1.rp：Connector tool bugs in the latest update](https://forum.axure.com/t/connector-tool-bugs-in-the-latest-update/56065) | 175 | 12 | 6 | 0 |

第一份有 16 个原生未吸附端点，转换后保持自由端点；这些端点与找不到目标的悬空引用分开统计。两份均无悬空引用和缺失连接元数据。它们没有作者设置的控件交互，不能作为运行时交互覆盖证据。

## 发现并修复的问题

1. **混合版本记录导致整份 RP9 被拒绝。** 第一份 RP9 容器中保留了 2 个 RP8 导出配置记录，原先内部头校验只接受版本 9。现在接受两种已经验证的记录头，仍要求外层为 RP9，保持长度、字符串、压缩与 payload 边界检查。两份文件共 60 个二进制记录完成 decode → JSON → encode 逐字节一致校验；另有不依赖第三方文件的混合记录和非法版本测试。
2. **React 半透明页面背景重复绘制。** 第二份使用 `rgba(242,242,242,0.6)`，React 原先在 body 和 main 同时绘制，导致页面区域变深。现在两种输出均只在文档背景绘制一次；切换自适应视图也同步更新文档背景。第二份普通尺寸下从 3,401,005 个差异像素降到 0。
3. **29 个空心圆连线端点丢失。** 第一份使用原生端点类型 19。补上类型 18/19 的实心/空心圆，尺寸采用页面单位，不随 SVG 默认 marker 比例成倍放大。按照原生 `Arrowhead.OuterCircle` / `InnerCircle` 的半径规则绘制；空心区域裁掉穿过其中的线身，保留保存时的路径和端点中心。圆形端点、透明背景及母版复制后的 SVG 引用均有原创浏览器回归。
4. **带图片边框的 TSX 无法独立类型检查。** 第一份生成页面的 12 个图片控件使用 `--rp-image-border-width` 等 CSS 变量，原 React 样式类型拒绝这些合法属性。补充以 `--` 开头的自定义属性类型，保留普通 CSS 拼写检查；独立工程验证同时检查合法变量通过、普通属性拼错仍报错。

原生尺寸依据来自本地官方 RP9 C# 程序集的只读 CIL 检查；这不等于所有箭头类型均已完成原生像素校准。

## 本地截图结果

固定 1920×1000 浏览器窗口，拍摄完整页面。CSS `zoom` 与 `deviceScaleFactor` 分别测试；没有将 CSS 缩放称为浏览器菜单缩放。

| 样本 | 缩放 | 像素密度 | HTML / React 精确差异像素 | 最大通道差 |
| --- | ---: | ---: | ---: | ---: |
| Connector Lines | 100% | 1× | 3 | 1 |
| Connector Lines | 110% | 1× | 0 | 0 |
| Connector Lines | 100% | 2× | 0 | 0 |
| Connector Lines | 110% | 2× | 0 | 0 |
| Connector Zoom | 100% | 1× | 0 | 0 |
| Connector Zoom | 110% | 1× | 0 | 0 |
| Connector Zoom | 100% | 2× | 0 | 0 |
| Connector Zoom | 110% | 2× | 0 | 0 |

剩余 3 个像素位于圆形滑块图形边缘，差异均只有一个色阶，符合栅格化舍入差异的表现。报告保留精确差异数；自动验收允许最多 64 个单色阶差异像素，任何大于 1 的通道差都会失败，不会把容差结果写成“精确零差异”。

每条连接线还沿路径取样，确认截图中确实存在相应颜色的线条；检查非零 SVG 绘制尺寸、端点/裁切资源引用唯一、图片加载和浏览器错误。新增原创端点页直接检查实心中心、空心中心、圆环、页面内外的半透明背景。自适应测试检查切换断点后的文档背景与输入节点保留。

两篇论坛帖子有作者或官方浏览器参考图，可以人工核对线条和布局。它们的裁切、比例和字体环境不完全确定，也没有配对的原生导出 HTML，因此上述数值仅比较两个转换渲染器，不声明与原生 Axure 像素等价。

## 复现与 CI

```bash
# 下载固定来源，校验 SHA-256，转换并截图比较
npm run test:flow-samples -- --download

# 已有文件时指定目录：connector-lines.rp 与 connector-zoom.rp
npm run test:flow-samples -- research/flow-more

# 无第三方资源的端点、背景与复制实例回归
npm run test:flow
npm run test:adaptive
```

浏览器可用 `CHROME_PATH` 指定。结果位于 `output/flow-samples/`，包含每份样本的 HTML/React 导出、截图、转换报告与 `validation.json`。

[Public RP9 flow samples](https://github.com/renaesop/axurecraft/actions/workflows/flow-samples.yml) 可手动运行：下载两份校验固定的 RP，执行以上检查，并在仓库外分别安装、构建和检查两份生成工程。截图和报告保留 14 天。混合记录、圆形端点、半透明背景及自适应背景的原创回归随主 CI 在每次 push / PR 执行。
