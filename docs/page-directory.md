# 页面目录的层级与顺序

Issue #12 在主分支 `ee5ba11` 上可用已收录样本 `tests/fixtures/rpteam/706platform.rpteam` 复现：输出按容器记录顺序从“官网首页”开始，25 个页面全部平铺。原生 sitemap 实际从“工程规范文档”开始，存在三级页面及“弃用版本”文件夹。

`DesignDocument.sitemap` 指向 `Axure:SiteTreeMap`。其中 `tree` 的 `children` 列表定义根节点顺序，`Axure:Node.children` 定义子节点顺序，`node-table` 把节点映射到页面包 GUID 或 `Axure:MasterTreeFolder`。转换现在保留此结构到可选的 `Project.pageTree`；HTML 和 React 入口共享同一目录展示，初始页面为树中首个页面。

页面文件名、页面 GUID 和已有交互链接保持其原始映射。同名页面通过 GUID 区分，目录文件夹仅用于组织，不生成虚假页面。部分团队快照的页面记录未出现在保存的 sitemap 中，这些页面追加到目录末尾，不推测父节点。无 sitemap 的旧语义 JSON 继续按 pages 数组生成平铺目录。

损坏或重复的原生树节点会报告 `page-directory` 诊断，并保留其他可用页面。语义 JSON 的 pageTree 验证引用、节点唯一性、页面覆盖和深度，防止目录跳转到不存在的页面。

## 浏览器截图

修复前，页面平铺且从“官网首页”开始：

![修复前目录](page-directory-before.png)

修复后，恢复原生层级和首个页面：

![修复后目录](page-directory-after.png)

## 回归验证

```bash
npm run test:ci
npx --no-install tsx scripts/validate-page-directory.ts
node scripts/validate-standalone.mjs output/page-directory-check/authored/react
```

`tests/fixtures/page-directory.ts` 生成 `.rp` 与 `.rpteam` 原生编码夹具，故意使记录顺序与目录顺序不同，包含子页面、同名页面、文件夹及未收录页面。三项初始目录回归在修复前失败；真实样本直接使用仓库已有二进制文件及其校验和。

浏览器回归检查两个样本的 HTML/React 入口：目录顶层顺序、三级子页面、默认页面、同名页面的独立目标、选中状态和文件夹展开/折叠。截图及报告写入 `output/page-directory-check/`。

## React DevTools 的独立调查

Issue #13 单独跟踪 React 入口审查。此次以 DevTools renderer hook 探针检查 `react/index.html`，顶层静态容器没有 React renderer，但子 iframe 已注册 `react-dom 19.3.1`，并提交包含 `Page1`、`PrototypePage`、`RpWidget` 的组件树；直接打开 React 子页同样可检测。尚未用浏览器扩展 UI 复现用户的全部操作，因此不将其描述为所有 React 页面均不支持 DevTools。目录修复不关闭 #13。
