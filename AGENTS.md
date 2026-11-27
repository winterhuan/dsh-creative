# AGENTS.md

`dsh-creative` 管理 DeepSeek Harness（DSH）的插件子模块。先读 [HANDOFF.md](HANDOFF.md)，按[源码映射](HANDOFF.md#开发目录与源码归属)进入目标仓库。

## 工作目录

- 插件源码只在 `plugins/<仓库名>` 维护。父仓库不保留 `packages/winterhuan/` 副本，也不使用 `~/dsh-plugins`。
- 先在子模块提交并推送，再在父仓库提交对应指针；父仓库提交不会保存子模块内未提交的改动。保留其他未提交工作，按路径暂存。
- 技能查看器统一在 `plugins/dsh-skills-viewer` 维护两个源码包，由构建生成可单次安装的 `plugin/`，不要手改产物。
- 本机市场索引在 Git 忽略的 `.worktrees/market-site` 检出维护（同一远程的 `gh-pages` 分支）；发布材料与历史副本位置见 HANDOFF 第 12 节。

## 必须遵守

- 依赖安装、构建和服务运行使用当前环境的原生工具链：Windows 使用 PowerShell 与 Windows Node.js；macOS 使用本机 Shell 与 Node.js；Linux／WSL 使用所在系统的 Shell 与 Linux Node.js。Windows 原生服务在 Windows 中操作，WSL 服务在 WSL 中操作；各环境分别安装依赖，不共用 `node_modules`。安装前先保留未提交工作并同步最新代码。
- 浏览器操作与真实 DSH 客户端验收使用 `ego-browser`；先运行 `ego-browser skill` 读取当前指南，实际验证后再报告结果。
- Story 工作台与创作行为跟随 `zenstory-ai/oh-story-dsh`；fork 仅保留官方 Ego 技能接入和预构建固定 Git 包发布所需的适配，范围见[创作集成](docs/subsystems/writer.zh.md)。
- 不修改根目录或子模块内 `upstream/` 的源码；它们只作参考与客户端测试来源。
- DSH 依赖使用精确版本；当前依赖与上游标签为 `0.2.2-rc.5`／`dsh-v0.2.2-rc.5`，配套范围见 [依赖策略](HANDOFF.md#6-依赖策略)。升级时同步核对所有插件的依赖、锁文件、补丁与标签。
- 新用到 `ctx.remote.<命名空间>` 时，将提供它的 DSH 包加入对应包的 `devDependencies`，并写 `import type {} from '<包>/remote'`。
- 修改首行标记 `Copied from deepseek-harness` 的脚本或类型副本后，更新 HANDOFF 第 8 节的改动表。
- 客户端行为需在真实 DSH 验证。日常 profile 使用远程发布包；本地调试使用独立 profile，构建后重启开发进程并硬刷新。勿用裸 npm 包名的 `plugin-update` 覆盖 Git 安装。
- Windows 和 macOS 日常只运行 `web`、`student`：Story、Media Desk、Antfarm 与通用工具集中在 `web`，Student 保留学习模式；Superagent 按需启动。Linux／WSL 保留既有独立 profile。各平台复用 `dsh-sre` 和所属 profile 命令，安装、更新和启停按 [服务约定](HANDOFF.md#independent-service-profiles)操作。
- 代码风格沿用 `upstream/AGENTS.md` 的 Conventions 与 Type safety；上游 monorepo 的发布流程不适用于这些独立插件。
- Superagent 研究原型保留自身依赖与源码检查；父仓库仍运行它的安装、类型检查、构建、测试和 README 检查，范围见 [HANDOFF](HANDOFF.md#6-依赖策略)。

## 命令

```sh
git submodule update --init --recursive
pnpm install
pnpm run plugins:install
pnpm run typecheck
pnpm run build
pnpm test
pnpm run doc-sync
pnpm run hygiene
```

根命令按子模块调用独立工具链；仅修改一个插件时，在该子模块执行对应检查。代码提交前至少完成 typecheck、build 和 test。

## Agent skills

### Issue tracker

父仓库任务使用 GitHub Issues；读写任务前查看 [issue tracker 约定](docs/agents/issue-tracker.md)。

### Triage labels

分类任务时采用五个标准标签，映射见 [triage labels](docs/agents/triage-labels.md)。

### Domain docs

父仓库采用 single-context，决策沿用 Agent Notes；探索领域或记录决策前查看 [domain docs](docs/agents/domain.md)。
