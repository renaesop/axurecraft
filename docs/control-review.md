# 控件审查与实现进度

本轮审查覆盖 11 个 RP9 文档/元件库的 20 种实际对象类型。包括官方 Default、Flow、Icons、Sample UI Patterns、RP9 Tour，以及校园 App、学生管理、URL Variables、Webstack 和两个 RowClickTable 版本。原始资源不随仓库分发；类型识别、功能实现、浏览器验证与原生截图等价分别记录。

## 已修复

- Webstack 整页原生截图差异：1440×1000 从 10,897 降到 10 像素；1920×3000 从 25,992 降到 20 像素。修复 CSS 矩形圆角、SVG 图片裁剪/描边、Repeater 空图片槽的样式丢失及输入框提示文字偏移。详情见[截图对照](native-comparison.md)。
- `Table` 按 `cells` 的行顺序解析，不使用可能按列排列的 `diagram-objects`；保留独立单元格 ID、文本、事件和边框。`table.rowHeights` / `columnWidths` 驱动布局，修改轨道不会留下过期单元格坐标。
- `TableCell` 支持空文本赋值、点击事件、选中/禁用外观；边框覆盖绘制，不挤压文本，普通相邻 1px 边框不会叠成 2px。输出带 table / row / cell 语义。
- `MenuObject` 展开内部原生表格，恢复静态菜单项和分页按钮。
- `ComboBox` 正确识别，`ListBox` / ComboBox 读取真实 `list-options` 和初始选项；HTML 与 React 保持选项 value / label 的区别。
- 富文本 `AxHyperlink` 内部文字不再丢失。链接专属事件仍待实现。

## 逐类状态

以下是本轮代码/语料审查结果，并非完整功能等价声明。未实现项继续作为实现队列。

| 原生类型 | 已有实现及验证 | 下一项实现/验证 |
| --- | --- | --- |
| VectorShape | 路径、CSS 矩形、文字、选中/禁用；配对截图 | 非标准边框、文本旋转、更多样式 |
| ImageBox | 资源、空绑定槽、SVG 裁剪/描边、状态资源；配对截图 | 特殊滤镜、缺失原生占位资源 |
| TextBox | 文本、提示、禁用/只读、MaxLength；配对截图 | 其他 input 类型、焦点隐藏提示 |
| TextArea | 多行文本与编辑值 | 自动换行/输入事件细节的原生对照 |
| Checkbox / RadioButton | 状态、分组、禁用、点击时序；原生函数对照 | 自定义指示器外观 |
| ComboBox / ListBox | 真实选项、初始选择、列表形态；浏览器回归 | 多选及选择项专属事件/表达式 |
| Table / TableCell | 固定轨道、按行嵌套、边框/文本/事件；真实 RP 解析和原创浏览器夹具 | 同文件原生 HTML 对照、不同边宽交界规则 |
| MenuObject | 顶层菜单内部 Table | 子菜单的展开、定位和关闭 |
| Layer | 真实分组层级、坐标、显隐、状态传播 | 组旋转/透明度和样式传播 |
| DynamicPanel | 多状态、初始自适应尺寸、背景、显隐 | 固定定位、百分比宽度、切换后的尺寸、动画 |
| Repeater | 模板、数据绑定、排序、分页、行隔离 | 筛选、增删改数据、完整加载/刷新时序 |
| ImageMapRegion | 透明命中区域、已支持事件 | 更多拖拽/手势事件 |
| Connector | 识别并报告路径缺失 | 专属 segments / control-points 几何，编辑器路由 |
| Hyperlink | 嵌套文字与格式保留 | 单独链接事件，不应整段文字共用事件 |
| TreeNodeObject | 识别并报告 | 节点结构、展开折叠、图标、节点交互 |
| InlineFrame | 识别并报告 | 初始目标、滚动/边框、框架导航 |
| Screenshot | 识别并报告 | 引用页面快照、裁切、缩放 |

母版实例、Line / Button / DropList 等兼容分支与上述对象的专属行为仍需补充对应输入。三方元件保存成这些原生类型时走同一链路；库名称本身不能证明受支持。

## 可复现检查

```bash
npm run test:tables
npm run audit:controls -- output/control-audit.json project.rp library.rplib
```

审查工具逐文档输出 SHA-256、原生类型数量、转换数量、语义类型和诊断。计数包含非活动面板和每份 Repeater 模板一次，不把展开行数当作独立控件覆盖；嵌套链接、未展开树或母版中的对象可能有不同数量。

表格研究样例来自 [Axure 论坛 RowClickTable](https://forum.axure.com/t/single-row-click-for-table-and-open-details/70428)，原始和扩展版本分别为 66.8 KB / 117.6 KB。尚无同文件原生 HTML 基准，因此表格浏览器回归只证明当前结构、边框和交互实现，不声明像素等价。原生 Table 本身也不提供合并单元格或运行时增删/排序；这些效果通常来自覆盖控件或 Repeater，参见 [Axure Tables 文档](https://docs.axure.com/axure-rp/reference/tables/)。
