# RP9 团队项目的本地 WorkingCopy

现在可直接运行 `npm run convert -- project.rpteam output/project`。容器解析器读取本地 `WorkingCopy` 中的条目，复用原有对象图、语义转换、HTML 和 React 导出链路。

分页格式来自 [issue #1](https://github.com/renaesop/axurecraft/issues/1) 的报告：4096 字节一页，前 4 字节为条目 Id，中间 4084 字节为数据，末尾依次为 2 字节页号或有效字节数、2 字节标志、4 字节保留字段。`0x0100` 表示续页，`0x0200` 表示末页。目录从第 0 页开始，拼接后按 RP9 的单块 LZ4 帧解码，遍历 `Root.Items` 和 `Root.ChildGroups`。条目使用 `Key.Path`、`Id`、`StartPage`、`Length`；按页链读取，而不是假设 `PageRanges` 连续。

仅选择路径以 `WorkingCopy` 开头的条目，并优先放置 `DesignDocument`。`LocalRepo`、`BackgroundUpdate`、`DDocStore`、`TeamMetadata` 不参与转换，不用历史版本补齐缺失的本地内容。JPEG 缩略图、XML 等保留为容器记录，不作为页面对象图。gzip 和未压缩的 Axure 二进制均支持。缺失母版仍使用已有诊断，属于独立 issue #2。

校验包括文件分页大小、页号边界、重复/循环页、所属 Id、标志、保留字段、末页有效长度、目录条目长度和重复 Id/路径。LZ4、gzip、单条目和累计解压大小沿用 RP9 限制。`Heap`、`PageRanges`、目录中的 `Crc32` 不作语义解释；gzip 自身的校验仍由解压器执行。未知容器不再误报为 ZIP。

团队项目没有连续的记录数据区：返回的 `dataBase` 为 0，记录的 `fileOffset` 和 `relativeOffset` 指向首个物理页头，`record.team` 保存条目 Id 与页链，`payload` 为拼接、解压后的内容。原始文件 SHA-256 保持可追溯。

## 验证与限制

`tests/fixtures/rpteam.ts` 是依据报告编写的原创二进制夹具，不是真实 Axure 导出，也不包含报告者的内部文件。它包含跨越非连续页面的目录及原生对象记录、gzip/未压缩内容、不同版本的重复页面，以及 JPEG/XML 元数据。

```bash
npm run test:ci
npx --no-install tsx scripts/validate-rpteam.ts
node scripts/validate-standalone.mjs output/rpteam-check/react
```

核心回归验证只转换工作副本、保留当前文本/坐标/尺寸、损坏数据拒绝和格式诊断。浏览器脚本通过 CLI 生成两种输出，检查真实输入框值、坐标、尺寸、编辑操作和脚本错误，并逐像素比较完整截图。报告和截图位于 `output/rpteam-check/`。核心回归随现有 CI 自动执行；新增浏览器脚本可按上面的命令单独运行。

报告者的私有 `.rpteam` 原文件不可用，因此这里不声称已经验证该文件的 18 页、所有 RP9 团队项目格式变体或原生截图等价。团队项目同步、服务器访问及缺失包恢复不在此支持范围内。草稿 PR 审查时仍需用可分享的真实 RP9 团队项目验证分页约定。
