# RP9 团队项目的本地 WorkingCopy

现在可直接运行 `npm run convert -- project.rpteam output/project`。容器解析器读取本地 `WorkingCopy` 中的条目，复用原有对象图、语义转换、HTML 和 React 导出链路。

分页格式来自 [issue #1](https://github.com/renaesop/axurecraft/issues/1) 的报告：4096 字节一页，前 4 字节为条目 Id，中间 4084 字节为数据，末尾依次为 2 字节页号或有效字节数、2 字节标志、4 字节保留字段。`0x0100` 表示续页，`0x0200` 表示末页。目录从第 0 页开始，拼接后按 RP9 的单块 LZ4 帧解码，遍历 `Root.Items` 和 `Root.ChildGroups`。条目使用 `Key.Path`、`Id`、`StartPage`、`Length`；按页链读取，而不是假设 `PageRanges` 连续。

仅选择路径以 `WorkingCopy` 开头的条目，并优先放置 `DesignDocument`。`LocalRepo`、`BackgroundUpdate`、`DDocStore`、`TeamMetadata` 不参与转换，不用历史版本补齐缺失的本地内容。JPEG 缩略图、XML 等保留为容器记录，不作为页面对象图。gzip 和未压缩的 Axure 二进制均支持。缺失母版仍使用已有诊断，属于独立 issue #2。

校验包括文件分页大小、页号边界、重复/循环页、所属 Id、标志、保留字段、末页有效长度、目录条目长度和重复 Id/路径。LZ4、gzip、单条目和累计解压大小沿用 RP9 限制。空 `Items`/`ChildGroups` 可为 `null`。早期 RP9 文件没有 `StartPage` 时，从 `PageRanges` 第一段取得起始页，再沿页链读取；显式但无效的 `StartPage` 不回退。`Heap`、其余 `PageRanges`、目录中的 `Crc32` 不作语义解释；gzip 自身的校验仍由解压器执行。未知容器不再误报为 ZIP。

团队项目没有连续的记录数据区：返回的 `dataBase` 为 0，记录的 `fileOffset` 和 `relativeOffset` 指向首个物理页头，`record.team` 保存条目 Id 与页链，`payload` 为拼接、解压后的内容。原始文件 SHA-256 保持可追溯。

## 验证与限制

`tests/fixtures/rpteam.ts` 是依据报告编写的原创二进制夹具，不是真实 Axure 导出，也不包含报告者的内部文件。它包含跨越非连续页面的目录及原生对象记录、gzip/未压缩内容、不同版本的重复页面，以及 JPEG/XML 元数据。

```bash
npm run test:ci
npx --no-install tsx scripts/validate-rpteam.ts
node scripts/validate-standalone.mjs output/rpteam-check/react
```

核心回归验证只转换工作副本、保留当前文本/坐标/尺寸、损坏数据拒绝和格式诊断。浏览器脚本还生成一份原创空白页团队文件，编译其导出 TSX，防止 `PrototypePage` 错误要求必填 `children`。浏览器脚本通过 CLI 生成两种输出，检查真实输入框值、坐标、尺寸、编辑操作和脚本错误，并逐像素比较完整截图。报告和截图位于 `output/rpteam-check/`。核心回归随现有 CI 自动执行；新增浏览器脚本可按上面的命令单独运行。

## 公开真实样本验证

2026-11-06 下载并验证以下固定版本的公开文件。三个原始二进制均提交在 `tests/fixtures/rpteam/`；固定版本来源、大小、SHA-256 和预期结果保存在同目录的 `sources.json`。测试直接读取仓库夹具，不下载文件、不依赖 `research/`。

| 样本 | 字节数 | 页面 / 控件 | 二进制记录往返 | HTML/React 整页像素差 |
| --- | ---: | ---: | ---: | ---: |
| [fanbo-job.rpteam](https://github.com/2019-summer-internship/Csharp/blob/4d0ef6f509d539ba1cd9ac17600c54200b355b18/design/view/axure/fanbo-job.rpteam) | 1,556,480 | 12 / 174 | 18 | 全部 12 页为 0 |
| [706platform.rpteam](https://github.com/706YouthSpace/706platform/blob/8ff393bbb7aae3e6e4484b24046c80b58b765285/resource/axure/706platform.rpteam) | 32,423,936 | 25 / 3528 | 63 | 全部 25 页为 0 |

两个样本暴露并驱动修复了叶子组 `ChildGroups: null` 和早期 RP9 缺省 `StartPage` 的兼容问题。对应原创回归在修复前失败；修复后通过，仍拒绝非法范围、页号和显式起始页。真实样本中的三个空白页还暴露了 `PrototypePage.children` 的类型限制，现已改为可选并增加导出编译回归。所有输出页面无脚本异常，实际生成的图片均成功加载。浏览器条件为 Chromium、1440×900 视口、DPR 1、禁用 GPU；截图为完整页面。

检出仓库并安装依赖后即可复现：

```bash
npm run test:ci
npx --no-install tsx scripts/validate-rpteam.ts
node scripts/validate-standalone.mjs output/rpteam-check/sample-2/react
```

`tests/rpteam-samples.test.ts` 随 `npm run test:ci` 自动执行，验证原始文件哈希和大小、工作副本记录、81 条二进制记录往返、页面/控件/资源统计、空白页和已有诊断数量。样本缺失或被替换时测试直接失败。`TNT.rpteam` 覆盖未知容器报错。

浏览器脚本无参数时运行原创夹具及两个真实 RP9 样本，编译导出 TSX 并对比全部 37 页；可选路径参数可替换真实样本列表，不触发网络下载。报告、转换诊断及全部截图保存在 `output/rpteam-check/sample-1/` 和 `sample-2/`。

`fanbo-job` 保留 12 条交互动作诊断；`706platform` 保留 45 条交互动作和 16 条 `Image Stream unavailable` 诊断。成功解析和两种渲染器一致不等于所有交互、图片都完整恢复，也不代表与原生 Axure 截图等价。

纳入负向测试的 [TNT.rpteam](https://github.com/RobTain/InnoTech2/blob/94a4b5fb8c85f7c02cf9af6918f4d3c6ecbd6229/TNT.rpteam) 使用不同头部 `dda90a0000000000`，仍明确报不支持，不算通过样本。报告者的私有 18 页文件尚未验证；团队同步、服务器访问及缺失包恢复不在此支持范围内。
