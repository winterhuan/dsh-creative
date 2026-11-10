# AGENTS.md

`dsh-creative` 管理 DeepSeek Harness（DSH）的 8 个插件子模块。先读 [HANDOFF.md](HANDOFF.md)，按[源码映射](HANDOFF.md#开发目录与源码归属)进入目标仓库。

## 工作目录

- 插件源码只在 `plugins/<仓库名>` 维护。父仓库不保留 `packages/winterhuan/` 副本，也不使用 `~/dsh-plugins`。
- 先在子模块提交并推送，再在父仓库提交对应指针；父仓库提交不会保存子模块内未提交的改动。保留其他未提交工作，按路径暂存。
- 技能查看器统一在 `plugins/dsh-skills-viewer` 维护两个源码包，由构建生成可单次安装的 `plugin/`，不要手改产物。
- 本机市场索引在 Git 忽略的 `.worktrees/market-site` 检出维护（同一远程的 `gh-pages` 分支）；发布材料与历史副本位置见 HANDOFF 第 12 节。

## 必须遵守

- 不修改根目录或子模块内 `upstream/` 的源码；它们只作参考与客户端测试来源。
- DSH 依赖使用精确版本；当前依赖与上游标签为 `0.2.2-rc.1`／`dsh-v0.2.2-rc.1`，配套范围见 [依赖策略](HANDOFF.md#6-依赖策略)。升级时同步核对所有插件的依赖、锁文件、补丁与标签。
- 新用到 `ctx.remote.<命名空间>` 时，将提供它的 DSH 包加入对应包的 `devDependencies`，并写 `import type {} from '<包>/remote'`。
- 修改首行标记 `Copied from deepseek-harness` 的脚本或类型副本后，更新 HANDOFF 第 8 节的改动表。
- 客户端行为需在真实 DSH 验证。日常 profile 使用远程发布包；本地调试使用独立 profile，构建后重启开发进程并硬刷新。勿用裸 npm 包名的 `plugin-update` 覆盖 Git 安装。
- 代码风格沿用 `upstream/AGENTS.md` 的 Conventions 与 Type safety；上游 monorepo 的发布流程不适用于这些独立插件。

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
