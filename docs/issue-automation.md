# 定时从 issue 生成修复 PR

本地 worker 每两小时检查 `renaesop/axurecraft`，每次最多处理一条最早创建的未解决 issue。它在独立 checkout 中调用已登录的 Codex，要求实现与回归验证一起提交，通过核心检查后使用 `gh` 创建草稿 PR。PR 不会自动合并。

调度运行在 macOS 的用户级 `launchd` 中；代码与浏览器验证运行在 GitHub Actions。电脑需要保持开机、用户登录且联网。睡眠、关机或注销时不能保证准点执行。此实现复用本机登录，不要求把 API key 放进仓库或 Actions。

## 安装与运行

需要 Node.js 22.18+、git、npm、GitHub CLI 和支持自定义权限配置的 Codex CLI。本地验证使用 Codex CLI 0.162.1。先完成 `codex login`、`gh auth login`，并确认 GitHub 账号能向本仓库推送分支和创建 PR。

```sh
# 查看下一条候选，不运行代理、不推送代码
node scripts/issue-worker.mjs --dry-run

# 查看调度配置
node scripts/install-issue-worker.mjs --dry-run

# 安装每两小时运行的用户任务；安装时不立即处理 issue
node scripts/install-issue-worker.mjs

# 手动执行一轮真实处理
node scripts/issue-worker.mjs

# 停用任务，保留日志和状态
node scripts/install-issue-worker.mjs --uninstall
```

任务名为 `com.axurecraft.issue-worker`，配置位于 `~/Library/LaunchAgents/com.axurecraft.issue-worker.plist`。安装器写入 Node、脚本的绝对路径，并记录当时的 `PATH`；移动 checkout 或 CLI 后重新安装。其他系统可用自己的调度器调用 `node scripts/issue-worker.mjs`，此仓库未提供其他平台的安装器。

默认状态目录为 `~/.local/state/axurecraft-issue-worker/`，可用 `AXURECRAFT_WORKER_STATE` 覆盖。`state.json` 保存处理结果，`worker.stdout.log` / `worker.stderr.log` 保存调度输出，`runs/<时间>-issue-<编号>/` 保存独立仓库、模型结果、验证日志和 PR 正文。这些本地记录不随仓库发布，也不自动清理。

## 一轮处理的规则

1. 加锁，读取 open issues 和所有状态的 PR。跳过 `automation:skip`、`duplicate`、`invalid`、`wontfix` 标签，以及已有 `automation/issue-N` 分支 PR 的 issue，包括关闭或合并的 PR。
2. 克隆默认分支，安装其现有依赖并执行 `npm run test:ci`，确认基线可用。
3. 把 issue 与评论作为 JSON 问题数据传给 Codex。运行最长 45 分钟；实现必须包含 `src/` 改动，以及 `tests/*.test.ts` 或 `scripts/validate-*.ts|mjs` 中的验证代码。
4. 检查改动范围，再次执行核心测试和 `git diff --check`。代理报告的命令不会被直接当作 shell 命令执行。
5. 确认 issue 仍打开且未更新，提交到 `automation/issue-N`，创建草稿 PR。GitHub Actions 执行 Node 22.18/24 核心检查、HTML/React 浏览器回归、结构审查及独立工程构建。自动修复 PR 中新增或修改的 `validate-*` 脚本也会执行，结果写入 `output/issue-validation.json`。

Codex 的命令和本地测试使用无网络权限配置，禁止读取常见凭据目录；外层控制器负责 GitHub 操作。允许新增或修改实现、TypeScript 测试、验证脚本、文档和原创语义夹具，禁止自动修改依赖清单、工作流及 worker 自身，禁止删除文件或引入符号链接。浏览器验证放在 CI；本机受限配置不允许 Chrome 的部分系统服务。

缺少可复现 RP、需要超出范围的改动时，记录 `blocked` 及原因，等 issue 更新后再试。运行或验证失败时，记录 `failed`，24 小时后可重试；issue 更新会解除等待。已有 PR 不会重复创建，也不会自动更新或合并。

如果推送已成功但创建 PR 失败，远端分支会保留；后续运行拒绝覆盖它，需要根据 `publish.log` 和 `pr.md` 恢复 PR。CLI 登录过期、配额不足或网络不可用也会记入失败日志。

## 验证范围

`npm test` 包含八项 worker 测试。集成测试使用真实 git 仓库、提交、向本地裸仓库推送及真实 npm 测试命令，以替身代替模型和 GitHub，检查实现与回归一起提交、草稿 PR、已有 PR 去重，以及测试失败、越界改动、缺少复现时不发布。另验证调度间隔及路径转义。

这些测试不证明模型能够解决任意 issue。真实模型输出仍依赖复现信息与人工 PR 审查；`--dry-run` 只证明候选选择和 GitHub 读取，不能当作一次真实自动修复成功。
