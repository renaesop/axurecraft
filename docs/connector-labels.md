# 原生连接线文字

修复 [issue #9](https://github.com/renaesop/axurecraft/issues/9)：`Connector` 分支现在读取自身的 `RichTextBlock`（以及旧式 `TextBlock`），将非空文字保存为可编辑的语义富文本。段落、分段字体/颜色和文字样式覆盖复用已有转换逻辑，HTML 与 React 从相同内容生成。空白连线不增加文字层，SVG 路径、箭头和拓扑引用保持不变。

## 默认定位依据

[Axure 官方连接线文档](https://docs.axure.com/axure-rp/reference/connectors/) 确认连接线可包含文字，但未给出定位算法。本地保存的 RP9 API `Axure.Document.dll`（SHA-256 `5c16f81538c1606de34b64164b625f2fd7a1bd30113d72855977d9f6dce8570f`）提供了更具体的依据。只静态读取程序集，没有加载或执行其中的代码：

- `Connector.GetMiddlePoint`（`0x0600248e`）：直线取两端中点并舍入；折线/圆角线沿未圆角化的线段累计长度，取总长度的一半；曲线使用 `AxBezierPoint.PathPoint`。
- `Connector.UpdateRect`（`0x06002489`）：文字面板大小为 100×20。
- `Connector.SetRichTextPanelLocation`（`0x0600248d`）：文字面板以该点为中心，转换为控件局部坐标。

实现按端口重新连接后的路径计算折线标签位置，避免旧终点缓存影响标签。曲线缺少有效 `PathPoint` 时，以当前三次贝塞尔曲线的参数中点作为兼容回退。圆角线沿原始折线路径定位，因此恰落在拐角的中心可能不在圆弧上；没有把圆弧弧长规则替代原生线段规则。

## 回归

`tests/fixtures/connector-labels.ts` 编写原生二进制对象记录，由 `convertRp9` 完成解析和转换，没有在转换结果中手工追加文字。它同时构造 `.rp` 和 `.rpteam`，覆盖直线、水平/垂直零宽高连线、L 形、多折线、圆角、曲线、空标签和零长度连线。两个核心回归在修复前均以“native RichTextBlock was dropped”失败。

```bash
npm run test:ci
npx --no-install tsx scripts/validate-connector-labels.ts
node scripts/validate-standalone.mjs output/connector-labels-check/react
```

浏览器脚本通过 CLI 生成输出，检查文字内容、字重/颜色、标签中心位置、到实际 SVG 路径的距离以及箭头路径是否保留。CSS zoom 1/1.25 与 DPR 1/2 组合下，HTML/React 完整截图逐像素比较。结果和截图位于 `output/connector-labels-check/`。原有端口回归还检查重新连接后的标签位置和缺省曲线中点。

## 验证边界

报告者的私有文件及配套原生 HTML 不可用，不能声称验证了其中全部 160 个标签或原生截图等价。当前读取的连接线保存/加载方法没有提供已确认的独立标签拖动偏移字段；本变更不猜测其编码，也不凭经验添加白色底色。已验证的是上述默认位置、原生文字保留和两种输出的一致性。

## 合入后的复查

复查 #10 时补充了状态和页面边缘用例，并修复以下遗漏：

- 连接线的悬停、按下、选中和禁用样式此前经过普通形状的矢量分支，导致 SVG 线条被移除。现在仍由连接线解析器生成对应颜色、线宽和箭头；外观里的位置/尺寸覆盖继续报告诊断，不改变基础路径或标签位置。
- React 从悬停恢复普通样式时，外框残留的 `border-width` 会覆盖 `border: 0`，使标签和线条偏移。现在连接线外框不保留描边长属性，描边完全由 SVG 绘制。
- 页面大小此前只统计线条外框，底部水平线和右侧竖线的文字可能被 `.rp-page` 裁切。现在可见边界包含标签面板，并递归处理分组；不扩大连接线本身的几何尺寸，隐藏内容也不撑大页面。

新增原生状态样式及单条连线夹具。丢线和页边裁切回归在修复前均失败；浏览器测试还复现了 React 恢复普通样式后的 2px 偏移。

```bash
npx --no-install tsx scripts/validate-connector-label-states.ts
node scripts/validate-standalone.mjs output/connector-label-states-check/pointer/react
```

浏览器脚本覆盖三种页边/零长度情况，以及普通、选中、禁用连接线的鼠标进入、按下、释放、离开过程。逐步检查路径、箭头引用/颜色、标签中心和页面裁切边界；共比较 15 个状态的 HTML/React 截图。报告及截图位于 `output/connector-label-states-check/`。原有静态定位、缩放和 DPR 检查仍保留。
