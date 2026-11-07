# dsh-creative 问题记录

本文件从 [HANDOFF.md](HANDOFF.md) 拆出，记录仓库开发中遇到的实际问题与解决方案。主文档的[第 7 节](HANDOFF.md#7-实际遇到的问题与解决方案)是索引。

## 问题 1：typecheck 报几百个 upstream 包的错误

- **现象**：`pnpm run typecheck` 报 `upstream/packages/api/*` 等上游包的错误，例如 `Cannot find module '@deepseek-ai/dsh-api-job-controller/remote'`、`Property 'job' does not exist on type 'ClientRemote'`。
- **原因**：最初的方案把 upstream 的所有包加进 pnpm workspace，tsconfig 用 project references 和 `paths` 指向上游源码。上游的 `/remote` 模块是 typert 在构建时生成的产物，源码里没有，上游没有完整构建时这些源码就编译不过。这样也等于把上游代码当成本仓库的一部分来编译。
- **解决**：改为依赖 npm 上发布的 DSH 0.1.7-rc.2。tsconfig 继承本仓库的 `tsconfig.base*.json`，不引用 upstream 的任何项目，`@deepseek-ai/*` 通过 `node_modules` 解析到发布包的 `lib/types/*.d.ts`，并开启 `skipLibCheck`。pnpm workspace 只包含 `packages/*/*`。

## 问题 2：`pnpm install` 报 `@deepseek-ai/dsh-type-meta` 404

- **现象**：`ERR_PNPM_FETCH_404 ... @deepseek-ai/dsh-type-meta`，出错位置在 `@deepseek-ai/dsh-typert-registry@0.0.1-rc.1` 或 `@deepseek-ai/dsh-api-remotes@0.0.1-rc.1` 的依赖里。
- **原因**：依赖版本写成了 `*`。DSH 各包在 npm 上的 `latest` 标签停在很早的 `0.0.1-rc.1`，它依赖从未发布的 `dsh-type-meta`。当前版本在 `next` 标签上（查法：`npm view @deepseek-ai/dsh-session dist-tags`）。
- **解决**：所有 DSH 包固定为精确版本 `0.1.7-rc.2`。

## 问题 3：误操作 upstream 子模块

- **经过**：迁移过程中曾在子模块里 `git checkout creative`，又 `rm -rf upstream` 后重新初始化，子模块一度停在 `1b9dc03e1c`（包含 creative 代码本身的提交）。
- **解决**：恢复到 `dsh-v0.1.7-rc.2`（`477b4f4205`）并记录进提交；`.gitmodules` 指向 `git@github.com:deepseek-ai/deepseek-harness.git`。子模块的 git 目录里还有一个 clone 时带来的本地 `creative` 分支，不影响使用。
- **规则**：不修改 `upstream/`，只读取。

## 问题 4：`cp -r` 复制包时陷入 node_modules 符号链接循环

- **现象**：`cp -r packages/skill/skill-viewer ...` 两分钟没结束，输出大量 `directory causes a cycle`，还在目标目录里留下了嵌套的残缺副本。
- **原因**：目标目录已存在，所以被复制到了它的子目录里；同时 macOS 的 `cp -r` 跟随了 pnpm `node_modules` 里的符号链接，在包之间循环。
- **解决**：删除残缺副本。以后从主仓库复制包时排除 `node_modules` 和 `lib`，例如 `rsync -a --exclude node_modules --exclude lib <源>/ <目标>/`，或者用 `git archive`。

## 问题 5：typert 生成器报 `publishes Remote artifacts but has no Remote methods`

- **现象**：`build:host` 里 Host 面编译通过，typert 插件报 `TypertAnalysisError: typert(host): @winterhuan/dsh-skill-viewer publishes Remote artifacts but has no Remote methods`。
- **原因**：生成器通过 `FaceAnalyzer.isTypeMetaSymbol()` 识别 `@Remote`、`TypertRemoteService`、`bindTypertRemote`，只接受两种情况：
  - 声明所在文件属于一个名为 `@deepseek-ai/dsh-typert-protocol` 的 workspace 包。workspace 包的登记来自根 `tsconfig.host.json` / `tsconfig.client.json` 引用的、位于 `<根>/packages` 下的项目。
  - 声明位于 `declare module '@deepseek-ai/dsh-typert-protocol'` 块内。

  从 npm 安装时，协议包在 `node_modules` 里，两个条件都不满足，skill-viewer 的 `@Remote` 方法被忽略。这是生成器只考虑 monorepo 场景造成的缺口。
- **解决**：用 `pnpm patch` 加一个判断，复用生成器里已有的 `externalModuleIdentityForFile()`。各插件子模块的补丁文件为 `patches/@deepseek-ai__dsh-typert-generator@0.2.2-rc.1.patch`，由该子模块 `pnpm-workspace.yaml` 的 `patchedDependencies` 引用：

  ```diff
          if (registration?.name === '@deepseek-ai/dsh-typert-protocol')
              return true;
  +        // Repositories outside the DSH monorepo install the protocol from npm instead of a workspace package.
  +        if (externalModuleIdentityForFile(declaration.getSourceFile().fileName)?.package === '@deepseek-ai/dsh-typert-protocol')
  +            return true;
  ```

- **相关约束**：生成器从 bundle 目录向上查找 `tsconfig.host.json` 来确定 workspace 根，所以根目录必须有 `tsconfig.host.json`，并且它引用的项目必须在 `packages/` 下。
- **建议**：向 DSH 提 issue 或 PR，让生成器原生支持 npm 安装的协议包，之后可以删掉这个补丁。

## 问题 6：客户端类型检查：`ClientRemote` 上没有 `credentials`；找不到 `dsh-agent-preset-registry/types`

- **现象**：
  - `creative-produce-card-controller.ts`：`Property 'credentials' does not exist on type 'ClientRemote'`。
  - `ui-skill-viewer/src/client/mount.ts`：`Cannot find module '@deepseek-ai/dsh-agent-preset-registry/types'`。
- **原因**：发布的 `@deepseek-ai/dsh-api-remotes` 在 `client` 声明里用 `export type {} from '<包>/remote'` 转发各个 Remote 的类型合并，但只把这些包列为自己的 devDependencies。对外部使用者来说这些包根本没安装，类型合并就悄悄丢了（`skipLibCheck` 掩盖了声明文件里的解析错误）。另外 pnpm 严格模式下，未声明的依赖一律解析失败。
- **解决**：
  - `ui-settings-creative-produce` 增加 devDependency `@deepseek-ai/dsh-api-settings-controller`，并在 `creative-produce-card-controller.ts` 里写 `import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'`。
  - `ui-skill-viewer` 增加 devDependency `@deepseek-ai/dsh-agent-preset-registry`。
- **通用规则**：新用到 `ctx.remote.<命名空间>` 时，把提供它的 DSH 包加进该包的 devDependencies，并显式 `import type {} from '<包>/remote'`。

## 问题 7：Skill Viewer 的类型从 `dsh-api-remotes/client` 导入

- **现象**：`Module '"@deepseek-ai/dsh-api-remotes/client"' has no exported member 'SkillViewerEntry'`（以及 `SkillViewerGetValue` 等）。
- **原因**：发布版 `api-remotes` 没有导出外部 Skill Viewer 的类型。
- **解决**：`ui-skill-viewer` 的源码和测试改为从 `@winterhuan/dsh-skill-viewer/types` 导入这些类型；`RemoteResult` 等上游确实导出的类型仍从 `api-remotes/client` 导入。运行时挂载见[第 3 节 Remote](HANDOFF.md#remote)。

## 问题 8：客户端打包工具没有发布

- **现象**：3 个客户端包的 `tsdown.config.ts` 导入 `upstream/packages/client/tsdown.client.ts` 里的 `clientBundle()`。它负责生成 DSH 模块加载器能加载的 bundle，但没有发布到 npm。
- **解决**：把它和它依赖的上游内部文件复制到各插件子模块的 `scripts/`，并做了以下适配（完整清单见[第 8 节](HANDOFF.md#8-从上游复制的文件及本地改动)）：
  - `optionalStringArray` 在 `@deepseek-ai/dsh-client-modules` 里没有公开导出，内联到 `tsdown.client.ts` 末尾。
  - `platform.ts` 没有任何导入，直接复制。没有改为导入 `@deepseek-ai/dsh-client-web`，因为它的入口会带进浏览器代码。
  - 本仓库的包布局与上游相同（`packages/<组>/<包>`），包路径相关的 glob 保持上游原样。文件位置不同带来的改动：`tsdown.client.ts` 在上游位于 `packages/client/`，这里位于 `scripts/`，所以 `REPOSITORY_ROOT` 改为 `new URL('..', import.meta.url)`，三个上游内部模块改为同目录相对导入；`client-build-environment.ts` 的产物 glob 删掉 `apps/web/dist/**/*`。
  - 浏览器 source map 的前缀 `../../../` 对应 map 的服务地址 `/plugins/<scoped-package>/client.js.map` 的深度，与仓库布局无关，保持上游原样；单层布局时期曾误改为 `../../`。
  - `.dsh-build/` 加入 `.gitignore`。
- **维护**：升级 DSH 时重新同步这些文件，并重新应用上述改动。

## 问题 9：客户端构建期环境类型

- **现象**：客户端 tsconfig 需要 `types: ["client-build-environment"]`，这个类型包只在上游的 `scripts/types/client-build-environment/` 里。
- **解决**：复制到各插件子模块的 `types/client-build-environment/index.d.ts`；子模块 `tsconfig.base.client.json` 设置 `typeRoots: ["./types", "./node_modules/@types"]`。

## 问题 10：单元测试：DSH 发布的客户端包在 Node 里无法加载

Host 测试一开始就全部通过，失败的都是客户端测试，原因有几层：

表中的根依赖、测试解析脚本和 `upstream/` 均属于各插件子模块。

| 现象 | 原因 | 解决 |
|---|---|---|
| `Cannot find package 'zustand'`（以及 `immer`、`clsx`、`simple-icons`、`@deepseek-ai/dsh-util-code-language`）imported from `dsh-client-store` / `dsh-client-ui-primitives` 的 `lib/index.js` | 这些平台模块导入第三方库却不声明依赖，浏览器里由 web 前端打包提供 | 加到根 devDependencies：Node 从 `.pnpm` 内的包向上查找时能找到根 `node_modules` |
| `ReferenceError: window is not defined` | 客户端插件的 `./client` 导出是浏览器模块加载器 bundle，一加载就访问 `window.__ModuleLoader__` | 测试专用 Vite 插件 `scripts/vitest-upstream-client.ts`：把 `@deepseek-ai/<包>/client` 解析到 `upstream/` 的同版本源码 |
| `Cannot find module .../dsh-client-ui-renderer/src/client/bind.ts imported from .../dsh-client-test-runtime/lib/index.js` | 发布的 `dsh-client-test-runtime`（0.2.2-rc.1 仍如此）导入了 4 个没有发布的 `src` 文件：`dsh-client-ui-renderer/src/client/bind.ts`、`scoped-slots.tsx`、`dsh-api-session-controller/src/client/scope.ts`，以及 0.2.2-rc.1 新增的 `dsh-client-ui-context-menu/src/client/trigger.ts` | 同一个插件把 `@deepseek-ai/<包>/src/*` 解析到 `upstream/`；再用 `server.deps.inline` 让 Vite 处理 test-runtime，否则 Node 直接加载时根本不经过 Vite 插件 |
| `TypeError: Unknown file extension ".css"`（`dsh-client-ui-primitives/lib/StateDot.module.css`） | 发布包导入自己的 CSS module，Node 不认识 | `server.deps.inline: [/@deepseek-ai\/dsh-client-/]`，交给 Vite 处理 |
| `Cannot find package '@deepseek-ai/dsh-client-ui-conversation/src/client/conversation/assembler.ts'`、`.../dsh-client-ui-sidebar-right/src/client/tab-registry.ts` | 测试直接导入上游 `src` 文件，发布包不带 `src/` | 同一个插件解析到 `upstream/` |
| `Cannot find module '/upstream/packages/llm/token-meter/src/client/index.ts'` | 插件起初假设所有包的 `/client` 源码都在 `src/client/index.ts`，`dsh-token-meter` 不是这样 | 改为读取上游包 `exports['./client'].types`（`./lib/types/X.d.ts`），映射到 `src/X.ts` 或 `src/X.tsx` |
| `Failed to resolve import "@lexical/plain-text"`、`Cannot find package '@tanstack/react-virtual'` 等，来源是 `upstream/packages/client/...` | 上游客户端源码用到的第三方库；上游客户端包的 `package.json` 也没有声明它们 | 加到根 devDependencies，版本取自上游 |

补充说明：

- `vitest-upstream-client.ts` 对来自 `upstream/` 的裸导入，以 `node_modules/.pnpm/node_modules/` 下的一个锚点文件为起点解析，也就是 pnpm 的隐藏提升目录。这样 `react`、`@deepseek-ai/cordis` 等模块和插件包用的是同一份 npm 副本。
- 静态扫描可达的上游源码会把整个包的文件都算进去，结果会拉进 `@fortune-sheet/*`、`exceljs`、`pdfjs-dist`、`xlsx`（CDN tarball）这类重依赖，但测试实际并不需要它们。所以只在测试真正报 `Cannot find package` 时再补依赖。
- 后果：客户端单元测试依赖子模块已检出；构建和类型检查不依赖。

## 问题 11：发布版 DSH 没有 `conversation/open-file`

- **现象**：`sidebar.client.spec.ts` 报 `TypeError: registered.inject is not a function`，并且测试里还在调用 `context.waterfall('conversation/open-file', ...)`。
- **原因**：插件源码已经改用重定向标签类型（`file-redirect.tsx`，见[已归档的创作领域](HANDOFF.md#已归档的创作领域)），它会额外注册一个 `sidebar.right.pane.tab` 内容组件。于是 `entries('sidebar.right.pane.tab')[0]` 不再是工作台那一项；而 `conversation/open-file` 事件在发布版 DSH 里根本不存在。
- **解决**：
  - `bench()` 改为按 key 查找工作台项：`entries(...).find(entry => entry.options.key === '@winterhuan/dsh-creative')`。
  - 打开文件相关的断言改为检查 `tabs.get('creative-file')!.canOpen(fileAddressFor(SESSION_ID, '/workspace', path))`：Creative 文件返回 true，`README.md` 和其它工作区路径返回 false。
  - 卸载测试额外断言 `creative-file` 标签类型已移除。
- **未覆盖**：重定向内容组件（React effect 里的 `openTab(..., { replaceTab: true })`）需要真实渲染，单元测试没有覆盖，需要在浏览器里手动验证。

## 问题 12：包改名为 `@winterhuan/*`

- 改名涉及：4 个 `package.json` 的 `name` 和相互依赖，两个 `cordis.patch.yml`，源码里的运行时 id（例如 `workbench.tsx` 的 `WORKBENCH_ID`、`file-redirect.tsx` 的 `REDIRECT_ID`、`skill-viewer/src/index.ts`），3 个 `tsdown.config.ts` 的 `clientBundle()` id，测试与 `tests/fixtures/headless/cordis.yml`，以及 README 和 `docs/subsystems/` 中的对应文档。
- 替换时用精确的包名匹配，避免误伤 `@deepseek-ai/dsh-skill` 这类前缀相同的上游包。
- 没有验证过旧会话或旧布局是否记录过旧 id（`@deepseek-ai/dsh-creative`）。

## 问题 13：不属于外部插件的 DSH 内置改动

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
| `test-support/session-snapshot` 的 `production-jobs.ts` 与 creative 快照、web e2e | 上游测试设施，**没有迁移**，见[第 10 节](HANDOFF.md#10-已知限制与待办) |

## 问题 14：本机环境问题

- shell 里的 `ls` 是长格式别名，脚本里拼路径时要用 `command ls`，或直接用 glob。
- 环境变量里有 SOCKS 形式的 `all_proxy`：dsh 启动时会打印一条不支持的警告，不影响运行；curl 访问本地服务需要 `--noproxy '*'`。
- 全局 dsh 原来是 0.1.5-rc.3，比插件目标版本旧，已换成 0.1.7-rc.2（见[本机环境变更记录](HANDOFF-changelog.md)）。

## 问题 15：升级 0.2.2-rc.1 时 cordis 配套范围不匹配

- **现象**：domain-modes 测试报 `Cannot read properties of null (reading 'entry')`。
- **原因**：`cordis@4.1.0` 的 peer 要求 `cordis-plugin-loader ~1.1.0`，本仓库仍写 `~1.0.6`。
- **解决**：`cordis-plugin-{group,include,loader}` 全部升到 `~1.1.0`，`schemastery` 升到 `~3.19.0`（`dsh-settings@0.2.2-rc.1` 的 peer 要求）。

## 问题 16：skill-viewer 21 个测试报 `Cannot read properties of undefined (reading 'get')`

- **原因**：`AgentRegistry` 新增 `static inject = ['sessionProjections']`，测试上下文未注册 `SessionProjectionRegistry`。
- **解决**：两个 host 测试的 `context()` 加 `await ctx.plugin(SessionProjectionRegistry)`，skill-viewer 加 devDependency `@deepseek-ai/dsh-session-projection`。

## 问题 17：student 测试报 `ToolExecutorUnavailableError`

- **原因**：`ctx.tools.execute` 改为批处理 API（`ToolBatchInput`/`ToolBatchResult`），且必须注册 executor。
- **解决**：引入 `dsh-tool-executor-native`，用 `ctx.plugin({ apply, inject })` 对象形式加载（`NativeToolExecutor` 是类不是 cordis 插件，包无默认导出）；测试改用 batch 调用。
