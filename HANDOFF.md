# dsh-creative 开发交接

最后更新：2026-10-03。

本文档用于在 `/Users/winter/dsh-creative` 继续开发：说明仓库现状、与 DSH 的集成方式、构建与测试流程、实际遇到的问题和解决方案，以及升级 DSH 时要做的事。

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

本仓库是 DeepSeek Harness（DSH）的外部插件仓库，包含 Creative 工作台与生产子系统、Skill Viewer，以及它们的客户端包。

当前实现是独立的 `@winterhuan` 插件仓库：

- 依赖 npm 上发布的 DSH `0.2.0-rc.2`，像普通第三方插件一样安装到 DSH 里；依赖声明、锁文件与已安装版本一致。
- 不依赖、也不修改上游源码。`upstream/` 子模块只作代码参考，以及给客户端单元测试提供同版本源码（原因见[问题 10](#问题-10单元测试dsh-发布的客户端包在-node-里无法加载)）。
- 9 个包都位于 `@winterhuan` scope 下。
- 包目录采用 `packages/<组>/<包>` 两层布局。

2026-09-30 四领域拆分验证：清理构建产物后 `typecheck`、`build` 通过；全量 59 个文件、577 项测试通过。文档 16 项、规范 3 项通过，归档完整性通过。四个领域均有独立包与侧栏；Creative 聚合页面已移除；通过聚合包安装的小说保存、短剧生产页、视频播放和游戏独立入口在临时 web profile 验证，无页面脚本异常。三个新包的压缩包安装、浏览器检查与 16 项包内资源检查通过；已有设置包尚未发布到 npm，压缩包验证用临时 profile 的 pnpm override 指向它的本地压缩包。游戏此前的独立包、压缩包、聚合与三种模板 Chrome QA 已通过。未修改用户 profile。

2026-09-30 小说技能精简验证：清理构建产物后的 `typecheck`、`build` 通过；全量 59 个文件、575 项测试通过（删除旧脚本 wrapper 的重复轮次）。文档 16 项、规范 3 项及归档完整性通过。临时 web profile 的 Chrome 验证了六个小说技能、每个入口的参考文件预览和空工作台 `/story` 提示，无页面脚本错误。未调用真实模型或外部检测。

2026-10-01 原生专家协作简化验证：删除专用 Role 执行器和固定评审 JSON 校验链，保留专业指令、实际字数哈希及原子追踪事务。清理构建产物后 `typecheck`、`build` 通过，全量 58 个文件、563 项测试通过，文档与规范检查通过。Loader 测试覆盖原生子 Agent 实际读取 Role/参考、Team 冷成员续接、无评审字段提交及旧记录原值保留。临时 DSH web profile 的 Chrome 检查确认原生 Team 成员面板可见，旧 Role 结果格式测试样例可通过通用工具卡查看，无页面脚本错误。使用脚本化模型，未调用真实模型或付费服务；临时服务和浏览器已关闭，未修改用户 profile。

2026-10-01 模型设置增强验证：独立客户端组合包完成本地链接和压缩包安装；`typecheck`、`build`、全量 61 个文件 594 项测试通过，新包 31 项回归测试通过。隔离 DSH 的 Chrome 验证了思考级别参数映射、省略关闭参数、0/1/3 次重试对应 1/2/4 次请求、取消后停止重试、恢复默认、跨窗口冲突、刷新持久化，以及深浅色和窄窗口布局；无页面脚本错误。使用本地模拟接口，未调用付费模型或修改用户 profile。

2026-10-02 模型思考设置批量编辑：模型列表增加配置摘要和待保存标记；支持搜索、勾选、全选当前搜索结果、预览完整参数映射，并将配置复制到所选模型的草稿后统一保存。`typecheck`、`build` 与全量 61 个文件 601 项测试通过，其中包内 38 项测试覆盖自定义及目录模型、筛选范围外的选择保留、独立草稿、取消、放弃修改和批量预览期间的版本冲突。文档 16 项与规范 3 项检查通过；受限环境不能创建 tsx CLI 的 IPC 管道，改用 `node --import tsx` 执行相同校验脚本。用户 `web` profile 已链接本地包，重新构建后需重启 DSH 并刷新。此次真实浏览器验证未完成：隔离 DSH 未就绪，Chrome 启动以 SIGABRT 退出，并报告进程控制 EPERM；不能沿用上一轮浏览器结果确认本次批量界面。

截至 2026-09-29 的验证结果：

| 检查 | 结果 |
|---|---|
| upstream | master 的 `639ed01539`，对应 `dsh-v0.2.0-rc.2`；子模块源码无改动 |
| `pnpm install` | 通过；72 处 DSH 依赖声明和锁文件均为目标版本，typert 补丁已应用 |
| `pnpm install --frozen-lockfile --offline` | 通过，锁文件可复用 |
| `pnpm run typecheck`、`pnpm run build` | 从清理后的构建产物开始通过；游戏空状态修复后再次通过 |
| `pnpm test` | 50 个文件、556 项全部通过，包含游戏空状态的中英文回归用例 |
| `pnpm run doc-sync`、`pnpm run hygiene` | 文档 16 项与代码规范 3 项全部通过，含归档完整性 |
| DSH 0.2.0-rc.2 插件安装 | 临时 profile 的合成配置包含 Creative 的 3 行与 Skill Viewer 的 2 行 |
| 浏览器验证 | Chrome 中加载三个客户端 bundle；技能列表、生产设置保存与重载、小说编辑保存与预览、四种模式及工作区切换、游戏空状态的浅色/深色与键盘操作通过，无页面脚本异常 |

仓库远程为 `git@github.com:winterhuan/dsh-creative.git`。

本次接口核对基于 `dsh-v0.1.7-rc.2..dsh-v0.2.0-rc.2`：

| 插件接入点 | 上游变化与适配结论 |
|---|---|
| 右侧栏 | 内部改由所选会话和已登记的 store 驱动；移除了旧的 `SidebarRightBinding`。插件未使用该内部接口，仍使用 `sidebarRightTabs.register` 与标签自身的 `actions.openTab` |
| 会话输入 | `submit` 增加可选来源参数，`fork` 增加可选回调；现有调用不需要改变 |
| 工具卡片 | 增加限时问答面板接口，现有 `ToolCallViewProps` 保持兼容 |
| Remote、设置与密钥 | 外部 `skillViewer` 仍需自行挂载；生成器仍不识别 npm 协议包，保留补丁；设置 Remote 仍需显式导入类型 |
| 客户端构建工具 | 第 8 节的 7 个上游文件在该版本区间没有变化，保留现有副本和本地适配 |

游戏页在没有项目时显示空状态，并保留鼠标及键盘切换其他模式的入口。

上游新增功能的使用说明由上游维护：[自动化任务](upstream/packages/experimental/schedule-bundle/README.zh.md)默认禁用，[限时提问](upstream/packages/interaction/tool-ask-user/README.zh.md)需显式选择 timed 模式；本次版本适配不改变 Creative 的默认生产流程。

## 2. 仓库结构

```
dsh-creative/
├── packages/                          与上游相同的 packages/<组>/<包> 两层布局
│   ├── creative/
│   │   ├── README.md                  creative 分组说明
│   │   ├── story/                     @winterhuan/dsh-story（Host + Client）
│   │   ├── short-drama/               @winterhuan/dsh-short-drama（Host + Client）
│   │   ├── video-recap/               @winterhuan/dsh-video-recap（Host + Client）
│   │   ├── novel-to-game/             @winterhuan/dsh-novel-to-game（Host + Client）
│   │   └── creative/                  @winterhuan/dsh-creative（安装组合 + Host 兼容）
│   ├── skill/
│   │   └── skill-viewer/              @winterhuan/dsh-skill-viewer（Host，skillViewer Remote）
│   └── client/
│       ├── ui-skill-viewer/           @winterhuan/dsh-client-ui-skill-viewer（Client）
│       ├── ui-settings-creative-produce/  @winterhuan/dsh-client-ui-settings-creative-produce（Client）
│       └── ui-settings-model-options/  @winterhuan/dsh-client-ui-settings-model-options（独立安装，Client）
├── scripts/
│   ├── tsdown.client.ts               客户端 bundle 预设 clientBundle()（上游拷贝，有本地改动）
│   ├── client-build-environment.ts    客户端构建期环境变量记录（上游拷贝，有本地改动）
│   ├── bundle-input-isolation.ts      bundle 输入隔离检查（上游拷贝）
│   ├── platform.ts                    宿主页面共享模块表（上游拷贝）
│   ├── vitest-shared.ts               标准装饰器转换、vitest 进程参数（上游拷贝）
│   ├── test-dom-environment.ts        jsdom 下默认的 ResizeObserver（上游拷贝）
│   └── vitest-upstream-client.ts      仅测试用：从 upstream/ 读取 DSH 客户端源码（本仓库自有）
├── types/client-build-environment/    客户端构建期 process.env 的环境声明（上游拷贝）
├── patches/                           typert 生成器补丁（pnpm patchedDependencies）
├── upstream/                          子模块，固定在 dsh-v0.2.0-rc.2；只读
├── docs/、.agents/                    设计文档和决策记录
├── tsconfig.base.json                 编译选项（取自上游，去掉 paths）
├── tsconfig.base.client.json          浏览器编译选项（DOM、React JSX、构建期环境类型）
├── tsconfig.host.json                 Host 编译面聚合：skill-viewer、creative host
├── tsconfig.client.json               Client 编译面聚合：ui-skill-viewer、ui-settings-creative-produce、creative client
├── tsconfig.json                      编辑器入口，引用上面两个聚合
├── tsdown.config.ts                   Host 面打包 + typert 生成；Client 面交给各包自己的 tsdown.config.ts
├── vitest.config.ts
├── pnpm-workspace.yaml                packages/*/*、allowBuilds、patchedDependencies
└── package.json                       工具链与测试依赖
```

包之间的关系：

- `creative` 依赖四个领域包和已有生产设置页；四个领域包均可独立安装，不依赖 Creative 或其他业务插件。没有新增公共运行时包。
- `skill-viewer` 的 `dependencies` 包含 `ui-skill-viewer`；`ui-skill-viewer` 的 `devDependencies` 包含 `skill-viewer`，用它的 `/types` 和 `/remote`。这个结构沿用上游，所以 `pnpm install` 会提示 `There are cyclic workspace dependencies`，这是预期的。
- `creative` 仅构建 Host 兼容入口；四个领域包各自构建 Host 和 Client，聚合包不导出 `/client`。
- 包路径固定为（`packages/creative/creative`、`packages/skill/skill-viewer`、`packages/client/*`），文档和构建脚本按这些路径工作。

## 3. 与 DSH 的集成方式

### Bundle 与插件行

`creative` 和 `skill-viewer` 的 `package.json` 声明 `dsh.bundle.patch: ./cordis.patch.yml`，安装到 profile 后，DSH 按下面的行加载插件：

| bundle | 行 id | 加载的模块 | 作用 |
|---|---|---|---|
| creative / story | `story` | `@winterhuan/dsh-story` | 小说技能、角色、写作检查与编辑器 |
| creative / short-drama | `short-drama` | `@winterhuan/dsh-short-drama` | 短剧技能、确认生产与剧集工作台 |
| creative / video-recap | `video-recap` | `@winterhuan/dsh-video-recap` | 解说技能、视频交付与工作台 |
| creative / novel-to-game | `novel-to-game` | `@winterhuan/dsh-novel-to-game` | 游戏技能、QA、路由与独立侧边栏 |
| creative | `creative` | `@winterhuan/dsh-creative` | 主插件（`lib/index.js`） |
| creative | `creative-produce` | `@winterhuan/dsh-creative/produce` | Loader 行，它的 Config 声明就是 `creative-produce` 设置命名空间（`lib/produce-settings-entry.js`） |
| creative | `ui-settings-creative-produce` | `@winterhuan/dsh-client-ui-settings-creative-produce` | 设置页的 Node 入口，负责登记浏览器 bundle |
| skill-viewer | `skill-viewer` | `@winterhuan/dsh-skill-viewer` | Host 服务 `SkillViewerCatalog`（继承 `TypertRemoteService`，Remote 命名空间 `skillViewer`） |
| skill-viewer | `ui-skill-viewer` | `@winterhuan/dsh-client-ui-skill-viewer` | Skill Viewer 面板的 Node 入口 |

### 客户端包

客户端包在 `package.json` 里声明 `dsh.client`：`platform: web`，`inject` 列出运行时由宿主提供、打包时外置的 DSH 客户端模块。

`lib/client.js` 是给 DSH 前端模块加载器用的闭包工厂格式（调用 `window.__ModuleLoader__.load`），不是普通 ES 模块。web 服务器用 `plugins/??<a>/client.js,<b>/client.js` 这样的合并 URL 提供它们。

### Remote

DSH 内置的 `@deepseek-ai/dsh-api-remotes` 只挂载内置包的 Remote。外部插件必须自己挂：`packages/client/ui-skill-viewer/src/client/mount.ts` 调用 `ctx.remote.$mount(skillViewerRemote)`。`skillViewerRemote` 和 `ClientRemote.skillViewer` 的类型合并都来自 typert 生成的 `@winterhuan/dsh-skill-viewer/remote`。

DSH 内置 `api-remotes` 只挂载内置包的 Remote，外部插件不能依赖它自动挂载自己的 Remote。

### 设置与密钥

`ui-settings-creative-produce` 编辑 `creative-produce` 设置命名空间。6 个提供商密钥通过 `ctx.remote.credentials` 写入；这个 Remote 由 DSH 内置的 `@deepseek-ai/dsh-api-settings-controller` 提供，由 `api-remotes` 挂载，插件只需要它的类型（见[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)）。

### 模型设置增强

`ui-settings-model-options` 是独立安装的客户端组合包，通过 DSH 模型页的提供方卡片插槽编辑模型思考能力和提供方重试次数。它复用内置设置、模型目录和重试运行时，不随 Creative 聚合包安装。安装与配置见[包说明](packages/client/ui-settings-model-options/README.zh.md)。

### 小说技能与资源

小说包提供 `story`、`story-write`、`story-analyze`、`story-review`、`story-polish`、`story-cover` 六个入口。长短篇流程按需读取；已有工程直接继续，原始文本接入不要求先拆全书。普通润色不调用朱雀，检测需要用户明确请求。

六个技能的 `resourceBase` 均指向 `knowledge/story`，参考资料集中在 `references/`、脚本在 `scripts/`，DSH 原生 `read` 负责模型侧读取。专业 Agent 由原生 subagent 或 Team 工具创建，委派任务提供 Role 文件绝对路径和领域资源根，再由子 Agent 原生读取。章节提交不要求评审 JSON；旧评审记录只保留为历史数据，不再投影到续写。脚本移动后需保留 `storyctl.py` 与 `wordcount_core.py`、`tracking_commit.py` 同目录；`produce-tool.ts` 和 `sync-video-runtime.py` 使用新的脚本位置。

2026-10-03 原生小说 workflow：新增按需加载的单章模板，由 `story-write` 在明确选择时顶层调用 DSH 原生 `workflow`，完成细纲检查与必要补建、场景计划、写作、独立审稿、最多两轮修订和提交验证。`chapter check` 返回正文/细纲哈希，提交支持可选预期哈希并在追踪锁内校验；普通审稿与无审稿记录的提交保持可用。具体入口、范围、恢复及 token 成本见[小说包说明](packages/creative/story/README.zh.md)。决策记录已转为 implemented，原生专家协作决策仅增加 workflow 局部结构化路由例外。

验证：`typecheck`、`build`、全量 64 文件 628 项测试通过；补充用例后相关 3 文件 37 项及新增测试的独立 TypeScript 检查通过，Python 版本校验夹具含 9 项回归。文档 16 项和规范 3 项检查通过。原生模型循环与工具运行时测试覆盖五个独立子会话的写作—审稿—修订—再审稿—提交、真实脚本与追踪、待裁定返回、无效结构化响应及取消清理。使用脚本化模型，未调用付费服务，不据此宣称文学质量提升。

准备阶段与失败诊断修复验证：相关 3 文件 50 项回归及新增测试的严格 TypeScript 检查通过。原生运行时使用脚本化模型，覆盖 Prepare 内补建/复用细纲、交接场景计划、缺失规划时停止、无原批准细纲时保留已有正文，以及模型报错或未调用 `structured_output` 的诊断；成功修订流程包含六个子会话。以下五成员浏览器记录来自加入 Prepare 前，本轮未重做浏览器或真实模型验证。

隔离 `DSH_HOME` 完成本地链接和压缩包独立安装，模板、调用说明、三个 Python 脚本及写手 Role 六项包内资源检查通过。已有设置包未发布到 npm，压缩包安装在临时 profile 的 `pnpm-workspace.yaml` 配置本地压缩包 override；pnpm 11 不读取 package.json 中的 pnpm.overrides。Chrome 中原生 DSH 的历史运行展示与刷新验证通过：已提交运行显示 5 个已完成成员，待作者裁定显示 2 个已完成成员，早期取消显示 cancelled；没有页面脚本异常。历史夹具采用未压缩 Session，临时 profile 显式配置相同编码，并使用浏览器目录选择器；路径按 macOS 实际路径统一。浏览器验证针对历史呈现，实时子会话导航与真实模型文学判断未验证。临时服务和浏览器均已关闭，用户 profile 未改动。

### 短剧、游戏与视频技能资源

短剧提供五个任务入口，视频解说提供两个；它们的原生资源根分别为 `knowledge/drama` 和 `knowledge/video-recap`。普通参考集中在各自的 `references/`，运行脚本仍在 `skills/<资源组>/scripts/`；仅含运行资源的目录不注册为技能。游戏提供四个入口，资源仍跟随各技能，构建模板和 QA 脚本路径不变。具体任务划分见各包 README。

迁移参考时要同时检查 Markdown 链接、模型读取路径和脚本生成的提示；保持 `sync-video-runtime.py` 管理的副本与来源一致。退役的技能名没有注册别名，脚本目录名不代表可调用技能。

### 小说项目发现

小说工作台识别当前会话工作目录及其下一层子目录中的小说；文件列表、读取、保存及聊天文件跳转使用相同的项目范围。更深层项目需打开其父目录或项目本身。创作目录内部的分卷仍递归展示，具体结构见[小说包说明](packages/creative/story/README.zh.md)。

2026-10-02 验证：`typecheck`、`build` 和全量 62 个文件 610 项测试通过，其中小说包 63 项；文档与规范 19 项检查通过。对 `shenji` 实际目录的只读接口检查识别到 `神机诸天录` 的 55 个文件，其中正文 10 个，追踪元数据无读取错误。独立临时 profile 的离线安装成功，但 DSH 启动报告未完成的顶层 await 并以状态 13 退出，未能完成本次浏览器验证；用户 profile 未改动。

### 从 Chat 打开文件

小说和短剧通过各自的 `src/client/file-redirect.tsx` 注册文件跳转，使用 `story-file`、`drama-file` 标签类型。它们匹配 `dsh-resource://file/session/**`，只接管对应领域支持的文件，再通过 `params.creativeFile` 打开 `story` 或 `short-drama` 页面。其他文件交给 DSH 自带预览；Creative 聚合包不注册文件跳转或页面。

## 4. 开发命令与构建流程

### 前置条件

- Node `^22.19.0 || >=24`（本机是 nvm 管理的 v22.22.2）。
- pnpm 11.7.0（`package.json` 的 `packageManager` 字段，通过 corepack）。
- `python3`：`packages/creative/creative/tests/knowledge-*.spec.ts` 会执行 `knowledge/` 下的 Python 脚本。
- 子模块已检出：只有客户端单元测试需要，构建和类型检查不需要。

### 命令

```sh
git submodule update --init   # 跑客户端单元测试前需要
pnpm install
pnpm run typecheck            # = build:host，再 tsc -b tsconfig.client.json
pnpm run build                # = build:host，再 build:client
pnpm test                     # vitest run
pnpm run clean                # 删除 packages/*/*/lib
```

### 构建顺序

1. `build:host`：
   - `tsc -b tsconfig.host.json` 编译 skill-viewer 和 creative 的 host 面，输出 `lib/types/*.js` 与 `*.d.ts`。
   - `tsdown --env.DSH_BUILD_FACE host`：根 `tsdown.config.ts` 把各包的 `lib/types/index.js` 打成 `lib/index.js`，并由 `typertPlugin({ mode: 'workspace', faces: ['host'] })` 生成 skill-viewer 的 `lib/typert.host.{js,d.ts}` 和 `lib/typert.remote-client.{js,d.ts}`。
2. `build:client`：
   - `tsc -b tsconfig.client.json` 编译四个领域工作台和三个独立 UI 包的客户端编译面。`ui-skill-viewer` 要用第 1 步生成的 `@winterhuan/dsh-skill-viewer/remote` 声明，所以 client 面必须排在 host 构建之后，`typecheck` 也因此先跑 `build:host`。
   - `tsdown --env.DSH_BUILD_FACE client`：客户端包各自的 `tsdown.config.ts` 调用 `scripts/tsdown.client.ts` 的 `clientBundle()`，产出 Node 入口和浏览器 bundle。

构建产物：

| 包 | 产物 |
|---|---|
| creative | `lib/index.js`、`lib/produce-settings-entry.js` |
| story / short-drama / video-recap | `lib/index.js`、`lib/produce-settings-entry.js`、`lib/client.js` |
| novel-to-game | `lib/index.js`、`lib/client.js` |
| skill-viewer | `lib/index.js`、`lib/typert.host.{js,d.ts}`、`lib/typert.remote-client.{js,d.ts}` |
| ui-skill-viewer | `lib/index.js`、`lib/client.js` |
| ui-settings-creative-produce / ui-settings-model-options | `lib/index.js`、`lib/client.js` |

`lib/`、`*.tsbuildinfo` 和 `.dsh-build/`（`client-build-environment.ts` 的构建记录）都被 git 忽略。`dsh plugin add` 是链接安装，安装和调试前必须先 build。

构建时 tsdown 会提示 `Detected dependencies in bundle`（`dsh-util-values`、`dsh-util-crypto`、`dsh-util-workspace-path`、`zod`）。这是预期的：`clientBundle()` 会把无状态工具内联进 bundle。

### 测试如何解析依赖

- Host 测试直接使用 npm 上的 DSH 包。
- 客户端测试（`*.client.spec.ts(x)`）通过 `@vitest-environment jsdom` 注释选择 jsdom，并依赖两项配置：
  - `scripts/vitest-upstream-client.ts`：把 `@deepseek-ai/<包>/client` 和 `@deepseek-ai/<包>/src/*` 解析到 `upstream/` 里的同版本源码；这些源码里的裸导入通过 pnpm 的隐藏提升目录 `node_modules/.pnpm/node_modules` 解析，从而与插件包使用的 npm 副本共享同一个模块实例。
  - `vitest.config.ts` 的 `server.deps.inline: [/@deepseek-ai\/dsh-client-/]`：让 Vite 而不是 Node 处理 DSH 客户端库，这样它们导入的 CSS 和 `src/` 子路径才能被解析。
- 测试输出里的 `An error occurred while trying to read the map file at index.js.map` 是无害警告：发布的包没有带 source map。

## 5. 在 DSH 中安装、调试和移除

下面的步骤已在 DSH `0.2.0-rc.2` 的隔离 `DSH_HOME` 中验证。安装使用链接指向本仓库已构建的包。

```sh
# 使用已安装的 DSH 0.2.0-rc.2
cd ~/dsh-creative && pnpm run build

# 从 web 模板创建 profile，--dump-config 使它只创建、不启动
dsh --profile creative --from-default-profile web --dump-config > /dev/null
dsh plugin --profile creative add ~/dsh-creative/packages/creative/creative
dsh plugin --profile creative add ~/dsh-creative/packages/skill/skill-viewer

# 确认合成配置里有两层 @winterhuan
dsh --profile creative --dump-config | grep -E '^# == @winterhuan|name: .@winterhuan'

dsh --profile creative --host 127.0.0.1 --port 0 --no-open   # 随机端口，终端打印带 token 的地址
```

注意事项：

- 必须先从 web 模板创建 profile。profile 不存在时，第一次 `dsh plugin add` 会建一个只有 `@deepseek-ai/dsh-base` 的 profile，没有 web 应用。
- `dsh plugin add <路径>` 用 `link:` 安装。改代码后 `pnpm run build`，再重启 dsh 即可生效。
- 想不碰 `~/.dsh` 做隔离测试，就给每条命令加上 `DSH_HOME=/tmp/<目录>`。
- 确认浏览器 bundle 已加载：页面 HTML 的 `plugins/??...` 列表里应有 `@winterhuan/dsh-creative/client.js`、`@winterhuan/dsh-client-ui-skill-viewer/client.js` 和 `@winterhuan/dsh-client-ui-settings-creative-produce/client.js`。
- 用 curl 检查本地服务时：本机设置了 SOCKS 形式的 `all_proxy`，curl 访问 127.0.0.1 也会走代理，需要加 `--noproxy '*'`。token 地址会先 303 跳转到 `./`，还需要 `-L` 和 cookie（`-c`/`-b`）。
- 移除：

  ```sh
  dsh plugin --profile creative remove @winterhuan/dsh-creative
  dsh plugin --profile creative remove @winterhuan/dsh-skill-viewer
  ```

## 6. 依赖策略

- **DSH 包**：dependencies、peerDependencies、devDependencies 里一律写精确版本 `0.2.0-rc.2`。不要写 `*` 或 `latest`，原因见[问题 2](#问题-2pnpm-install-报-deepseek-aidsh-type-meta-404)。
- **cordis 系列**：`@deepseek-ai/cordis` 写 `~4.0.4`，`cordis-plugin-loader` 写 `~1.0.5`，`cordis-plugin-include` 写 `~1.0.9`，`schemastery` 写 `~3.18.4`，与 DSH `0.2.0-rc.2` 声明的范围一致。
- **分类**：沿用上游的分类，上游已用 `package-dependency-policy` 检查过。
  - 需要与宿主共享实例的 DSH 包同时放进 `peerDependencies` 和 `devDependencies`。运行时 peer 由正在运行的 dsh 安装提供，devDependencies 只给类型检查和测试用。
  - 无状态工具放 `dependencies`。这是 DSH 发布文档（`upstream/docs/user/develop/basic/publish.md`）的规则。
- **仓库内部包**之间用 `workspace:*`。
- **新发布版本**：pnpm 11 为本次选定的 89 个 DSH 包自动记录了精确到 `0.2.0-rc.2` 的 `minimumReleaseAgeExclude`；该列表不豁免其他版本或其他包。
- **根 `package.json` 的 devDependencies** 分三类：
  1. 工具链：`typescript` ^6.0.3、`tsdown` ^0.22.2、`vitest` ^4.1.8、`jsdom` 29.1.1、`lightningcss`、`@types/node`、`@testing-library/dom`、`@testing-library/react`，以及 `@deepseek-ai/dsh-typert-generator`。
  2. DSH 平台模块在 Node 里要用、却没有声明的依赖（浏览器里由 web 前端打包提供）：
     - `dsh-client-store` 需要 `zustand`、`immer`。
     - `dsh-client-ui-primitives` 需要 `clsx`、`simple-icons`、`react`、`react-dom`、`katex`、`shiki`、`@shikijs/langs`、`anser`、`diff`、`mdast-util-*`、`micromark-*`，以及 `@deepseek-ai/dsh-util-code-language` 和 `@deepseek-ai/dsh-util-workspace-path`。
  3. 客户端测试从 `upstream/` 加载 DSH 客户端源码时用到的第三方库：`lexical` 与 `@lexical/*`、`@tanstack/react-virtual`、`use-sync-external-store`、`@js-temporal/polyfill`、`picomatch`、`dompurify`、`fflate`、`mime-types`。

  这些版本都取自上游对应的 `package.json`，查法：`git -C upstream grep -h '"<包名>"' HEAD -- '*package.json'`。

## 7. 实际遇到的问题与解决方案

### 问题 1：typecheck 报几百个 upstream 包的错误

- **现象**：`pnpm run typecheck` 报 `upstream/packages/api/*` 等上游包的错误，例如 `Cannot find module '@deepseek-ai/dsh-api-job-controller/remote'`、`Property 'job' does not exist on type 'ClientRemote'`。
- **原因**：最初的方案把 upstream 的所有包加进 pnpm workspace，tsconfig 用 project references 和 `paths` 指向上游源码。上游的 `/remote` 模块是 typert 在构建时生成的产物，源码里没有，上游没有完整构建时这些源码就编译不过。这样也等于把上游代码当成本仓库的一部分来编译。
- **解决**：改为依赖 npm 上发布的 DSH 0.1.7-rc.2。tsconfig 继承本仓库的 `tsconfig.base*.json`，不引用 upstream 的任何项目，`@deepseek-ai/*` 通过 `node_modules` 解析到发布包的 `lib/types/*.d.ts`，并开启 `skipLibCheck`。pnpm workspace 只包含 `packages/*/*`。

### 问题 2：`pnpm install` 报 `@deepseek-ai/dsh-type-meta` 404

- **现象**：`ERR_PNPM_FETCH_404 ... @deepseek-ai/dsh-type-meta`，出错位置在 `@deepseek-ai/dsh-typert-registry@0.0.1-rc.1` 或 `@deepseek-ai/dsh-api-remotes@0.0.1-rc.1` 的依赖里。
- **原因**：依赖版本写成了 `*`。DSH 各包在 npm 上的 `latest` 标签停在很早的 `0.0.1-rc.1`，它依赖从未发布的 `dsh-type-meta`。当前版本在 `next` 标签上（查法：`npm view @deepseek-ai/dsh-session dist-tags`）。
- **解决**：所有 DSH 包固定为精确版本 `0.1.7-rc.2`。

### 问题 3：误操作 upstream 子模块

- **经过**：迁移过程中曾在子模块里 `git checkout creative`，又 `rm -rf upstream` 后重新初始化，子模块一度停在 `1b9dc03e1c`（包含 creative 代码本身的提交）。
- **解决**：恢复到 `dsh-v0.1.7-rc.2`（`477b4f4205`）并记录进提交；`.gitmodules` 指向 `git@github.com:deepseek-ai/deepseek-harness.git`。子模块的 git 目录里还有一个 clone 时带来的本地 `creative` 分支，不影响使用。
- **规则**：不修改 `upstream/`，只读取。

### 问题 4：`cp -r` 复制包时陷入 node_modules 符号链接循环

- **现象**：`cp -r packages/skill/skill-viewer ...` 两分钟没结束，输出大量 `directory causes a cycle`，还在目标目录里留下了嵌套的残缺副本。
- **原因**：目标目录已存在，所以被复制到了它的子目录里；同时 macOS 的 `cp -r` 跟随了 pnpm `node_modules` 里的符号链接，在包之间循环。
- **解决**：删除残缺副本。以后从主仓库复制包时排除 `node_modules` 和 `lib`，例如 `rsync -a --exclude node_modules --exclude lib <源>/ <目标>/`，或者用 `git archive`。

### 问题 5：typert 生成器报 `publishes Remote artifacts but has no Remote methods`

- **现象**：`build:host` 里 host 面编译通过，typert 插件报 `TypertAnalysisError: typert(host): @winterhuan/dsh-skill-viewer publishes Remote artifacts but has no Remote methods`。
- **原因**：生成器通过 `FaceAnalyzer.isTypeMetaSymbol()` 识别 `@Remote`、`TypertRemoteService`、`bindTypertRemote`，只接受两种情况：
  - 声明所在文件属于一个名为 `@deepseek-ai/dsh-typert-protocol` 的 workspace 包。workspace 包的登记来自根 `tsconfig.host.json` / `tsconfig.client.json` 引用的、位于 `<根>/packages` 下的项目。
  - 声明位于 `declare module '@deepseek-ai/dsh-typert-protocol'` 块内。

  从 npm 安装时，协议包在 `node_modules` 里，两个条件都不满足，skill-viewer 的 `@Remote` 方法被忽略。这是生成器只考虑 monorepo 场景造成的缺口。
- **解决**：用 `pnpm patch` 加一个判断，复用生成器里已有的 `externalModuleIdentityForFile()`。补丁文件为 `patches/@deepseek-ai__dsh-typert-generator@0.2.0-rc.2.patch`，由 `pnpm-workspace.yaml` 的 `patchedDependencies` 引用：

  ```diff
           if (registration?.name === '@deepseek-ai/dsh-typert-protocol')
               return true;
  +        // Repositories outside the DSH monorepo install the protocol from npm instead of a workspace package.
  +        if (externalModuleIdentityForFile(declaration.getSourceFile().fileName)?.package === '@deepseek-ai/dsh-typert-protocol')
  +            return true;
  ```

- **相关约束**：生成器从 bundle 目录向上查找 `tsconfig.host.json` 来确定 workspace 根，所以根目录必须有 `tsconfig.host.json`，并且它引用的项目必须在 `packages/` 下。
- **建议**：向 DSH 提 issue 或 PR，让生成器原生支持 npm 安装的协议包，之后可以删掉这个补丁。

### 问题 6：客户端类型检查：`ClientRemote` 上没有 `credentials`；找不到 `dsh-agent-preset-registry/types`

- **现象**：
  - `creative-produce-card-controller.ts`：`Property 'credentials' does not exist on type 'ClientRemote'`。
  - `ui-skill-viewer/src/client/mount.ts`：`Cannot find module '@deepseek-ai/dsh-agent-preset-registry/types'`。
- **原因**：发布的 `@deepseek-ai/dsh-api-remotes` 在 `client` 声明里用 `export type {} from '<包>/remote'` 转发各个 Remote 的类型合并，但只把这些包列为自己的 devDependencies。对外部使用者来说这些包根本没安装，类型合并就悄悄丢了（`skipLibCheck` 掩盖了声明文件里的解析错误）。另外 pnpm 严格模式下，未声明的依赖一律解析失败。
- **解决**：
  - `ui-settings-creative-produce` 增加 devDependency `@deepseek-ai/dsh-api-settings-controller`，并在 `creative-produce-card-controller.ts` 里写 `import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'`。
  - `ui-skill-viewer` 增加 devDependency `@deepseek-ai/dsh-agent-preset-registry`。
- **通用规则**：新用到 `ctx.remote.<命名空间>` 时，把提供它的 DSH 包加进该包的 devDependencies，并显式 `import type {} from '<包>/remote'`。

### 问题 7：Skill Viewer 的类型从 `dsh-api-remotes/client` 导入

- **现象**：`Module '"@deepseek-ai/dsh-api-remotes/client"' has no exported member 'SkillViewerEntry'`（以及 `SkillViewerGetValue` 等）。
- **原因**：发布版 `api-remotes` 没有导出外部 Skill Viewer 的类型。
- **解决**：`ui-skill-viewer` 的源码和测试改为从 `@winterhuan/dsh-skill-viewer/types` 导入这些类型；`RemoteResult` 等上游确实导出的类型仍从 `api-remotes/client` 导入。运行时挂载见[第 3 节 Remote](#remote)。

### 问题 8：客户端打包工具没有发布

- **现象**：3 个客户端包的 `tsdown.config.ts` 导入 `upstream/packages/client/tsdown.client.ts` 里的 `clientBundle()`。它负责生成 DSH 模块加载器能加载的 bundle，但没有发布到 npm。
- **解决**：把它和它依赖的上游内部文件复制到 `scripts/`，并做了以下适配（完整清单见[第 8 节](#8-从上游复制的文件及本地改动)）：
  - `optionalStringArray` 在 `@deepseek-ai/dsh-client-modules` 里没有公开导出，内联到 `tsdown.client.ts` 末尾。
  - `platform.ts` 没有任何导入，直接复制。没有改为导入 `@deepseek-ai/dsh-client-web`，因为它的入口会带进浏览器代码。
  - 本仓库的包布局与上游相同（`packages/<组>/<包>`），包路径相关的 glob 保持上游原样。文件位置不同带来的改动：`tsdown.client.ts` 在上游位于 `packages/client/`，这里位于 `scripts/`，所以 `REPOSITORY_ROOT` 改为 `new URL('..', import.meta.url)`，三个上游内部模块改为同目录相对导入；`client-build-environment.ts` 的产物 glob 删掉 `apps/web/dist/**/*`。
  - 浏览器 source map 的前缀 `../../../` 对应 map 的服务地址 `/plugins/<scoped-package>/client.js.map` 的深度，与仓库布局无关，保持上游原样；单层布局时期曾误改为 `../../`。
  - `.dsh-build/` 加入 `.gitignore`。
- **维护**：升级 DSH 时重新同步这些文件，并重新应用上述改动。

### 问题 9：客户端构建期环境类型

- **现象**：客户端 tsconfig 需要 `types: ["client-build-environment"]`，这个类型包只在上游的 `scripts/types/client-build-environment/` 里。
- **解决**：复制到 `types/client-build-environment/index.d.ts`；`tsconfig.base.client.json` 设置 `typeRoots: ["./types", "./node_modules/@types"]`。

### 问题 10：单元测试：DSH 发布的客户端包在 Node 里无法加载

Host 测试一开始就全部通过，失败的都是客户端测试，原因有几层：

| 现象 | 原因 | 解决 |
|---|---|---|
| `Cannot find package 'zustand'`（以及 `immer`、`clsx`、`simple-icons`、`@deepseek-ai/dsh-util-code-language`）imported from `dsh-client-store` / `dsh-client-ui-primitives` 的 `lib/index.js` | 这些平台模块导入第三方库却不声明依赖，浏览器里由 web 前端打包提供 | 加到根 devDependencies：Node 从 `.pnpm` 内的包向上查找时能找到根 `node_modules` |
| `ReferenceError: window is not defined` | 客户端插件的 `./client` 导出是浏览器模块加载器 bundle，一加载就访问 `window.__ModuleLoader__` | 测试专用 Vite 插件 `scripts/vitest-upstream-client.ts`：把 `@deepseek-ai/<包>/client` 解析到 `upstream/` 的同版本源码 |
| `Cannot find module .../dsh-client-ui-renderer/src/client/bind.ts imported from .../dsh-client-test-runtime/lib/index.js` | 发布的 `dsh-client-test-runtime@0.1.7-rc.2` 导入了 3 个没有发布的 `src` 文件：`dsh-client-ui-renderer/src/client/bind.ts`、`scoped-slots.tsx`，以及 `dsh-api-session-controller/src/client/scope.ts` | 同一个插件把 `@deepseek-ai/<包>/src/*` 解析到 `upstream/`；再用 `server.deps.inline` 让 Vite 处理 test-runtime，否则 Node 直接加载时根本不经过 Vite 插件 |
| `TypeError: Unknown file extension ".css"`（`dsh-client-ui-primitives/lib/StateDot.module.css`） | 发布包导入自己的 CSS module，Node 不认识 | `server.deps.inline: [/@deepseek-ai\/dsh-client-/]`，交给 Vite 处理 |
| `Cannot find package '@deepseek-ai/dsh-client-ui-conversation/src/client/conversation/assembler.ts'`、`.../dsh-client-ui-sidebar-right/src/client/tab-registry.ts` | 测试直接导入上游 `src` 文件，发布包不带 `src/` | 同一个插件解析到 `upstream/` |
| `Cannot find module '/upstream/packages/llm/token-meter/src/client/index.ts'` | 插件起初假设所有包的 `/client` 源码都在 `src/client/index.ts`，`dsh-token-meter` 不是这样 | 改为读取上游包 `exports['./client'].types`（`./lib/types/X.d.ts`），映射到 `src/X.ts` 或 `src/X.tsx` |
| `Failed to resolve import "@lexical/plain-text"`、`Cannot find package '@tanstack/react-virtual'` 等，来源是 `upstream/packages/client/...` | 上游客户端源码用到的第三方库；上游客户端包的 `package.json` 也没有声明它们 | 加到根 devDependencies，版本取自上游 |

补充说明：

- `vitest-upstream-client.ts` 对来自 `upstream/` 的裸导入，以 `node_modules/.pnpm/node_modules/` 下的一个锚点文件为起点解析，也就是 pnpm 的隐藏提升目录。这样 `react`、`@deepseek-ai/cordis` 等模块和插件包用的是同一份 npm 副本。
- 静态扫描可达的上游源码会把整个包的文件都算进去，结果会拉进 `@fortune-sheet/*`、`exceljs`、`pdfjs-dist`、`xlsx`（CDN tarball）这类重依赖，但测试实际并不需要它们。所以只在测试真正报 `Cannot find package` 时再补依赖。
- 后果：客户端单元测试依赖子模块已检出；构建和类型检查不依赖。

### 问题 11：发布版 DSH 没有 `conversation/open-file`

- **现象**：`sidebar.client.spec.ts` 报 `TypeError: registered.inject is not a function`，并且测试里还在调用 `context.waterfall('conversation/open-file', ...)`。
- **原因**：插件源码已经改用重定向标签类型（`file-redirect.tsx`，见[第 3 节](#从-chat-打开文件)），它会额外注册一个 `sidebar.right.pane.tab` 内容组件。于是 `entries('sidebar.right.pane.tab')[0]` 不再是工作台那一项；而 `conversation/open-file` 事件在发布版 DSH 里根本不存在。
- **解决**：
  - `bench()` 改为按 key 查找工作台项：`entries(...).find(entry => entry.options.key === '@winterhuan/dsh-creative')`。
  - 打开文件相关的断言改为检查 `tabs.get('creative-file')!.canOpen(fileAddressFor(SESSION_ID, '/workspace', path))`：Creative 文件返回 true，`README.md` 和其它工作区路径返回 false。
  - 卸载测试额外断言 `creative-file` 标签类型已移除。
- **未覆盖**：重定向内容组件（React effect 里的 `openTab(..., { replaceTab: true })`）需要真实渲染，单元测试没有覆盖，需要在浏览器里手动验证。

### 问题 12：包改名为 `@winterhuan/*`

- 改名涉及：4 个 `package.json` 的 `name` 和相互依赖，两个 `cordis.patch.yml`，源码里的运行时 id（例如 `workbench.tsx` 的 `WORKBENCH_ID`、`file-redirect.tsx` 的 `REDIRECT_ID`、`skill-viewer/src/index.ts`），3 个 `tsdown.config.ts` 的 `clientBundle()` id，测试与 `tests/fixtures/headless/cordis.yml`，以及 README 和 `docs/subsystems/creative*.md`。
- 替换时用精确的包名匹配，避免误伤 `@deepseek-ai/dsh-skill` 这类前缀相同的上游包。
- 没有验证过旧会话或旧布局是否记录过旧 id（`@deepseek-ai/dsh-creative`）。

### 问题 13：不属于外部插件的 DSH 内置改动

下列 DSH 内置接线不属于外部插件，当前仓库不包含这些改动：

| 上游改动 | 不需要的原因 |
|---|---|
| `apps/cli/package.json` 依赖 creative；`app-boot/src/profile.ts` 的 web 模板加入 creative bundle；`bundle/web-app` 增加 skill-viewer 和设置页的行 | 这些是做成内置功能的接线；外部插件通过 `dsh plugin add` 和自己的 `cordis.patch.yml` 完成 |
| `api/remotes` 挂载 skillViewer 并转发其类型 | 插件在 `mount.ts` 里自己挂载（[问题 7](#问题-7skill-viewer-的类型从-dsh-api-remotesclient-导入)） |
| `ui-chat` 的 `conversation/open-file` waterfall | 发布版 DSH 不提供该事件；插件使用重定向标签类型（见[问题 11](#问题-11发布版-dsh-没有-conversationopen-file)） |
| `ui-tool` 的 `slots.ts` | 只加了一段 JSDoc 示例 |
| `system-prompt` 的 `FIRST_PARTY_SECTION_ORDER` 别名 | 插件没有使用 |
| `dsh-tools` 的 `TOOL_RUNTIME_SCHEDULER` 改为 `Symbol.for` | 只影响源码启动时混合加载源码和构建产物的宿主；插件通过 peer 共享宿主的 `dsh-tools` |
| `tool-cordis/api-catalog.ts`、`cordis-client-runner/slot-catalog.ts` | 内置包的目录，与外部插件无关 |
| `test-support/session-snapshot` 的 `production-jobs.ts` 与 creative 快照、web e2e | 上游测试设施，**没有迁移**，见[第 10 节](#10-已知限制与待办) |

### 问题 14：本机环境问题

- shell 里的 `ls` 是长格式别名，脚本里拼路径时要用 `command ls`，或直接用 glob。
- 环境变量里有 SOCKS 形式的 `all_proxy`：dsh 启动时会打印一条不支持的警告，不影响运行；curl 访问本地服务需要 `--noproxy '*'`。
- 全局 dsh 原来是 0.1.5-rc.3，比插件目标版本旧，已换成 0.1.7-rc.2（见[第 12 节](#12-本机环境变更记录)）。

## 8. 从上游复制的文件及本地改动

下面 7 个文件的第一行记录原始复制版本 `dsh-v0.1.7-rc.2`。已比较该版本到 `dsh-v0.2.0-rc.2` 的对应上游文件，没有变化，因此保留复制版本标注和现有本地改动。

| 本仓库文件 | 上游来源 | 本地改动 |
|---|---|---|
| `scripts/tsdown.client.ts` | `packages/client/tsdown.client.ts` | 删除 `optionalStringArray` 的导入并在文件末尾内联；`platform`、`client-build-environment`、`bundle-input-isolation` 改为同目录相对导入；`REPOSITORY_ROOT` 用 `new URL('..', import.meta.url)` |
| `scripts/client-build-environment.ts` | `scripts/client-build-environment.ts` | `CLIENT_ARTIFACT_PATTERNS` 删掉 `apps/web/dist/**/*` |
| `scripts/bundle-input-isolation.ts` | `scripts/bundle-input-isolation.ts` | 仅首行标注 |
| `scripts/platform.ts` | `packages/client/web/src/platform.ts` | 仅首行标注 |
| `scripts/vitest-shared.ts` | `vitest.shared.ts` | 仅首行标注 |
| `scripts/test-dom-environment.ts` | `scripts/test-dom-environment.ts` | 仅首行标注 |
| `types/client-build-environment/index.d.ts` | `scripts/types/client-build-environment/index.d.ts` | 仅首行标注 |

参照上游写的配置文件（没有首行标注）：

| 本仓库文件 | 参照的上游文件 | 差异 |
|---|---|---|
| `tsconfig.base.json` | `tsconfig.base.json` | 去掉 `paths` |
| `tsconfig.base.client.json` | `tsconfig.base.client.json` | `typeRoots` 指向本仓库的 `./types` |
| `tsdown.config.ts` | `tsdown.config.ts` | `workspace` 为 `packages/*/*`；`typertPlugin` 从 npm 包 `@deepseek-ai/dsh-typert-generator/tsdown` 导入 |

对比上游当前版本：

```sh
diff <(git -C upstream show HEAD:packages/client/tsdown.client.ts) scripts/tsdown.client.ts
diff <(git -C upstream show HEAD:scripts/client-build-environment.ts) scripts/client-build-environment.ts
```

## 9. 升级 DSH 版本清单

1. 确认目标版本：`npm view @deepseek-ai/dsh dist-tags`，下面以 `NEW` 表示。
2. 只更新根及 `packages/*/*/package.json` 的 dependencies、peerDependencies、devDependencies 中 `@deepseek-ai/dsh-*` 的版本，保留各插件自己的 `version`；不要对所有版本字符串作全局替换。
3. 核对 cordis 系列范围：`npm view @deepseek-ai/dsh-session@$NEW peerDependencies`。
4. 移动子模块：

   ```sh
   git -C upstream fetch --tags origin
   git -C upstream checkout --detach dsh-v$NEW
   git add upstream
   ```

5. 按[第 8 节](#8-从上游复制的文件及本地改动)重新同步复制的文件，并重新应用本地改动。
6. 检查 typert 补丁是否还需要：安装新版本后，查看 `node_modules/.pnpm/@deepseek-ai+dsh-typert-generator@$NEW*/node_modules/@deepseek-ai/dsh-typert-generator/lib/types/analyzer.js` 里的 `isTypeMetaSymbol()`。
   - 上游已支持 npm 安装的协议包：删除 `patches/` 下的旧补丁，以及 `pnpm-workspace.yaml` 里对应的 `patchedDependencies` 项。
   - 仍未支持：删除旧版本的补丁项，然后执行 `pnpm patch @deepseek-ai/dsh-typert-generator@$NEW --edit-dir /tmp/typert-patch`，重新加上[问题 5](#问题-5typert-生成器报-publishes-remote-artifacts-but-has-no-remote-methods) 的判断，再 `pnpm patch-commit /tmp/typert-patch`。
7. 检查发布版 `api-remotes` 是否仍只把各 Remote 包列为 devDependencies（[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)），以及 `dsh-client-test-runtime` 是否仍导入未发布的 `src` 文件（[问题 10](#问题-10单元测试dsh-发布的客户端包在-node-里无法加载)）。
8. 依次运行 `pnpm install`、`pnpm run clean`、`pnpm run typecheck`、`pnpm run build`、`pnpm test`，再按[第 5 节](#5-在-dsh-中安装调试和移除)在真实 dsh 里安装验证。
9. 阅读上游的变更，重点看插件依赖的接口：slot `sidebar.right.pane.tab`、`tool.call.toolview`，`sidebarRightTabs.register`，typert 协议（`TypertRemoteService`、`@Remote`、`ctx.remote.$mount`），settings / credentials Remote，Session controller 的客户端接口。

## 10. 已知限制与待办

- **四领域插件拆分**：方案见[Agent Note](.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.zh.md)。四个领域包已提取；游戏包拥有技能、随包原著辅助脚本、`game_qa`、独立 `/novel-to-game` 路由和侧边栏；Creative 保留安装组合和 Host 兼容入口。小说、视频、短剧也已拥有各自技能、工具、路由和侧栏；聚合页面已移除，四个侧栏独立保存状态，不迁移旧聚合草稿。`scripts/sync-video-runtime.py` 同步视频运行时、短剧媒体副本及小说导出/溯源辅助脚本。
- **浏览器验证范围**：新版已验证技能列表、生产设置、小说读写与模式/工作区切换。此次没有调用模型、付费生产或实际媒体生成；从 Chat 打开文件的重定向尚未单独复验，重定向内容组件也没有单元测试覆盖。
- **录制会话快照与 web e2e 未配置**：本仓库目前没有快照或 e2e 测试设施；浏览器内交互仍需手动验证。
- **版本号继承自 DSH**：`creative`、`skill-viewer`、`ui-skill-viewer` 是 `0.1.5-rc.2`，`ui-settings-creative-produce` 是 `0.1.7-rc.2`。发布前改成插件自己的版本号；发布到 npm 的 `@winterhuan` scope 需要对应的 npm 账号。
- **`exports` 里的 `"./src/*"`** 沿用上游写法，但 `files` 不包含 `src`，发布后这个导出无效。
- **README 链接**：
  - 包 README 里的 `../../../upstream/...` 链接在子模块检出时有效，但在 GitHub 网页上不会解析到子模块里的文件；发布到 npm 后也会失效。
- **部分文档仍需持续校准**：`docs/`、`.agents/` 中的事实必须与当前插件实现保持一致；例如不能依赖发布版 DSH 不提供的 `conversation/open-file`，或使用错误的包路径。
- **需要向 DSH 反馈的上游问题**：
  1. typert 生成器不识别 npm 安装的 `dsh-typert-protocol`（[问题 5](#问题-5typert-生成器报-publishes-remote-artifacts-but-has-no-remote-methods)）。
  2. `api-remotes` 只把各 Remote 包列为 devDependencies，外部拿不到类型合并（[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)）。
  3. `dsh-client-test-runtime` 导入未发布的 `src` 文件；平台模块不声明第三方依赖（[问题 10](#问题-10单元测试dsh-发布的客户端包在-node-里无法加载)）。
  4. `clientBundle()` 客户端打包预设没有发布（[问题 8](#问题-8客户端打包工具没有发布)）。

## 11. 排障速查

| 现象 | 处理 |
|---|---|
| `pnpm install` 报某个 `@deepseek-ai/*` 404 | 检查是否写了 `*` / `latest`，改为精确版本（[问题 2](#问题-2pnpm-install-报-deepseek-aidsh-type-meta-404)） |
| 小说 workflow 报 `no structured result` | 查看失败成员的子 Session 结束原因，再核查草稿和追踪；模型报错与未调用 `structured_output` 都可能返回 null，不能归因于摘要长度或盲目重跑（[结果与恢复](packages/creative/story/knowledge/story/references/writing/long/native-workflow.md#结果与恢复)） |
| 新章细纲不存在 | workflow 的 Prepare 按[中途补纲](packages/creative/story/knowledge/story/references/writing/long/workflow-setup.md#中途补纲)在授权内创建并检查后交给写手；普通路径由主会话准备。章号检查返回缺失路径与补建建议，同章多个文件则先核实，不重复创建 |
| 类型检查报 `Cannot find module '@deepseek-ai/<包>/remote'` 或 `ClientRemote` 缺属性 | 把该包加进 devDependencies，并 `import type {} from '<包>/remote'`（[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)） |
| 类型检查报找不到 `@winterhuan/dsh-skill-viewer/remote` | 先跑 `pnpm run build:host`；`typecheck` 已经包含这一步 |
| typert 报 `has no Remote methods` | 确认补丁已应用（`pnpm install` 会重新打补丁），以及补丁版本与安装的生成器版本一致（[问题 5](#问题-5typert-生成器报-publishes-remote-artifacts-but-has-no-remote-methods)） |
| 改了依赖或 tsconfig 后 tsc 行为异常 | `pnpm run clean`，清掉 `lib/` 里的 `*.tsbuildinfo` |
| 客户端测试报 `window is not defined` | 有 `@deepseek-ai/<包>/client` 导入没有被 `vitest-upstream-client.ts` 映射，检查子模块是否已检出、包名是否存在于 `upstream/packages/*/*` |
| 客户端测试报 `Cannot find package 'X' imported from upstream/...` | 把 X 加进根 devDependencies，版本用 `git -C upstream grep -h '"X"' HEAD -- '*package.json'` 查 |
| 测试报 `Unknown file extension ".css"` | 该包没有被 `server.deps.inline` 覆盖，把它加入内联规则 |
| 构建报 `no packages/*/*/package.json declares the name ...` | 新包的 `package.json` 名字与 `clientBundle()` 的 id 不一致，或者包不在 `packages/<组>/<包>` 下 |
| `dsh plugin add` 后界面没有变化 | 确认已 `pnpm run build`，并且 profile 是从 web 模板创建的；用 `--dump-config` 查看是否有 `# == @winterhuan/...` 层 |

## 12. 本机环境变更记录

2026-09-27：

- 全局 dsh：卸载 0.1.5-rc.3，在 nvm 的 Node v22.22.2 下执行 `npm install -g @deepseek-ai/dsh@next`，装上 0.1.7-rc.2。
- 旧的全局配置：`~/.dsh` 整体移到 `~/.dsh.backup-0.1.5-rc.3-20260927`，里面有 `.credentials.yaml`（API key）、`sessions/`、`storages/`、`settings.yaml` 和 `web` profile。新的 `~/.dsh` 是空的，需要重新配置 API key，或者把备份里的 `.credentials.yaml` 拷回来。确认不再需要后可以删除备份。
- 验证时用的临时目录 `/tmp/dsh-0.1.7`、`/tmp/dsh-home-creative` 已删除。

2026-09-29：

- 读取本机全局 DSH 的 `package.json`，版本已为 `0.2.0-rc.2`；本轮未修改全局安装或用户 profile。
- 联网后安装了仓库的目标依赖，并在临时 `DSH_HOME` 和临时项目中完成浏览器验证。临时设置与项目内容不写入用户 profile。
