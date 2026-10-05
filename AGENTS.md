# AGENTS.md

`dsh-creative` 是 DeepSeek Harness（DSH）的外部插件仓库，包名都在 `@winterhuan` 下。开始工作前先读 [HANDOFF.md](HANDOFF.md)：里面有架构、构建流程、迁移时遇到的问题和解决方案，以及升级 DSH 的清单。

## 必须遵守

- 不修改 `upstream/`。它是固定在 `dsh-v0.2.1-alpha.1`的子模块，只用作代码参考和客户端单元测试的源码。
- DSH 包统一写精确版本 `0.2.1-alpha.1`，不要写 `*` 或 `latest`：该版本发布在 `alpha` 通道，升级时核对目标版本与 Cordis 配套范围。
- 新用到 `ctx.remote.<命名空间>` 时，把提供它的 DSH 包加进该包的 `devDependencies`，并写 `import type {} from '<包>/remote'`。
- `scripts/` 和 `types/` 里首行标着 `Copied from deepseek-harness` 的文件是上游拷贝；修改或重新同步后，更新 HANDOFF.md 第 8 节的改动表。
- 客户端 UI 的改动要在真实 dsh 里验证（HANDOFF.md 第 5 节）；单元测试覆盖不到浏览器里的行为。
- 代码风格沿用 DSH 的约定（`upstream/AGENTS.md` 的 Conventions 与 Type safety 部分）；其中针对 monorepo 的门禁、快照和发布流程不适用于本仓库。

## 命令

```sh
pnpm install
pnpm run typecheck   # 先构建 host 面并生成 typert 产物，再检查 client 面
pnpm run build
pnpm test            # 客户端测试需要先 git submodule update --init
```

提交前至少运行 typecheck、build 和 test。
