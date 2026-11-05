# 原生 HTML 截图对照

比较的两端分别是 Axure 发布的 HTML，以及本项目直接从配套 RP9 文件转换的 HTML。没有借用原生 HTML 的布局或图片资源生成结果，也没有修改输入 RP。

## 复杂样例：Webstack

- 来源：[RicardoWesleyli/webstack](https://github.com/RicardoWesleyli/webstack)
- 固定提交：`11331466fcde1543f11d9adba3427054174e3b3b`
- 输入：`webstack.rp`，SHA-256 `c2f3d9a4bf448c91aac0e77d21a9f545a962a5632177a5be5c1f215c8373bf16`
- 基准：同一提交中的 `index.html` 及配套资源
- 规模：1 页、393 个展开控件、4 个动态面板、8 个中继器、68 个资源
- 转换报告仍有 50 项诊断，包含尚未支持的移动、新窗口跳转和中继器能力提示。

| 截图 | 不同像素 | 占比 |
| --- | ---: | ---: |
| 1440 × 1000 首屏 | 10 / 1,440,000 | 0.000694% |
| 1920 × 3000 长页 | 20 / 5,760,000 | 0.000347% |

首屏修复前有 363,105 个不同像素。对照促成的修复包括：面板背景、按内容计算初始面板尺寸、阴影裁切、自动宽度文字换行、文本样式覆盖、字体回退、图片边框导致的缩小和圆角裁切。

后续逐区域修复将首屏从 10,897 降到 10 个差异像素，长页从 25,992 降到 20 个差异像素：原生矩形使用 CSS 绘制；图片保留 SVG 裁剪/描边，Repeater 的空图片槽也保留框架；搜索框恢复 2px 透明边框、内边距和提示文字颜色。剩余差异只在搜索下箭头和 GitHub 图标的矢量边缘，最大通道差为 8。精确差异计数包含任何通道上的差别，没有忽略抗锯齿像素，也没有裁切空白区域。像素一致比例不等于交互功能覆盖率。

复现时先获取第三方样例（不随本项目分发）：

```bash
git clone https://github.com/RicardoWesleyli/webstack.git research/webstack
git -C research/webstack checkout 11331466fcde1543f11d9adba3427054174e3b3b
npm run convert -- research/webstack/webstack.rp output/webstack
python3 -m http.server 8769 --bind 127.0.0.1 --directory research/webstack
```

保留该本地服务，在另一个终端执行：

```bash
npm run compare:html -- examples/webstack-comparison.json output/webstack-comparison
```

打开 `output/webstack-comparison/index.html` 可查看并排截图和差异图。`report.json` 记录浏览器版本、输入地址、错误与像素指标。

## 小型交互样例：URL Variables

[Axure 论坛原帖](https://forum.axure.com/t/global-variables-passed-via-url/67262) 同时提供 RP 文件与 [原生页面](https://prq56x.axshare.com/page_1.html)。输入 SHA-256 为 `4ab16b33bf8c4d5eb5271c9911e1add2ca137240b66a5c3a6c7a7fed8417553a`。

在 900、375、240 像素宽度下，分别对照初始状态与 `#text=hello&color=blue` 状态。每张截图高度 600，差异为 2–4 个矩形角点像素。这验证了页面居中、初始空文字控件的动态赋值、变量读取与选中颜色的这条组合路径。

## 测量环境与范围

记录结果使用 macOS、Chrome 156.0.8078.81、deviceScaleFactor=1、sRGB；两端使用相同浏览器设置，加载完成后等待字体和图片。不同操作系统、浏览器或字体可能改变像素计数。

这些比较覆盖初始页面及注明的 URL 状态，不验证滚动后的固定面板、所有菜单操作、所有条件分支或任意第三方元件。字体、图片和原型版权归原作者。原生 Axure 运行时与第三方 RP 不包含在本仓库中。

## GitHub Actions

[手动运行 Native HTML comparison](https://github.com/renaesop/axurecraft/actions/workflows/native-comparison.yml)，然后在运行页面下载 `native-html-comparison` artifact。它包含并排截图、差异图、原始截图、机器可读报告及转换诊断；任务摘要展示差异比例。

该任务在 Ubuntu 24.04 上使用 Playwright 安装的 Chromium，因此指标可能与上面的 macOS 历史记录不同。像素差异属于诊断结果，未设置通过阈值；页面异常或图片加载失败会令工作流失败。常规 CI 则使用原创语义夹具，自动验证 HTML / React 行为和独立构建。


## 交互状态回归

截图配置现包含初始、第一张卡片悬停、搜索下拉菜单打开、页面滚动，并在 GitHub Actions 同时比较 HTML 和 React 输出。

1440×1000 本地结果：初始 10 像素；悬停 42；菜单打开 11（最大通道差 1）；滚动 500px 后 0。菜单修复前为 571：原生半透明边框的填充与描边分开绘制，现已匹配。1920×3000 初始仍为 20 像素。

这里的 0 只对应已记录的滚动状态，不表示所有控件或完整交互等价。比较器同时记录主要差异区域、页面错误、失败图片请求；不使用差异容差掩盖剩余像素。
