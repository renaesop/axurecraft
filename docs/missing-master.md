# 缺失母版的可见占位

当 `ReferenceDiagramObject.ReferredMaster` 引用的母版记录不在输入中时，转换结果保留实例原来的位置和尺寸，显示浅色背景、虚线边框和 `Missing master: 实例名`。没有实例名时显示母版 GUID；GUID 也不可解析时使用实例 Id。原本隐藏的实例继续隐藏，文字裁切在原尺寸内。

`conversion-report.json` 中的 `master-reference` 诊断保留实例 widget Id，并增加所引用的母版 GUID 和实例名；无法解析 GUID 时明确标记 `unknown GUID`。这帮助用户在 Axure 中定位丢失引用，不代表恢复了缺失内容。

语义控件仍保留 `type: ReferenceDiagramObject` 和来源信息，缺失内容使用已有的 `kind: unsupported`、样式和富文本表达。正常母版继续展开为 group。两种输出共用这份语义数据；占位框也参与页面边界计算，避免被空 group 的零尺寸裁掉。

## 回归

```bash
npm run test:ci
npx --no-install tsx scripts/validate-missing-master.ts
```

`tests/fixtures/missing-master.ts` 是原创 RP9 二进制夹具，包含 issue #2 报告的 1210×1362 和 362×22 两种尺寸，以及隐藏、无实例名、无法解析 GUID 和母版存在的情况。它不依赖 `.rpteam` 支持，不包含用户的内部原型，也不是真实 Axure 原生截图基准。

核心测试覆盖诊断、页面范围、语义往返、导出文字转义和正常母版回归。浏览器脚本检查 HTML/React 的实际边框、像素背景、位置尺寸、可见文字、隐藏状态、页面边界及正常母版输入框的编辑；整页截图逐像素比较，不设容差。报告和截图写入 `output/missing-master-check/`。以 `automation/issue-` 命名的 PR 会由现有 CI 自动运行新增验证脚本。
