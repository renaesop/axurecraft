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
