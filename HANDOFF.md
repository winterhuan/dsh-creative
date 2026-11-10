# dsh-creative 开发交接

最后更新：2026-11-10。

本仓库统一管理 8 个独立 DSH 插件仓库、开发检查和交接文档。插件源码仅在 `plugins/` 下的 Git 子模块中维护，父仓库记录各子模块的固定提交；本机 DSH 继续安装 GitHub 远程发布包。

## 目录

1. [现状速览](#1-现状速览)
2. [仓库结构](#2-仓库结构)
3. [与 DSH 的集成方式](#3-与-dsh-的集成方式)
4. [开发命令与构建流程](#4-开发命令与构建流程)
5. [在 DSH 中安装、调试和移除](#5-在-dsh-中安装调试和移除)
6. [依赖策略](#6-依赖策略)
7. [实际遇到的问题与解决方案](#7-实际遇到的问题与解决方案)
8. [从上游复制的文件及本地改动](#8-从上游复制的文件及本地改动)
9. [升级 DSH 版本清单](#9-升级-dsh-版本清单)
10. [已知限制与待办](#10-已知限制与待办)
11. [排障速查](#11-排障速查)
12. [本机环境变更记录](#12-本机环境变更记录)

## 1. 现状速览

8 个插件仓库包含 9 个源码包。`dsh-writer` 发布版本为 `0.1.10`，`dsh-project-default-mode` 为 `0.1.9`，`dsh-shadow-mind` 为 `0.2.1`，其余原有插件为 `0.1.8`，兼容 DSH `0.2.2-rc.1`；`@winterhuan/dsh-antfarm` 发布版本为 `0.3.3`，固定 DSH `0.2.2-rc.1`，保留原版三个工作流、persona 身份与 SQLite 业务状态，每次尝试创建共享 standard 组合的全新 DSH Session，包含配置管理与运行界面；取舍见[原版 Agent 与存储决策](.agents/notes/implemented/architecture/2026-11-08-antfarm-original-agents-and-storage.zh.md)。技能查看器的 Host 与 Client 在一个仓库共同维护，随一个组合包安装。安装者使用[插件市场](https://winterhuan.github.io/dsh-creative/index.json)或各子模块 README 中的固定 Git 安装地址；开发者在下面的子模块目录修改源码。

## 2. 仓库结构

### 开发目录与源码归属

`plugins/` 下每个目录对应一个独立 GitHub 仓库，映射和固定提交由 `.gitmodules` 与 Git 子模块指针记录。父仓库没有另一份插件源码；`packages/winterhuan/` 已移除，`~/dsh-plugins` 不再作为工作目录。

| 子模块 | 源码目录（相对子模块根目录） | 构建后的安装目录 |
|---|---|---|
| [dsh-writer](plugins/dsh-writer/README.zh.md) | `packages/winterhuan/writer` | `packages/winterhuan/writer` |
| [dsh-student](plugins/dsh-student/README.zh.md) | `packages/winterhuan/student` | `packages/winterhuan/student` |
| [dsh-project-default-mode](plugins/dsh-project-default-mode/README.zh.md) | `packages/winterhuan/project-default-mode` | `packages/winterhuan/project-default-mode` |
| [dsh-client-ui-settings-model-options](plugins/dsh-client-ui-settings-model-options/README.zh.md) | `packages/winterhuan/ui-settings-model-options` | `packages/winterhuan/ui-settings-model-options` |
| [dsh-skills-viewer](plugins/dsh-skills-viewer/README.zh.md) | `packages/winterhuan/skill-viewer`、`packages/winterhuan/ui-skill-viewer` | `plugin`（包含两个包） |
| [dsh-antfarm](plugins/dsh-antfarm/README.zh.md) | `src`（单包，包含 Host 与 Client 入口） | 子模块根目录（预构建固定 Git 发布包） |
| [dsh-media-desk](plugins/dsh-media-desk/README.zh.md) | `src`、`client` | 子模块根目录（含预构建 `dist/client.js`） |
| [dsh-shadow-mind](plugins/dsh-shadow-mind/README.zh.md) | `src`（单包，包含审查运行时、命令与预设入口） | 子模块根目录（预构建固定 Git 发布包） |

```text
dsh-creative/
├── plugins/              8 个独立 DSH 插件仓库的 Git 子模块
├── scripts/              批量命令、文档与代码检查
├── tests/                父仓库工具测试
├── docs/、.agents/       跨插件文档、协作规范与决策记录
├── archive/              历史快照，不参与构建与检查
├── upstream/             父仓库的只读 DSH 参考子模块
├── .worktrees/market-site/ 本机 gh-pages 检出，Git 忽略
└── .gitmodules           子模块地址与路径
```

每个插件子模块有自己的 `package.json`、锁文件和构建配置；原有 5 个仓库带只读 `upstream/`，Antfarm 使用父仓库的上游参考。父仓库的 pnpm workspace 不把子模块的包合并安装。`.worktrees/market-site` 是本机保留的独立 Git 检出，属于 `winterhuan/dsh-creative` 的 `gh-pages` 分支，仅维护 `index.json` 和 `plugins.txt`，不是插件子模块；新克隆不会自动创建它。

### 开发与发布规则

1. 在目标子模块内修改源码、测试和配套文档。开始时核对该仓库的 remote、分支与未提交改动；新克隆的子模块可能处于 detached HEAD，开发前切换到工作分支。
2. 各插件独立安装依赖、构建和测试；父仓库批量命令依次调用各插件脚本，任何失败都会停止。技能查看器只编辑两个源码包，由构建生成 `plugin/`，不直接修改生成目录。
3. 先在子模块提交并推送改动，再在父仓库提交该子模块路径的指针更新。父仓库提交不会包含子模块内未提交的文件；其他机器应能从远程获取所记录的提交。不要在存在未保存改动时强制更新或重置子模块。
4. Writer `0.1.10` 与项目默认模式 `0.1.9` 单独发布；原有 5 个仓库的 6 个包在统一升级时保持版本一致，核对包清单、锁文件、预构建安装内容和 Release。Antfarm 按独立版本发布并加入市场。已发布标签不覆盖；市场插件仓库保留 `dsh-plugin` topic。先发布插件，再按[官方市场文档](https://deepseek-harness.github.io/deepseek-harness/guide/plugin-market)更新 `gh-pages` 索引中的版本、固定提交、安装路径和兼容声明；验证远程安装及详情页后更新日常 profile。

Media Desk fork 在 `winterhuan/dsh-media-desk` 维护，包名为 `@winterhuan/dsh-media-desk`，发布版本为 `2.6.2-winter.1`。上游使用指南随包保留；固定 Git 包包含浏览器产物，安装不运行构建。包的 `typecheck` 为 JavaScript 语法检查，JSX 由构建解析，不提供静态类型检查；开发和验证边界见[包说明](plugins/dsh-media-desk/README.zh.md)。

## 3. 与 DSH 的集成方式

插件组合包通过 `package.json` 中的 `dsh.bundle.patch` 激活，客户端通过 `dsh.client` 提供预构建脚本。技能查看器组合包随包包含 Client；不需要分别安装两个包。具体功能、Remote 与安装配置由[子系统索引](docs/subsystems/README.zh.md)和各插件 README 维护。

## 4. 开发命令与构建流程

使用 Node 24（兼容 Node `^22.19.0 || >=24`）和 pnpm 11.7.0。在父仓库根目录初始化：

```sh
git submodule update --init --recursive
pnpm install
pnpm run plugins:install
```

`plugins:install` 对每个子模块运行 `pnpm install --frozen-lockfile`。嵌套的 `upstream/` 提供客户端测试源码；插件构建依赖发布版 DSH 包。修改依赖时在对应子模块更新并提交其锁文件。

```sh
pnpm run typecheck
pnpm run build
pnpm test
pnpm run doc-sync
pnpm run hygiene
```

根 `typecheck` 检查父仓库脚本并调用每个插件的类型检查；`build` 调用每个插件的构建；`test` 运行插件测试和父仓库工具测试。文档及代码检查遍历子模块源码，排除预构建产物、依赖、归档和嵌套上游。仅修改一个插件时，在该子模块根目录执行其 README 中的命令；不需要重建其他插件。

Antfarm 由 `.gitmodules` 自动加入批量命令，使用自己的冻结锁文件。根检查通过统一包发现覆盖其单包 `src`、README、导出 JSDoc 与 UI 文案；README、DESIGN 和 PARITY 均进入双语配对检查。`0.3.0` 的验证范围见 [Antfarm 功能对照](plugins/dsh-antfarm/PARITY.zh.md)。隔离 Web 的确定性验收完成三个工作流、20 个独立原生子会话与 20 次 Bash 调用；固定 Git 远程安装另完成 feature-dev、7 个独立子会话与 7 次 Bash 调用，并核对发布包、配置和浏览器。工作流证据保存在 `~/.dsh/backups/antfarm-release-20261109-0.3.0/evidence/`；scoped 包名、远程安装与组件加载验证保存在 `~/.dsh/backups/scoped-plugins-release-20261109/`。真实模型、在线 GitHub 交付与 Linux／Windows 尚未验证；CLI 正常退出不代表 Run 已接受完成。

Antfarm `0.3.2` 在全局看板提供项目会话选择、团队配置和任务启动；Agent 名称、模型、超时与人设可直接编辑，高级入口保留完整 YAML。隔离 Web 完成浅色／深色、配置保存与重启重载，以及确定性 feature-dev 的 7 次原生 Session／Bash；74 项测试通过。验收材料保存在 `~/.dsh/backups/antfarm-usability-release-20261109-0.3.2/evidence/`。

Antfarm `0.3.3` 明确区分成功、审核退回与执行失败，传递恢复指导并保留工作区学习。固定 Git 远程安装的确定性 Headless 验收完成 11 个独立原生 Session 与 11 次 Bash 调用；81 项测试通过，本地 Web 重启和浏览器加载通过，16 个历史文件与 SQL 业务记录保持不变。证据保存在 `~/.dsh/backups/antfarm-release-20261109-0.3.3/evidence/`。

跨平台检查与真实预览按 [Linux 验收流程](docs/developer/linux-acceptance.zh.md)执行；每次记录待验收提交、阶段退出码和浏览器证据。

## 5. 在 DSH 中安装、调试和移除

日常 `creative`、`headless`、`student`、`web` profile 使用 GitHub 远程发布包，`web` 安装原有 5 个组合包。`@winterhuan/dsh-antfarm@0.3.3` 与 `@winterhuan/dsh-shadow-mind@0.2.1` 从固定 Git 提交安装到日常 `web` profile，服务已重启，历史文件逐字节保留；现有云端预览保持其独立安装项。父仓库或子模块中的本地改动不会自动更新日常安装。通过「插件 → 发现」的市场索引或插件 README 中的固定 Git 地址更新，再重启服务并硬刷新浏览器。

本机额外安装的 Superagent 来自独立源码仓库，安装与更新见 [Superagent 安装说明](docs/user/superagent-installation.zh.md)。

日常 `web` 还安装了 `@winterhuan/dsh-media-desk@2.6.2-winter.1`，来源为 `github:winterhuan/dsh-media-desk#v2.6.2-winter.1`。服务重启后，「自媒体工作台」与示例内容已在真实浏览器加载，既有插件依赖声明保持不变；插件语法检查、构建和 87 项测试通过，未调用真实模型或图片服务。备份与验收证据位于 `~/.dsh/backups/media-desk-release-20261110-2.6.2-winter.1/`。

开发使用独立 profile。先在目标子模块构建，然后安装第 2 节表中的本地目录。以 writer 为例：

```sh
cd ~/dsh-creative/plugins/dsh-writer
pnpm run build
dsh --profile creative-dev --from-default-profile web --dump-config > /dev/null
dsh plugin --profile creative-dev add ~/dsh-creative/plugins/dsh-writer/packages/winterhuan/writer
dsh --profile creative-dev --dump-config | rg '^# == @winterhuan|name: .@winterhuan'
dsh --profile creative-dev --host 127.0.0.1 --port 0 --no-open
```

链接安装使用 `link:`；修改源码后重新构建，停止并重启该开发进程，再硬刷新浏览器。技能查看器需在 `plugins/dsh-skills-viewer` 构建并链接 `plugin/`，Host 与 Client 单次安装。移除使用 `dsh plugin --profile creative-dev remove @winterhuan/dsh-writer`。

隔离验证可为每条 DSH 命令指定独立 `DSH_HOME`。首次打开浏览器前，将临时 profile 的 `workspace-controller.config.documentsDirectory` 指向临时目录，避免使用默认 Documents 工作区。UI 行为必须在真实 DSH 中验证，单元测试不能代替浏览器验收。Antfarm 开发使用 Web 的 Agent Preset 组合；DSH `0.2.2-rc.1` 没有 TUI 应用入口，终端验收使用 Headless；默认 headless 缺少原生 Agent Preset 注册器与 parent preset，自定义 headless 必须先补齐两者，不能仅添加 Antfarm bundle。

现有 Instabox 使用独立 `cloud-preview` profile；环境、登录入口、服务操作及 HTTPS 代理配置见[云端 DSH 预览参考](docs/user/cloud-dsh-preview.zh.md)。

本机日常 Web 由 `~/.dsh/bin/dsh-webctl` 管理；重启会轮换 token。launchd 不继承终端代理，`~/.dsh/.env` 按 [DSH 代理指南](upstream/docs/user/guide/network-proxy.zh.md)设置 HTTP 代理；「发现」详情需能访问 `raw.githubusercontent.com`。不要用裸 npm 包名的 `plugin-update` 覆盖 Git 安装。

## 6. 依赖策略

现役插件的 DSH 依赖固定为 `0.2.2-rc.1`，子模块参考版本为 `dsh-v0.2.2-rc.1`。配套范围为 `@deepseek-ai/cordis ~4.1.0`、`cordis-plugin-{group,include,loader} ~1.1.0`、`@deepseek-ai/schemastery ~3.19.0`。升级时同步核对所有子模块的依赖、锁文件、补丁与上游标签，不使用 `*` 或 `latest`。

Antfarm `0.3.3` 的依赖及生成 Remote 使用精确 DSH `0.2.2-rc.1`。包版本独立管理，Git 发布包包含预构建产物并免于安装时运行构建脚本。职责、宿主前提和验证范围见 [Antfarm 子系统](docs/subsystems/antfarm.zh.md)。

新使用 `ctx.remote.<命名空间>` 时，将提供它的 DSH 包加入该插件的 `devDependencies`，并添加 `import type {} from '<包>/remote'`。外部 Remote 仍需由客户端显式挂载。

## 7. 实际遇到的问题与解决方案

17 个迁移问题及原因保存在 [HANDOFF-problems.md](HANDOFF-problems.md)。原 monorepo 的完整构建说明、历史验证与迁移前布局保存在 [归档交接](archive/docs/monorepo/HANDOFF.md)，只用于历史核对；当前源码路径以第 2 节为准。

## 8. 从上游复制的文件及本地改动


构建、客户端测试辅助文件与客户端环境类型仅在各插件子模块维护；下表路径相对子模块根目录，上游版本为 `dsh-v0.2.2-rc.1`。`clientBundle()` 接收包目录，各插件的 tsdown 配置传入包根目录。`scripts/modules/src/assets.ts` 定义包资源媒体类型、导出名、修订号与浏览器引用路径，供客户端构建使用。

| 子模块内文件 | 上游来源 | 本地改动 |
|---|---|---|
| `scripts/tsdown.client.ts` | `packages/client/tsdown.client.ts` | 删除 `optionalStringArray` 的导入并在文件末尾内联；`platform`、`client-build-environment`、`experimental-package-policy`、`bundle-input-isolation` 改为同目录相对导入；`REPOSITORY_ROOT` 用 `new URL('..', import.meta.url)`；新增 `./modules/src/assets.ts` 导入 |
| `scripts/modules/src/assets.ts` | `packages/client/modules/src/assets.ts` | 无（模块源码，上游无首行标注） |
| `scripts/client-build-environment.ts` | `scripts/client-build-environment.ts` | `CLIENT_ARTIFACT_PATTERNS` 删掉 `apps/web/dist/**/*`；新增 `packages/*/*/lib/assets/**/*` 模式 |
| `scripts/bundle-input-isolation.ts` | `scripts/bundle-input-isolation.ts` | 仅首行标注 |
| `scripts/experimental-package-policy.ts` | `scripts/experimental-package-policy.ts` | 仅首行标注（上游新增 cua-bundle、action-cards、creation-recommendations 等映射） |
| `scripts/platform.ts` | `packages/client/web/src/platform.ts` | 仅首行标注 |
| `scripts/vitest-shared.ts` | `vitest.shared.ts` | 仅首行标注 |
| `scripts/test-dom-environment.ts` | `scripts/test-dom-environment.ts` | 仅首行标注 |
| `types/client-build-environment/index.d.ts` | `scripts/types/client-build-environment/index.d.ts` | 仅首行标注 |

Antfarm 仅复制上表中的 `scripts/tsdown.client.ts`、`scripts/modules/src/assets.ts`、`scripts/client-build-environment.ts`、`scripts/bundle-input-isolation.ts`、`scripts/experimental-package-policy.ts` 与 `scripts/platform.ts`，与 dsh-writer 对应文件逐字一致，沿用表内来源和本地差异。它不复制客户端测试辅助文件或环境类型目录。`scripts/generate-remote.ts` 是 Antfarm 自有的单包生成适配：临时建立生成器所需的 workspace，输出包内 Typert 产物，不修改上游源码。

`scripts/verify-concrete-terms.ts` 保留上游扫描逻辑，并增加 `archive/` 排除项；归档快照（原 `webnovel-writer/` 外部项目与四个创作包）不纳入本仓库的措辞门禁。

`scripts/verify-package-readme-model-experience.ts` 的 Skill Viewer 允许列表路径使用 `plugins/dsh-skills-viewer/packages/winterhuan/{skill-viewer,ui-skill-viewer}`。

参照上游写的配置文件（没有首行标注）：

| 文件归属与路径 | 参照的上游文件 | 差异 |
|---|---|---|
| 父仓库与子模块的 `tsconfig.base.json` | `tsconfig.base.json` | 去掉 `paths` |
| 子模块的 `tsconfig.base.client.json` | `tsconfig.base.client.json` | `typeRoots` 指向子模块的 `./types` |

对比上游当前版本：

```sh
diff <(git -C plugins/dsh-writer/upstream show HEAD:packages/client/tsdown.client.ts) plugins/dsh-writer/scripts/tsdown.client.ts
diff <(git -C plugins/dsh-writer/upstream show HEAD:scripts/client-build-environment.ts) plugins/dsh-writer/scripts/client-build-environment.ts
```

### `.agents/skills`（与上游同名的 skill）

`.agents/skills/` 下 11 个与上游同名的 skill 也是拷贝。链接指向本仓库已有的文档时保留本仓库路径；指向上游独有的文档、包或笔记时加 `upstream/` 前缀。比对方式：

```sh
tmp=$(mktemp -d) && git -C upstream archive dsh-v0.2.2-rc.1 .agents/skills | tar -x -C "$tmp" \
  && diff -r "$tmp/.agents/skills" .agents/skills
```

除链接以外的本地改动：

| skill | 本地改动 |
|---|---|
| `agent-experience`、`dsh-ci-test-reliability`、`dsh-prose-standard`、`dsh-translate-docs`、`dsh-trim-cot-leakage` | 仅链接前缀（`agent-experience` 在上游是符号链接，这里是普通文件） |
| `dsh-archive-agent-notes`、`dsh-doc/references/review.md`、`dsh-find-simplifications` | 删掉本仓库没有的 `pnpm run lint`；`dsh-find-simplifications` 另加 invariants 补充说明 |
| `dsh-client-ui-ux` | 去掉引用本仓库没有的 `dsh-error-handling`、`dsh-responsive-ui` 的段落 |
| `dsh-doc` | 去掉网站发布，以及 `persistence-release`、`persistence-format`、`upgrade-guide` 三个本仓库没有的模板及其章节 |
| `dsh-code-review`、`dsh-pre-push-checks` | 按本仓库无 CI、无 PR 栈、无 lint 的流程改写检查步骤；`dsh-code-review` 另保留「DSH 不再发布 `dsh-invariants`」一条 |

### 父仓库检查脚本的子模块适配

| 文件 | 本地改动 |
|---|---|
| `scripts/verify-md-wrap.ts`、`scripts/verify-md-links.ts` | 扫描子模块根 README 和 `plugins/*/packages/*/*` 下的包文档 |
| `scripts/verify-doc-refs.ts` | 通过统一包发现扫描根 `src` 与嵌套包源码中的父仓库文档引用 |
| `scripts/verify-package-readme-summaries.ts`、`scripts/verify-package-readme-limitations.ts`、`scripts/verify-package-readme-model-experience.ts` | 包发现覆盖子模块根 `src` 与嵌套包；Antfarm 采用包含模型可见内容、Token 与 KV Cache 影响的结构化模型体验 |
| `scripts/verify-client-ui-i18n.ts`、`scripts/verify-export-jsdoc.ts` | 通过统一包发现检查子模块根 `src` 与嵌套包的客户端文案、导出声明 |
| `scripts/verify-concrete-terms.ts`、`scripts/verify-no-unknown-casts.ts`、`scripts/verify-repository-references.ts`、`scripts/verify-public-repository-links.ts` | 使用 `plugin-workspaces.ts` 合并父仓库与插件 Git 文件清单，排除插件发布产物 |
| `scripts/translation-pairing-record.ts` | 在子模块自身的仓库路径下计算双语记录，保持独立检出与父仓库检查一致 |
| `scripts/translation-pairing-git.ts` | 暂存区检查读取子模块固定提交中的文档，保持父仓库链接与双语记录一致 |
| `scripts/translation-links.ts` | 结构检查识别插件 README 指向父仓库已存在双语文档的 GitHub 链接，保留语言、分支和锚点语义 |
| `scripts/translation-pairing.ts` | 排除嵌套 `upstream/`、生成的 `plugin/` 和本地市场检出，纳入子模块 README、DESIGN 与 PARITY 双语对 |

`plugin-workspaces.ts`、`run-plugins.ts` 和 `run-checks.ts` 为本仓库自有脚本；统一包发现包含实际有 `src` 的子模块根清单以及嵌套包，排除 workspace 空根。检查和批量命令在插件子模块未初始化时失败，不能以空扫描通过。

## 9. 升级 DSH 版本清单

逐个插件更新依赖、锁文件、typert 补丁和嵌套上游引用，按其 README 完成类型检查、构建和测试，并在真实 DSH 验证受影响行为。随后更新父仓库的工具依赖、参考上游指针及第 8 节的拷贝记录；子模块提交推送后，再提交父仓库指针。市场兼容声明随正式发布更新。

## 10. 已知限制与待办

- 子模块指针与市场版本分别管理：父仓库可以指向尚未发布的开发提交，日常 DSH 仍使用市场固定提交。
- Git 初始化只检出代码，依赖安装需分别执行；父仓库检查在插件未初始化时失败。
- `archive/` 和旧本地备份不作为开发来源，也不自动同步。迁移备份中保留先前的未提交工作；恢复时逐项核对，不能整体覆盖子模块。
- 客户端构建的 CSS 类名哈希与注释可能随绝对检出路径变化；搬迁后的纯路径产物差异需单独核对，不能据此判断业务源码变化。
- 父仓库没有 CI；Antfarm 子模块配置 Node 22／24 的 GitHub Actions 检查。浏览器验证仍由提交者在真实 DSH 中完成。

## 11. 排障速查

| 现象 | 处理 |
|---|---|
| 子模块目录为空或批量命令报告未初始化 | 在父仓库执行 `git submodule update --init --recursive` |
| 子模块测试缺依赖或缺上游源码 | 完成递归初始化和 `pnpm run plugins:install` |
| 父仓库只显示子模块 dirty，未列出内部文件 | 进入该子模块查看 Git 状态，先提交子模块，再提交父仓库指针 |
| 本地改动未出现在日常 DSH | 本地开发用独立 profile；日常 profile 需要更新远程发布版本 |
| `Cannot find module .../remote` | 补对应 DSH 包的类型导入，先构建 Host 生成 typert 声明 |
| 市场详情无法连接 | 检查服务进程的代理设置和 `raw.githubusercontent.com` 连通性 |

## 12. 本机环境变更记录

历次发布、版本统一、远程安装、详情连接修复及技能查看器合并记录见 [HANDOFF-changelog.md](HANDOFF-changelog.md)。记录中的 `~/dsh-plugins` 是历史位置；其发布材料与旧仓库副本已移至 `~/.dsh/backups/submodule-migration-20261107-220104/publication-workspace/`，原 monorepo 源码在同级 `monorepo-working-copy/`，另有源码压缩包和迁移前 Git diff。市场检出现位于 `.worktrees/market-site/`。
