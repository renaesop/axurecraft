# 生成结构的可编辑性检查

用例同时检查编辑位置、模板复用、层级和行为表达方式。字节数用于定位重复数据；这些指标不能单独给出通用的“可读性分数”。固定运行时库与每页组件分别统计，截图和交互由浏览器回归验证。

## 六组原创用例

| 用例 | 要检查的结构 | 自动验收 |
| --- | --- | --- |
| 单段纯文本 | 一个控件、一个文本组件，直接可见文案 | 1 个 `RpWidget`、1 个 `RpText` |
| 四种混排文本 | 相同段落内保留独立文字片段和样式 | 修改一个片段的文字只改变一行 JSX |
| 动态富文本 | 文案、样式、变量含义可以分别修改 | `set-rich-text` + `paragraphs/runs` + 表达式树 |
| 3×2 表格 | 行、列、单元格可定位 | 3 个 row、6 个 TableCell |
| 1 / 100 / 1000 行中继器 | 行数据与模板各保存一份 | 数据行数变化时组件主体完全相同；零份展开行元数据 |
| 双状态面板 | 状态内容能直接阅读和修改 | 2 个显式 `RpState` |

测试位置：[structure.test.ts](../tests/structure.test.ts)，原创输入：[structure.ts](../tests/fixtures/structure.ts)。这些输入不依赖 Axure 安装和第三方 RP 文件。

## 已找到并消除的重复

中继器原先在模板、数据以外，还将所有展开行的控件状态写入页面定义。React 运行时本来就能根据模板构造这些状态，因此删除导出时的重复副本，在首次挂载时计算初始禁用和选中状态。

| 输入 | 修改前 TSX 字节 | 修改后 TSX 字节 | 展开行元数据 |
| --- | ---: | ---: | ---: |
| 100 行 | 80,559 | 20,501 | 100 → 0 |
| 1000 行 | 782,498 | 178,001 | 1000 → 0 |

1000 行用例减少 77.3%。组件主体均为 16 行、745 字节，只有一份行模板；数据区随行数增长。浏览器回归额外检查初始禁用/选中、ItemLoad 富文本、逐行数据绑定和批量赋值。

## 运行方法

```bash
# 自带六组结构用例，输出 output/structure-audit.json
npm run audit:structure

# 检查任意已经转换的语义项目
npm run audit:structure -- output/my-project/project.json output/my-structure.json

# 结构断言与富文本交互 / 截图检查
npm test
npm run test:rich-text
```

报告包含语义数据字节数、完整 TSX 字节数、组件主体字节/行数、控件声明数、模板数、重复行元数据、缩进深度和不透明 HTML 注入检查。GitHub Actions 执行结构断言，并保存报告和富文本截图。

## 富文本的可编辑形式

```ts
{
  kind: 'set-rich-text',
  target: 'total-label',
  richText: {
    kind: 'text',
    css: {},
    paragraphs: [{
      css: { 'text-align': 'right' },
      runs: [
        { text: 'Total: ', css: {} },
        {
          text: '',
          css: { 'font-weight': '700', color: '#c20' },
          expression: { kind: 'variable', name: 'total' }
        }
      ]
    }]
  }
}
```

表达式结果按文字渲染，HTML 特殊字符保持原值。转换层负责解析原生 `RichTextLiteral`，执行层求值，HTML/React 共用段落与片段结构。跨片段公式、母版/中继器引用和快照预览也走同一语义模型。

后续仍应增加重复母版的组件复用、复杂自适应外观、深层容器和多人编辑任务的评估。当前六组用例没有证明业务组件已经自动抽象完成。
