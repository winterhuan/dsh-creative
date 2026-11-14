# dsh-creative 本机环境变更记录

本文件从 [HANDOFF.md](HANDOFF.md) 拆出，按时间记录本机（`/Users/winter/dsh-creative` 所在机器）的全局 DSH 安装、profile 与验证环境的变更。主文档的[第 12 节](HANDOFF.md#12-本机环境变更记录)是索引。

2026-09-27：

- 全局 dsh：卸载 0.1.5-rc.3，在 nvm 的 Node v22.22.2 下执行 `npm install -g @deepseek-ai/dsh@next`，装上 0.1.7-rc.2。
- 旧的全局配置：`~/.dsh` 整体移到 `~/.dsh.backup-0.1.5-rc.3-20260927`，里面有 `.credentials.yaml`（API key）、`sessions/`、`storages/`、`settings.yaml` 和 `web` profile。新的 `~/.dsh` 是空的，需要重新配置 API key，或者把备份里的 `.credentials.yaml` 拷回来。确认不再需要后可以删除备份。
- 验证时用的临时目录 `/tmp/dsh-0.1.7`、`/tmp/dsh-home-creative` 已删除。

2026-09-29：

- 读取本机全局 DSH 的 `package.json`，版本已为 `0.2.0-rc.2`；本轮未修改全局安装或用户 profile。
- 联网后安装了仓库的目标依赖，并在临时 `DSH_HOME` 和临时项目中完成浏览器验证。临时设置与项目内容不写入用户 profile。

2026-10-05：

- 在 `/tmp/dsh-alpha-qa.SvMvfU` 安装 DSH `0.2.1-alpha.1`，使用独立 `DSH_HOME`、profile 与临时作品完成 Chrome 验证；结果和截图保留在该目录。
- macOS 本地启动默认使用原生目录选择器；自动化验证在临时 profile 禁用 `directory-picker`，另挂 browse Host 与 Client 两行。
- 隔离浏览器和服务已关闭。本轮未升级全局 DSH、未修改用户 profile 或真实小说文件。

2026-10-05 四领域本地安装：

- `web` profile 已卸载聚合包并分别链接小说、短剧、视频解说、游戏包；Skill Viewer、模型设置和 Inspector 保持原安装。profile 备份为 `~/.dsh/profiles/web.backup-unbundle-20261005-143518`。
- 本地服务在 `127.0.0.1:3080` 重启；Chrome 验证四个工作台可打开，`shenji` 仅显示神机诸天录（第 11 章、修订 24），Makers 密钥可编辑，页面脚本错误为零。未写入作品文件或调用付费服务。
- 隔离安装、压缩包与配置证据位于 `/tmp/dsh-unbundle-qa/`，本地浏览器截图为 `/tmp/dsh-unbundle-local.png`。
- 隔离 profile 移除短剧后，视频插件与共用生产设置在 Chrome 中仍可使用，无页面脚本错误。临时服务已关闭。
- 游戏 QA 驱动与工作台统一使用 `/novel-to-game/preview/`；临时 narrative 模板在 Chrome 完成启动、渲染、输入、核心循环、结果和重开六项检查。游戏包 7 个文件 26 项回归通过。

2026-10-05 学习工作台：

- `dsh-student` 的本地链接已存在；本轮构建新增客户端与工作区接口，用户正在运行的 `web` 服务未重启，重启后加载新版。
- 隔离 profile 在 Chrome 验证家长设置、教材与进度原子保存、开始学习、提示、回答、刷新后恢复反馈、到时停止作答、结束休息、奖励、转录确认及原生图片附件提交。无效图片保留预览并显示错误，有效 PNG 提交成功。深浅色与窄窗口检查通过，无页面脚本错误。
- 5 个文件共 39 项测试、类型检查和构建通过；题目与评分使用测试数据，未测量真实模型的教学或识图质量，也未下载教材。浏览器证据位于 `/tmp/dsh-student-qa.RjTRvl/panel-results.json`。

2026-10-10 学习插件收尾：

- 当前实现包含智能学习模式、学年必选与课程备注选填、按科目选择到期复习、回答与反馈同屏及状态对应的辅导入口。二年级上册默认教材提供语文 126 页、数学 118 页；默认资料不建立校内关联，边界见[默认教材决策](.agents/notes/implemented/feature/2026-10-10-student-default-textbooks.zh.md)。原学习决策保留课程确认、证据、计时和奖励规则。
- `pnpm run typecheck`、`pnpm run build` 通过；全量 87 个文件、772 项测试通过，其中学习包 6 个文件、46 项。文档 16 项、规范 3 项检查通过。
- 隔离 DSH `0.2.1-alpha.1` 的 Chrome 检查覆盖中英文家长设置、按科目选择复习但不自动开始、实际接口开始学习、保留回答与反馈、下一题入口、休息期间禁用复习，以及 720px 深浅色显示；英文检查另验证刷新后恢复回答与反馈，页面脚本错误为零。题目与评分使用测试数据。
- 教材准备脚本逐字节复现全部 492 个文件，错误源文件在输出前被拒绝。仓库外解压的安装包通过原生 `read_image` 读取两本科目的课页，并拒绝纯文本模型。独立压缩包 profile 已安装、启动并在浏览器加载模式、工作台和工作区接口；pnpm 的 profile peer 检查报告未声明宿主依赖，实际 DSH 宿主加载通过。
- 日志、压缩包、截图及浏览器结果保留在 `/tmp/dsh-student-finish.aG9PwT/`。首次默认工作区落入 Documents 时生成的测试档案已清理，后续验证使用显式临时 Documents 路径；隔离服务和浏览器均已关闭，未修改用户 profile 或重启用户服务。
- 未调用真实模型或付费服务，识图准确率、教材教学质量和真实模型 token 用量仍未测量。

2026-10-11 本地安装 alpha.2 构建：

- 全局 dsh 已为 `0.2.1-alpha.2`（用户自行升级）。`web` profile 先备份到 `~/.dsh/profiles/web.backup-alpha2-20261011-223819`（不含 node_modules），再用 `dsh plugin --profile web add <绝对路径>` 重新链接小说、短剧、视频解说、游戏、学习、技能查看器、模型设置七个包并新增 `project-default-mode`；`--dump-config` 显示 8 个 `# == @winterhuan` 安装层。
- 正在 `127.0.0.1:3080` 运行的 `dsh web` 本轮未重启，仍加载旧版本；重启后才会加载 alpha.2 构建与项目默认模式插件。未做浏览器验证。

2026-10-25 练习单网页化：

- 包内 8 个文件 126 项测试、文档 16 项与规范 3 项检查通过；`pnpm install` 更新锁文件（树减少 16 个包）。根 `typecheck`/`build` 与全量测试中 `ui-settings-model-options` 与 story 的失败分别为工作区另一项在途改动与本机既有问题，与本次无关。
- `pnpm --filter @winterhuan/dsh-student build` 后 `dsh-webctl restart`；cookie 会话下页面 200，合并 bundle（4.6 MB）含新打印代码且无 `/student/print` 引用，`/student/workspace` 正常返回 JSON，`/student/worksheet.pdf` 与 `/student/print` 均为 404。浏览器打印对话框的分页与实际出纸未做人工验证；未调用真实模型。

2026-10-25 学生读路径缓存：

- `pnpm run typecheck`、文档 16 项、规范 3 项与包内 129 项测试通过；构建后重启 web，cookie 会话下页面与合并 bundle 正常，新条件轮询代码已在服务端 bundle 中，带 `revision` 的无会话与未知会话请求返回既有 JSON 错误。真实学习会话的端到端条件响应由 route 用例覆盖，浏览器内轮询与缓存命中行为待人工确认；未调用真实模型。

2026-10-25 学习核心模块化（阶段 1）：

- `src/learning.ts`（1541 行）拆为 `learning/` 六模块加 `update/` 五个处理器族，14 个引用方改显式导入；`tests/learning.spec.ts` 同边界拆为四个 spec。新增 `src/actions.ts` 以穷尽元数据声明动作的可提交面与所属族，路由白名单由它生成。129 项测试重分布到 11 个文件全过；根 typecheck、build、文档 16 项、规范 3 项通过；重启后页面、bundle 与接口正常。决策见[模块化](.agents/notes/implemented/simplification/2026-10-25-student-learning-modules.zh.md)。

2026-10-25 模型指引单源化与提示阶梯（阶段 2）：

- 工具描述与 queryStudy 的 `more` 收敛为纯契约与指向 study 技能的指针（`change` 描述约 1300 → 330 字符）；`objectiveElements` 新增三层 `hintLadder`（方法提示条件/画图、对照登记错法自查、出题要点作步骤），`kind=elements` 返回，技能提示段按层执行。包内 130 项测试、文档 16 项、规范 3 项与根 typecheck/build 通过；构建重启后接口正常。提示质量需一次真实学习会话抽查，验证人：用户。决策见[模型指引](.agents/notes/implemented/simplification/2026-10-25-student-model-guidance.zh.md)。HANDOFF 词数预算一次性上调至 4700（后续阶段仍需记录）。

2026-10-25 前置链教学与错因感知间隔（阶段 3）：

- 需要教学的目标沿同科前置边找最近的未掌握前置，建议重定向（新理由码 prerequisite-gap、携带 redirectedFrom，前置补完自动回落）；同一错题确认后再答错隔两天复习，同目标同错因两条活跃错题把巩固卷变式下限提到换情境。包内 133 项测试、文档 16 项、规范 3 项与根 typecheck 通过；构建重启后接口正常。决策见[前置与间隔](.agents/notes/implemented/feature/2026-10-25-student-prerequisite-spacing.zh.md)。

2026-10-25 掌握可视化、家长周报与按标签载荷（阶段 4）：

- 三个圆点抽成共享 MasteryDots 并接入地图详情与目标行，第三天独立答对落账时答题卡祝贺一次；weeklySummary 纯派生周报（时长/天数、新掌握、错题流向、到期完成、本周错因）随家长页返回；工作区接口按 tab 取数，仅地图标签携带整册地图（lite 标记）。包内 135 项测试、文档 16 项、规范 3 项与根 typecheck 通过；构建重启后接口正常，浏览器逐标签目检待用户确认。决策见[周报与进度](.agents/notes/implemented/feature/2026-10-25-student-weekly-progress.zh.md)。

2026-10-25 批量抽查批改、派生字段出文件与学期归档（阶段 5）：

- `paper-draft` 增加置信度，工作台高置信题一键批量确认、低置信与答错题逐题核对；复习派生字段（stage/independentDays/dueAt）写入前剥离、读取时重放，旧文件兼容；新命令 `archive-term` 先导出全部证据到 `.study/` 归档文件再清空档案，家长设置提供按钮。包内 138 项测试（含真实文件系统归档端到端）、文档 16 项、规范 3 项与根 typecheck 通过；构建重启后接口正常，批量确认与归档待家长真实走一遍。L4 块内交错按计划门控，待前四阶段真实使用反馈后落地。决策见[批改与归档](.agents/notes/implemented/feature/2026-10-25-student-archive-grading.zh.md)。

2026-11-06 DSH 0.2.2-rc.1 升级：

- 全局 dsh 升到 `0.2.2-rc.1`（`npm install -g @deepseek-ai/dsh@0.2.2-rc.1 --prefix ~/.nvm/versions/node/v22.22.2`），`dsh web` 重启后页面 HTTP 200，5 个 `@winterhuan` 客户端 bundle（writer 113834、student 256989、project-default-mode 18546、skill-viewer 43810、settings-model-options 20353 字节）经 cookie 会话验证均返回 200。
- 升级前 `dsh` 自更新被中断，`bin/dsh` 指向临时名 `.dsh-We3xC8Eb` 导致命令不可用，已通过上述 npm 安装恢复。
- Node 版本：nvm 默认 v22.22.2，`/usr/local/bin/node` 软链接曾指向 v22.20.0 覆盖 nvm，已改指向 v24.22.2；全局 dsh 仍装在 v22.22.2 下。
- 5 个 `@winterhuan` 插件保持 link 到本仓库，未重新 link；`dsh web` 重启即加载 0.2.2-rc.1 构建。

2026-11-07 writer 预设菜单修复：

- 根因：0.2.2-rc.1 上游把 delegation 组的 `tool-subagent-list-agents`/`tool-subagent-list-models` 行收回 `tool-subagent-control` 与 `tool-subagent`（`modelSelectionSettings`→`modelSelection`，新增 `modelDiscovery`），`@deepseek-ai/dsh-tool-subagent-control` 不再导出 `/list-agents`；writer 的 `cordis.patch.yml` 仍带 rc.5 旧行，该行 `never started` 导致 preset-writer 标记 broken，被模式菜单过滤。
- 修复 `packages/winterhuan/writer/cordis.patch.yml`（链接包运行时直读，无需重编译）并 `dsh-webctl restart`；浏览器验证模式菜单恢复「写作模式」且可选，设置页 Agent 预设不再显示加载失败。本轮 profile 侧仅有此前调试留下的内容一致的备份文件，未改 profile 补丁。


2026-11-07 独立插件与市场发布：

- 6 个独立仓库位于 `/Users/winter/dsh-plugins/`，均已推送到 GitHub。writer、student、project-default-mode 发布 `0.1.1`；skill-viewer 与 ui-skill-viewer 发布 `0.1.5-rc.3`；ui-settings-model-options 发布 `0.1.7-rc.3`。每个 Release 附带由对应固定提交打包的编译产物，公开下载后的 SHA-256 与本地包一致。
- 市场索引为 `https://winterhuan.github.io/dsh-creative/index.json`，由本仓库 `gh-pages` 分支通过 GitHub Pages 提供。HTTP 200、无重定向，DSH 官方格式校验器通过；索引中的包名、版本、DSH 兼容声明、组合包声明与公开 Git 提交的 manifest 一致。5 个组合包均固定 Git 提交与包目录，兼容 DSH `0.2.2-rc.1`；第 6 个仓库是随技能查看器打包的客户端，不单列市场条目。
- 6 个仓库各自的 typecheck、build 和测试全部通过，共 557 项；12 对根及包 README 的双语结构、记录和本地链接通过。README 提供市场地址与固定提交安装命令，已提交并推送。
- 隔离 DSH profile 在真实浏览器成功添加索引，显示 5 个组合包及对应已安装版本。项目默认模式经「发现 → 安装 → 立即启用」重新安装后显示 1 个组件运行中；确认框中的仓库、提交和目录与索引一致。未调用真实模型，未修改用户日常使用的 profile。
- 发布结果、校验值、日志和浏览器截图位于 `/Users/winter/dsh-plugins/market-checks/`，汇总为 `final-publication-results.json`；市场安装证据为 `market-install-confirmation.txt`、`market-install-success.txt` 和 `market-install-enabled.txt`。本轮未提交本仓库先前的目录迁移和写作模式修复改动。


2026-11-07 插件版本统一：

- 6 个独立仓库、本仓库的现役插件清单、技能查看器随包客户端统一为 `0.1.8`。技能查看器的 Git 客户端依赖、客户端开发依赖的 Host 发布包及对应锁文件同步；DSH 兼容声明保持 `0.2.2-rc.1`。
- 6 个仓库均发布 `v0.1.8` 并设为最新 Release。市场的 5 个组合包均推荐 `0.1.8`，README 安装命令指向该版本的固定 Git 提交；旧标签和 Release 保留为历史版本。
- 6 个独立仓库及本仓库的 typecheck、build、557 项测试通过；12 对 README 结构、记录和链接通过。发布与校验材料在 `/Users/winter/dsh-plugins/version-0.1.8/`。
- 隔离 profile 的「发现」页显示 5 项均为 `0.1.8`，旧安装均标记「有新版本」。技能查看器从旧版升级后，Host 与随包客户端清单均为 `0.1.8`，浏览器显示 2 个组件运行中；未修改日常使用的 profile。线上索引 HTTP 200、无重定向，6 个最新 Release 的标签和附件校验值全部核对通过。

2026-11-07 本机插件切换为远程安装：

- 用官方 `dsh plugin --profile <name> add <固定 Git 地址>` 替换 `creative`、`headless`、`student`、`web` 中已有的 `@winterhuan/*` 本地链接。4 个 profile 的全部目标包均为 `0.1.8`，安装地址与市场索引一致，解析路径不再指向本仓库；`web` 的技能查看器随包客户端也为 `0.1.8`。
- 安装前的 profile 配置、锁文件和插件管理记录备份在 `/Users/winter/.dsh/backups/remote-plugins-20261107-202147`（不含 `node_modules`）。`creative`、`headless`、`student` 的配置补丁 SHA-256 保持一致；`web` 的补丁仅追加市场索引配置，原内容逐字节保留。历史备份 profile 保留。`headless` 旧的直接依赖 `@deepseek-ai/dsh-agent-preset-registry@0.2.1-rc.5` 被当前 DSH 拒绝加载，已对齐到 `0.2.2-rc.1`；其他非目标依赖保持原值。
- `headless` 的首次 pnpm 安装报告完成后进程未退出，终止该进程并重跑官方命令后正常退出。最终 4 个 profile 的配置合成通过；安装日志与验证结果在 `/Users/winter/dsh-plugins/local-remote-install-20261107-202147/`。
- `dsh-webctl restart` 后，在真实浏览器逐项确认 5 个组合包均显示远程 Git 来源、`v0.1.8` 且全部组件运行中（writer 2、student 2、project-default-mode 1、skill-viewer 2、model-options 1）。日常 `web` 的「发现」页已添加 `https://winterhuan.github.io/dsh-creative/index.json`。安装说明已改为日常使用远程版本、本地链接只用于开发 profile。

2026-11-07 插件市场详情连接修复：

- 浏览器复现「发现」页的「无法连接到详细介绍的来源」；已安装页读取随包 README 正常。市场详情访问 `raw.githubusercontent.com`，本机直连返回 `ECONNRESET`，经已有的 `http://127.0.0.1:10808` 代理读取同一 README 返回 HTTP 200。launchd 的 Web 服务仅设置 PATH 和 HOME，没有继承终端代理。
- 按 DSH 官方代理指南创建 `~/.dsh/.env`（权限 0600），设置 HTTP_PROXY、HTTPS_PROXY 及本机直连的 NO_PROXY；重启 Web 后，真实浏览器逐项确认写作、学生、技能查看器、项目默认模式、模型设置的市场详情正文均加载成功。插件发布内容与版本 `0.1.8` 保持不变。复现和验证材料位于 `/Users/winter/dsh-plugins/detail-fix-20261107/`。

2026-11-07 技能查看器仓库合并：

- 市场发布与本机安装迁移到合并后的 [dsh-skills-viewer](https://github.com/winterhuan/dsh-skills-viewer)，版本 `0.1.8`，保留原仓库历史及用户配置。
- 构建、147 项测试、单次远程安装及浏览器验收通过。备份与证据：`/Users/winter/dsh-plugins/merge-skills-viewer-20261107-204726/`。两个旧仓库已删除，GitHub 均返回 404；合并后的仓库保留。


2026-11-08／09 Writer 远程更新：

- [v0.1.9](https://github.com/winterhuan/dsh-writer/releases/tag/v0.1.9)、[v0.1.10](https://github.com/winterhuan/dsh-writer/releases/tag/v0.1.10) 已发布并更新市场；`web`、`headless` 从固定远程提交安装，Web 重启验证通过。
- 配置备份及验收：`~/.dsh/backups/writer-release-20261108-0.1.9/`、`~/.dsh/backups/writer-acceptance-20261108-FJ5aWU/`、`~/.dsh/backups/writer-release-20261109-0.1.10-yda2g0r4/`。

2026-11-08 Shadow Mind 远程安装：

- [v0.2.0](https://github.com/winterhuan/dsh-shadow-mind/releases/tag/v0.2.0) 已发布，日常 `web` 安装该标签的固定 Git 提交并重启；配置、包检查、17 项测试与三个运行组件均已验证。未配置审查职责，不自动触发模型调用。安装前备份及证据：`~/.dsh/backups/shadow-mind-release-20261108-0.2.0/`。

2026-11-09 插件包名修正：

- [Antfarm](https://github.com/winterhuan/dsh-antfarm/releases/tag/v0.3.1)与[Shadow Mind](https://github.com/winterhuan/dsh-shadow-mind/releases/tag/v0.2.1) 补全 `@winterhuan` 包名；日常 `web` 远程迁移、重启验证完成，历史数据保留。证据：`~/.dsh/backups/scoped-plugins-release-20261109/`。

2026-11-09：Antfarm `0.3.3` 已发布并远程安装到本地，验证与备份见 [HANDOFF](HANDOFF.md#4-开发命令与构建流程)。

<a id="new-api-release"></a>

2026-11-12 New API 管理台发布与远程安装：

- [v1.0.0-winter.1](https://github.com/winterhuan/dsh-new-api/releases/tag/v1.0.0-winter.1) 已公开发布并加入[插件市场](https://winterhuan.github.io/dsh-creative/index.json)；日常 `web` 从该远程标签安装，原有依赖及配置保留。重启与硬刷新后，设置页、运行组件、固定标签来源和市场详情均通过真实浏览器验证。
- 插件语法检查、构建和 13 项测试通过；隔离 DSH 验证鉴权、代理与全局余额刷新，证据见 `.artifacts/dsh-new-api-fix-verification/`。安装前备份及本机验收材料位于 `~/.dsh/backups/dsh-new-api-release-20261112-210815/`。真实站点认证与每日定时签到尚未验证。

<a id="media-desk-native-release"></a>

2026-11-14 Media Desk 原生创作与 Notes 发布：

- [v2.7.0-winter.2](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.2) 已发布并加入[插件市场](https://winterhuan.github.io/dsh-creative/index.json)；日常 `web` 从固定 Git 标签升级，原有其他依赖保留。浏览器已验证新版本、两个运行组件、原生输入和历史作品加载。该补丁修复媒体保存列表被素材路径校验拦截的问题；`v2.7.0-winter.1` 保留为历史版本。
- 本机迁移前备份 profile、Media Desk 和历史文件。两个旧作品的正文、成稿、固定 AI 原稿与九张已接受图片已迁入 `~/wiki/notes`，文字及图片字节核对通过；旧 Notes 文件保持原内容，索引仅追加本数据目录的导航。备份及验收材料位于 `~/.dsh/backups/media-desk-release-20261113-2.7.0-winter.1/`。
- 插件语法检查、构建、191 项完整并发测试、文档 16 项和规范 3 项检查通过。隔离固定 Git 包验证配置、加载及浏览器产物哈希；真实浏览器覆盖问答与批准、成稿接受、Notes 当前稿复制和导出、选段改稿回执、语言与主题、附件及重启后旧会话恢复。未发送附件硬刷新后需重新添加；保存文字草稿和已发送附件历史保留。
- 有界真实模型验收使用 `magpieme/group/qwen-max`，验证 llm-wiki 加载、来源读取、两轮研究与策划／脚本持久接受。Token 和缓存数据包含原生上下文、工具及来源读取，不单独衡量技能开销；测试 Wiki 不证明事实或写作质量。付费 HTTP 生图、真实订阅登录及 Linux／Windows 未验证。

<a id="media-desk-readable-files"></a>

2026-11-14 Media Desk 文件整理与远程更新：

- [v2.7.0-winter.3](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.3) 已发布、更新市场并安装到日常 Web。作品以标题命名，重名加短编号，图片按作品归档。
- 停服务备份后，history 移入 `notes/.media-desk/history/`，105 个文件减至 19 个；保留最近 5 个版本与撤销及仍引用的快照。两份正文、18 张图、其他 Notes 文件与依赖保持原值；浏览器验证标题路径、9 张图加载和原生会话恢复。
- 语法检查、构建、195 项测试（并发数 2）、整理幂等与回滚验证通过。Wiki 检查排除内部快照，8 项回归及全库结构检查通过。证据：`~/.dsh/backups/media-desk-readable-files-20261114-172220/`。
- 规范检查通过；文档 14／16 项通过，两个失败均为未修改的 Superagent README 配对记录与限制章节格式。

<a id="media-desk-single-journal"></a>

2026-11-14：Media Desk [v2.7.0-winter.4](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.4)已远程更新，保存双日志合并为一份，无引用的过期撤销文件自动清理，保留五条近期历史与重启撤销；197项测试、备份副本整理及日常正文／18张图片校验通过。备份：`~/.dsh/backups/media-desk-single-journal-20261114-182829/`。

<a id="superagent-git-market-release"></a>
2026-11-14 Superagent Git 发布：

- [v0.1.0](https://github.com/winterhuan/dsh-superagent-prototype/releases/tag/v0.1.0) 包含预构建入口，补齐公开包元数据并加入[市场](https://winterhuan.github.io/dsh-creative/index.json)。本机独立 `superagent` profile 来源为 `github:winterhuan/dsh-superagent-prototype#v0.1.0`；浏览器显示仓库来源与五个运行组件，全部健康检查通过。
- `web` 的十个相关会话及工作区登记已迁出；业务库与工作目录保留，原始会话字节、账号、策略和提示词保持完整。独立登录启动和服务管理已配置。
- 类型检查、构建、1197 项测试和文档检查通过；未触发真实模型工作。迁移备份在 `~/.dsh/backups/superagent-profile-migration-20261114-191943/`，远程切换备份与验收证据在 `~/.dsh/backups/superagent-git-release-20261114-202739/`。

<a id="antfarm-profile-migration"></a>

2026-11-14：Antfarm `0.3.3` 拆分至独立 `antfarm` profile（3083），以 `~/.dsh/bin/dsh-antfarm` 管理，登录启动尊重手动停止。运行库、四个原生会话、人设工作区与历史字节校验通过；日常 `web` 移除插件，保留原项目会话。备份：`~/.dsh/backups/antfarm-profile-migration-20261114-210138/`。

<a id="media-desk-chat-simplification"></a>

2026-11-14：Media Desk [v2.7.0-winter.5](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.5) 移除聊天底部的已接受作品卡片，更新市场及日常 Web。语法、构建、40 项相关测试、文档与规范检查通过；浏览器确认保存回执仍保留，正文及原生聊天正常。备份：`~/.dsh/backups/media-desk-hide-work-receipts-20261114-221943/`。

<a id="media-desk-global-review"></a>

2026-11-14：Media Desk [v2.7.0-winter.6](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.6) 补清全局复盘先列举作品、再读取 Notes 与固定 AI 原稿的路径，误用任务编号时返回纠正提示；证据不足仍可提交空规则，提案须用户审阅。已更新市场及日常 Web；语法、构建、51 项相关测试、文档与规范检查通过，121 个 Notes 内容文件及 18 张图片字节不变。备份：`~/.dsh/backups/media-desk-global-review-20261114-230714/`。
