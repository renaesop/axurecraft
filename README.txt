历史研究记录：按研究阶段保留。当前能力与截图验收结果请以 README.md 和 docs/native-comparison.md 为准。

Axure RP9 → 语义结构 → HTML / React JSX 的 TypeScript 编译器

当前结果
校园 App 样本的 8 页和官方 RP9 Tour 的 2 页均已生成 HTML、JSX 和 TSX。
目标仍是原生 UI 等价；目前只是可运行且可编辑的编译链，尚未完成原生等价验证。

编译链
  RP9 bytes → lossless tagged AST → reference graph → semantic Project
            → HTML renderer
            → concrete JSX / TSX + React state runtime
语义模型不保存 HTML 字符串。它保留文本段落/文本片段、路径/填充/渐变、
图片引用、表单属性、面板状态、中继器列/行/绑定、交互动作及源对象 GUID。
JSX 输出包含实际的 <svg>、<path>、<span>、<RpControl> 等节点。
React 通过状态更新管理显示隐藏、面板切换、禁用、文本和选中状态，没有 innerHTML 注入。

运行
  npm ci
  npm run convert -- research/public-sample/campus.rp output/campus
  npm run generate -- output/campus/project.json output/regenerated
  npm run typecheck
  npm test                  18 项独立核心测试
  npm run test:corpus        41 项研究样本测试，需本地样本/提取记录
  npm run test:all           上述两组，共 59 项
  npm run test:browser
  npm run test:react
  npm run test:semantic-edit
  npm run compare:renderers
  npm run test:pointer
  npm run test:expressions
  npm run test:expressions-native
  npm run test:selection
  npm run test:selection-native

generate 从语义 JSON 和其相邻 assets 目录生成结果，不读取原始 RP。
可通过第三个位置参数指定 assets 所在的父目录。
可以直接编辑控件的 content、位置、样式和已支持的 behaviors，再运行 generate。
schemaVersion: 2 的中继器保存 template + rows + bindings，不保存展开后的 children。
修改 rows.cells 或模板后，HTML / JSX 会重新生成行；初始空数据集也保留模板。
静态行绑定支持字面量、列引用和字符串拼接。运行时 UIExpression 另支持控件取值、
局部变量展开、四则运算/取余、比较/逻辑、slice/toFixed 和 [[...]] 插值；
未覆盖的变量、函数或作用域会报告缺口，不执行任意 JavaScript。
静态行绑定只保留在 bindings，不再重复生成加载赋值动作，避免覆盖手工编辑的绑定。

结构阅读顺序
  Project.pages → Page.widgets → Widget
  Widget.content：文本、矢量路径、图片或表单内容
  Widget.behaviors：事件及动作；branch.branches 保留按序选择的条件分支
  Action.expression：显式表达式树；set-text / set-selected 消费该树
  Widget.states：动态面板状态；Widget.repeater：模板、数据和绑定
  Widget.kind = group：children 保留组成员，子控件坐标相对组位置
  Widget.source：回查 RP 的定位信息；不属于可见内容
  Widget.selected：初始选中状态；variants.selected 保存选中外观
  Widget.selectionGroup：独占选择组；repeater.isolateSelectionGroups 控制逐行隔离
  Widget.disabled：初始禁用状态；省略时兼容 FormControl.disabled
  Widget.variants.disabled / selected：外观 { css, content? }；省略 content 就复用正常内容
当前模型仍用 x/y/width/height、css、behaviors 字段，未改成 layout/style/events。
kind 表示 UI 分类，type 保留原生类型简称；这处重复是后续可精简的兼容字段。
materializePage / materializeRepeater 返回渲染视图，包含行实例和派生 children；
不要用该视图覆盖可编辑的原始 Project。运行时页码和排序单独保存在 RepeaterState。
这里的“语义”指 UI 控件和行为，不会自动推断业务组件，例如商品卡片或登录表单。

打开
  output/campus/index.html             传统 HTML 预览
  output/campus/react/index.html       React JSX 编译后的预览
  output/campus/react/source/Page1.jsx 可编辑 JSX
  output/campus/react/source/Page1.tsx 同一组件的 TSX
  output/campus/project.json           可编辑语义结构
  output/campus/source/project.ts      类型化语义结构常量
  output/campus/comparison.html        原始内嵌缩略图与生成截图对照

生成的 react/ 目录可独立复制，包含 package.json、源码、静态 HTML、资源和构建脚本。
在该目录执行 npm install && npm run build && npm run typecheck 即可重新构建。
实际已在工作区外临时目录验证，不依赖本研究项目的 node_modules。
浏览器输出无需运行 Node、Axure、.NET 或外部网络。

公共 API
  src/index.ts 导出以下阶段：
    parseRp9Container / parseRp9Payload / encodeRp9Payload
    parseRp9Graph / parseRp9Semantic（亦称 convertRp9）
    parseSemanticProject / pageHtml / pageToJsx / emitProject
  parseRp9Semantic(buffer) 返回 { project, assets }。
  emitProject(project, assets, destination) 同时生成 HTML 与 React 工程。
  parseSemanticProject(json) 校验 schema、类型、重复 ID、尺寸及资源路径。

关键文件
  src/model.ts                  带版本的语义结构定义
  src/semantic.ts               语义 JSON 输入校验
  src/convert.ts                原始对象图 → 语义结构
  src/graph.ts                  字符串、GUID 和对象引用解析
  src/groups.ts                 组成员引用 → 有序树及相对坐标
  src/styles.ts, vector.ts      样式继承、富文本、几何路径/填充解析
  src/repeater.ts               原生中继器绑定 → 表达式结构
  src/repeater-model.ts         模板实例化、排序和分页，供两种渲染器共用
  src/widget-state.ts           派生控件索引及共享启用/禁用规则
  src/selection.ts              选择组、单选框及组/面板递归选中规则
  src/dom-content.ts            HTML 外观更新，保留输入控件节点和用户编辑值
  src/interactions.ts           事件/条件组/动作翻译与缺口报告
  src/native-expression.ts      原生 RP 表达式和路径 → UIExpression
  src/expression-parser.ts      [[...]] 公式的受限语法解析
  src/expression.ts             两种渲染器共用的表达式求值与逐行引用绑定
  src/behavior-runtime.ts       条件分支、顺序赋值和合成变化事件
  src/widget-dom.ts             HTML 控件读写与 React 实时 DOM 取值
  src/render-tree.ts            语义结构 → 目标元素树
  src/html.ts, jsx.ts           HTML / JSX 发射器
  src/react-runtime.tsx         React 交互状态运行时
  src/emit.ts                   公共文件输出入口
  src/runtime.ts                传统 HTML 交互运行时
  src/parser/rp9-container.ts    容器解析
  src/parser/rp9-payload.ts      无损二进制 AST 解析/编码

验证边界
59 项测试覆盖容器、无损 payload 往返、校园绑定、语义 JSON 往返、
JSX 编译、文字转义、表达式及输入校验。另有真实浏览器语义修改验证。
npm run test:expressions-native 加载挂载的官方 RP9 sto.js / expr.js，验证
980 组标量算术、1786 组条件比较/逻辑、16 组金额格式化以及 14 组缺失值异常。
共 2782 组返回值相同，14 组均抛出 TypeError。它不证明完整原生
交互时序、控件解析或视觉等价。报告：research/interactions/native-expression-validation.json。
npm run test:expressions 分别验证未修改校园样本的加号/失焦条件，以及另建
语义夹具的加减、实时输入、条件启用禁用、逐行小计、选中事件和节点身份保持。
夹具明确补入有效目标，不作为原始 RP 所有分支可运行的证据。
校园 record 18 有 14 个不在本记录的目标路径，其中 8 个路径的目标在所有记录
均不存在。数量控件的部分条件依赖这些引用；整个依赖条件组会报告并省略，
不会猜测替换为同名控件。可复现：npx tsx research/interactions/inspect.ts。
RP9 ItemLoad=289，Raised=304；自定义事件不再误当成中继器加载事件执行。
中继器额外验证：修改 JSON 中的文本、图片、模板位置，以及为空数据集新增行，
在两种浏览器输出中均生效。两种输出各通过 8 组真实点击排序/分页检查。
原生 RP9 随附 repeater.js 的排序/分页函数与 TS 实现通过 2000 次对照；
这仅验证数据行为，不代表原生 DOM、交互时序或视觉等价。
复现命令：npm run test:repeater、npm run test:repeater-edit、npm run test:repeater-native。
最后一个命令需要挂载官方安装包，或用 AXURE_REPEATER_JS 指定官方脚本路径。
禁用状态验证：npm run test:disabled 验证两种浏览器输出的初始禁用、组和面板递归、
隐藏状态页、单独重新启用子控件、点击冒泡、中继器边界及翻页恢复模板状态。
npm run test:disabled-native 执行官方 RP9 enabled() 与默认事件过滤函数，
完成 3100 次状态对照和 14 次事件过滤检查；需要挂载安装包或设置 AXURE_QUERY_JS、
AXURE_EVENTS_JS。它验证状态规则，不验证原生 DOM 样式。
禁用外观验证：npm run test:appearance 从语义 JSON 生成测试页，检查真实校园
中继器的灰色描边/填充/透明度、表单背景、重新启用后的恢复，以及输入值和节点
身份保持。颜色期望来自 RP 样式数据；并非与 Axure 原生截图对照。
该脚本使用 output/appearance-before 保存的旧渲染作为变化检查基准。
禁用浏览器夹具也验证文本框、多行文本、复选框在切换外观后保留编辑状态。
选中外观验证：npm run test:selection 用真实指针切换原始校园样本的两处图片，
验证中继器行状态独立、DOM 身份不变；独立语义夹具验证初始选中、禁用优先、
编辑文本保持、翻页重置以及仅用于变体的图片从 JSON 重新生成。
npm run test:selection-native 对官方 RP9 style.js / axQuery.std.js 的选中和启用函数
执行 800 次状态对照及 800 次事件检查。禁用图片忽略选中赋值；禁用复选框仍可
修改 checked，但外观缓存保留旧值且不发送选中事件。此验证排除原生 DOM、
hover/focus、选择组和导出 HTML 的初始类名，不证明完整视觉等价。
选择组验证：npm run test:selection-groups-native 执行官方 selected()、
SetWidgetSelected/Enabled 及 radio click 函数，完成 1012 组操作、15180 次
控件状态检查，以及 1012 次有序事件列表对照。disabled 同组成员保留选中；
程序设置 radio.checked 会取消同组 checked，但不会同步取消同组外观缓存。
点击已经勾选的命名单选框仍会先取消外观再选中，产生 unselect/select 事件。
组/面板遍历所有状态的直接子控件，同一选择组只选择第一个直接成员，
中继器和热点不通过 public selected() 递归。未模拟树/母版的 contained 路由。
浏览器夹具 npm run test:selection-groups 验证两种输出的真实输入框/标签点击、
重复点击、禁用恢复、隐藏状态成员、重复容器赋值，以及中继器选择组/单选组
隔离和翻页重置。刷新后的元数据维持 DOM 顺序，跨静态/重复成员事件顺序已测。
selectedchange 中立即禁用自身时，后续 select 被抑制；长等待和异步重入仍待验证。
该夹具为原创语义模型，不能替代 RP 原生导出。
校园输出目前 33 个图片资源、46 项转换问题；其中 2 项已实现的选中图片问题已移除。
校园两个渲染器均通过 49 个页面跳转、7 个面板切换、2 个显示隐藏事件测试，
全部图片加载成功，没有重复元素 ID；Tour 也通过两页资源与所测事件检查。
浏览器测试默认用 macOS Google Chrome，CHROME_PATH 可覆盖路径。
图像比较使用 --disable-gpu / --force-color-profile=srgb、图片 decode 和字体就绪。
HTML/React 的逐页截图对照见报告；仍存在少量像素差异。
这只比较两个生成器，不能代替与 Axure 原生输出的比较。
真实指针测试：39 个初始可见导航热点中心，35 个可点，4 个被上层元素遮挡。
该检查故意返回非零；保留失败证据，尚未确认原型是否也存在相同遮挡。
不能用事件派发检查通过来掩盖真实命中差异。
新增分组检查：校园 50 个组、Tour 29 个组的成员关系和原始图内坐标均保持。
在校园 8 页、两种渲染器中，改动前后原控件矩形及中心命中对象保持一致；
截图有少量像素差异，报告单独记录，不以几何检查替代视觉检查。
两种输出各有 8 次组成员真实点击跳转通过；另一个行实例的成员中心在初始状态
不能命中该组，记录为未覆盖。嵌套组显隐、保留子控件隐藏状态、组间隙点击穿透
通过独立浏览器夹具验证。npm run test:groups 使用 output/group-before 作为历史基准；
也可传入另一个已保留的改动前输出目录及当前目录。

报告
  output/campus/conversion-report.json       不支持项
  output/campus/react/browser-validation.json 事件/资源检查
  output/campus/react/pixel-validation.json   HTML/React 像素差异
  output/campus/react/pointer-validation.json 真实点击失败证据
  output/semantic-edit-check/validation.json  JSON 修改后的浏览器验证
  output/campus/group-validation/report.json 分组几何、点击及浏览器验证
  output/disabled-check/validation.json       禁用状态浏览器验证
  research/native-disabled-validation.json   官方禁用逻辑对照
  output/appearance-check/validation.json     真实样本禁用配色及编辑值保持验证
  output/selection-check/validation.json      选中图片与状态浏览器验证
  research/native-selection-validation.json  官方选中状态及事件对照
  research/native-selection-groups-validation.json  官方选择组/容器/单选框逻辑对照
  output/selection-groups-check/validation.json     选择组真实点击及事件顺序
  research/goal-audit.json                    完成审计和剩余事项

格式结论
外层：AC EF + u16LE(9) + u32LE(压缩 manifest 长度)。manifest 使用 LZ4 Legacy，
解压后为 JSON。children/parts 的值是相对 dataBase 的字节偏移，不是数组索引。
记录为 reserved:u32LE + storedLength:u32LE + payload；部分为 gzip，部分直接存储。
二进制 payload 为头部、字符串表和带 tag 的对象树，包含对象引用、GUID 表、
有序 map/list、浮点原始位、图片流。不能依靠扫描 gzip 头或字符串替换可靠还原。

解析层使用保留原始浮点位、map 顺序和重复键的 TS AST。
官方 5 份 RP9/RPLIB 的 2137 个二进制块及校园样本全部执行
  decode → JSON.stringify/parse → encode
逐字节一致测试。这里仅证明内部 payload 可往返，不是完整 .rp 写回器，
也不证明 HTML 渲染完全等价。渲染模型本身是简化视图，不作为无损存档。

已实现
绝对布局、命名样式/默认样式继承、富文本、图片及 hash 复用、SVG 路径/贝塞尔曲线、
分组树及基础组显隐/点击、动态面板多状态、热点、基础表单控件、
中继器模板和 Item.column 文本/图片绑定。
绑定按变量 ID 解析列改名后的旧别名。支持条件分支、文本赋值、选中状态及变化事件；
也支持部分页面跳转、面板切换、
显示隐藏、启用禁用、等待，以及中继器数字/文本排序和静态页码/前后页动作。
启用/禁用会递归处理组、面板的所有状态；中继器本身不递归到行模板。
被禁用的图形跳过自己的交互处理，但事件仍能冒泡到已启用的父容器。
重新启用父组会覆盖子控件之前的禁用状态；单独重新启用子控件也会生效。
禁用样式按增量合并到正常样式，避免文档默认颜色/字体覆盖控件已有设置。
语义模型可保存禁用 CSS 和可选替换内容；纯样式变化复用原内容。
中继器行绑定和 SVG 定义 ID 会同步处理所有替换内容。JSX 中保留实际状态节点，
HTML 更新已有内容节点，不通过重建输入框切换外观。

三方元件
只要三方库元件被展开/保存为 RP9 原生图形、图片、文本、面板等对象，就沿用
相同解析链路；样本中存在 DaisyWeb 元件库的命名样式缓存。
这不代表所有三方库均已验证。母版实例、外部网页/脚本、未覆盖对象或特殊
交互需要单独实现。不能仅凭“可解析对象树”承诺任意元件视觉等价。

已知缺口
组旋转/透明度/交互样式传播及高级组行为、表达式 AST 之外的函数/全局变量/作用域、
多无条件用例的选择菜单、带等待的多个独立条件组时序、运行时数据增删/筛选、
日期/区分大小写排序、动态表达式页码、部分事件、动画、
母版实例、部分表单属性、自适应视图、精确字体度量、某些边框/箭头等未完整实现。
中继器运行时数据行为仍不完整；自动尺寸、交替背景、复杂加载动作和刷新时序
需要进一步验证。报告保留未实现项，已编译的行绑定不会再作为缺失动作重复报告。
常规矢量和表单的禁用外观已支持；校园 remove 组的灰色填充、描边已验证。
单选框/复选框的自定义指示器仍使用浏览器外观，记录 disabled-appearance-control；
未覆盖的容器外观记录 disabled-appearance，状态布局变化另行报告。
校园两个图片元件的选中态图片已按原始资源替换并验证；
独占选择组、组/面板选中传播及单选组已实现；初始互斥状态冲突、
contained 子图形/母版对象转发与完整异步事件时序仍需原生验证。
解析器只接受已验证的 RP9 结构和边界，RP7 ZIP 及未知变体会明确报错。

视觉校验与 computer use
已启动官方 Axure RP 9.0.0.3754，尝试打开 campus.rp 并通过桌面导出。
系统允许辅助功能，但不允许当前执行宿主屏幕录制；截图失败，启动弹窗的
辅助功能树也无法读取，因此没有获得原生 HTML 导出/全尺寸截图。
Axure 仍打开，DMG 仍挂载；正常退出请求被弹窗取消。未强杀或更改权限。
证据：research/desktop-evidence/result.json。
RP 中的 8 张 JPEG 缩略图约 121×256，可辅助检查布局，但可能是编辑态/旧快照；
例如美食页缩略图中有弹层，不能当作运行时初始状态的像素基准。
生成截图来自 headless Chromium。事件测试验证事件处理器及目标 ID 连接，
独立指针检查另行记录；动画时序及所有交互分支尚未覆盖，不能宣称 100% UI 等价。
继续原生比较需要执行宿主获得屏幕录制权限并处理 Axure 启动弹窗，
或用户提供该 RP 的 Axure 原生 HTML 导出。

来源与归属
REA skill：https://github.com/morluto/rea
本地 skill：research/rea/.agents/skills/reverse-engineer-anything/SKILL.md
REA 托管检查保留了结果；选定 DLL 成员分析遇到工具表示大小限制，之后使用
dnfile/dncil 静态 IL 分析补充，未运行目标 DLL。

官方安装包：https://axure.cachefly.net/versions/9-0/AxureRP-Setup-3754.dmg
官方 C# API：https://www.axure.com/axure-rp-api
下载：https://maxure.s3.amazonaws.com/AxureRP-9-0-API.zip
API 本地位置：research/AxureRP-9-0-API
官方 .NET API 只用于验证结构和调用链，TS 转换器无需它。
IL 确认 RPDocument.Load → RpFileStorage → CompactArchive → LZ4/JSON。
证据：research/api-artifact.json、rpdocument-il.json、jl-il.json、storage-il.json。

借鉴的开源解析器：https://github.com/LilZeeCN/zee-rp
固定 commit：b3a6709382fe57fba59bd744687e633229a1ec71
rp9-payload.ts 的协议实现基于其 MIT parse-payload.mjs，保留署名及许可证。
许可证与归属：THIRD_PARTY_NOTICES.md；各源文件散列：research/ts-options.json。
本项目 HTML 渲染、样式映射及交互实现为本次研究实现，未把上游摘要当作无损模型。
另检查：https://github.com/FD-design/YPAxure；其覆盖不足以直接完成本任务。

校园样本：https://github.com/SouthAki/GKD-applicationUI-Design
固定 commit：82520f05cd8f0f84dad28ff152ccad90fcfa4356，文件 demo.rp。
12899892 字节，SHA256：965788d14659ac2db4cc08dcd7fb3898ae8e71f60d8c62a652db11c7dd2eea0a
包含 8 页面、8 动态面板/12 状态、3 中继器、546 个含容器和模板的序列化控件。
恢复分组后，按初始行数据实例化输出 630 个渲染对象（含 66 个组容器）；
模板、初始行实例和容器不是相同统计口径。
原仓库 GPL-3.0；保留 research/public-sample/campus-LICENSE。
来源记录：research/public-sample/provenance.json；未发布到外部站点。

React 官方 API 参考（实现时核对）：
https://react.dev/reference/react-dom/client/createRoot
https://react.dev/reference/react/useEffect

开源准备
项目名称暂定 AxureCraft，GitHub 账号 renaesop 已验证，仓库尚未创建。
README.md、原创语义示例、横幅、MIT LICENSE 和第三方归属说明已准备。
生产解析器已移到 src/parser，research/container 保留研究 CLI/兼容入口。
按用户要求在转换与验证完成后用 gh 创建公开仓库，并添加简介与 Topics。
发布前将采用明确文件清单，排除官方安装包/DLL/原生运行时、第三方 RP 与派生图像。


2026-11-05：真正的原生 HTML 截图基准
找到同一 Git 提交的 Webstack RP9 源文件与原生导出 HTML，393 个展开控件、4 个面板、8 个中继器。
使用 scripts/compare-html.mjs 对照两份 HTML 的完整 viewport，未裁切、未忽略抗锯齿像素。
1440x1000 的不同像素从 363105 降至 10897；1920x3000 长页不同像素为 25992/5760000（0.4513%）。
改进包括页面居中、空形状动态文本、矩形边框内描边、面板背景/初始自适应尺寸、文字自动宽度、字体与样式覆盖、图片边框和圆角。
小型 URL Variables 配对样例，3 种宽度 x 2 种状态，各有 2–4 个角点差异像素。
另加入全局变量的解析、受限表达式、URL 读写及两个运行时支持，核心测试现在20项，连同本地样本共61项。
详见 docs/native-comparison.md。上述图像指标只验证这些页面状态，不能证明所有交互、固定面板滚动、母版或三方库等价。
