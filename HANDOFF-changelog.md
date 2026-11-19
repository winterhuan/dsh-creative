# dsh-creative 本机环境变更记录

本文件从 [HANDOFF.md](HANDOFF.md) 拆出，按时间记录 macOS（`/Users/winter/dsh-creative`）与 WSL（`/home/maiscrm/projects/dsh-creative`）的全局 DSH 安装、profile 与验证环境的变更；主机差异在对应记录中说明。主文档的[第 12 节](HANDOFF.md#12-本机环境变更记录)是索引。

2026 年 9–10 月记录见[历史日志](archive/docs/HANDOFF-changelog-2026-09-10.md)。

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

<a id="media-desk-review-empty-id"></a>

2026-11-15：Media Desk [v2.7.0-winter.7](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.7) 修复复盘空 ID 读取，明确指标的 `itemId` 关联；已更新市场及日常 `web`，固定 Git 安装、重启、硬刷新及产物字节核对通过。

- 语法、构建、198 项测试、16 项文档与 3 项规范检查通过。真实 GPT-6 Luna 复盘读取两篇 Notes 正文、固定 AI 原稿及对应指标，阶段已接受；三条建议仍为 `proposed`。没有 `Work not found` 错误；普通 `read` 的 `offset: 0` 在改为 `1` 后恢复成功。
- 99 个既有 Markdown 文件与 28 个实体图片文件字节不变，既有作品、原稿、指标和其他插件依赖保持原值。索引新增建议，重启更新所有权锁；现有清理策略删除三份旧索引快照和一份无引用撤销文件，撤销文件已备份。
- 备份：`~/.dsh/backups/media-desk-read-empty-id-20261115-071916/`；复盘与完整性证据分别为其中的 `evidence/daily-review-result.json`、`evidence/integrity.json`。

<a id="student-workbench-release"></a>

2026-11-15：Student [v0.2.1](https://github.com/winterhuan/dsh-student/releases/tag/v0.2.1) 发布独立学习工作台，保留 0.2.0 的原生文件、手动保存和恢复功能。工作台选择学生工作区与学习主会话，嵌入原生辅导对话，并为旧档案和空工作区提供明确入口。

- 市场已更新；`web`、`student`、`creative` 从远程标签安装 0.2.1，其他直接依赖与用户补丁保持不变。日常 Web 重启后确认工作台、旧档案提示与历史辅导对话可用，8 个学习数据文件字节不变。
- 类型检查、构建、271 项测试、双语配对与 3 项规范检查通过。文档检查的 15 项通过，链接检查仅受保留的未提交 Student 架构草案引用已移除 `route.ts` 影响；排除该草案后，174 份 Markdown 链接通过。
- 预构建发布包包含 Host、Client、知识材料和双语说明，公开下载校验通过。profile、学习数据、源码和验收证据保存在 `~/.dsh/backups/student-workbench-release-20261115-ETWTNu/`。本次保留日常旧档案，未执行迁移。


<a id="student-legacy-display"></a>

2026-11-15：Student [v0.2.2](https://github.com/winterhuan/dsh-student/releases/tag/v0.2.2) 恢复旧格式学习档案的浏览和练习单预览打印。升级后的空白来自旧 `state.json` 未进入工作台显示；原档案完整，补丁直接只读展示，并保留家长确认迁移后才能保存新数据的提示。同一个学习段重新加载时，已选择的浏览科目保持不变。

- 市场加入固定提交的 0.2.2；`web`、`student`、`creative` 从远程标签更新，Web 重启后，`qiqiStudy` 的学生资料、29 条数学错题、练习单和原生学习对话恢复显示。三个 profile 的其他直接依赖、用户补丁和 8 个学习文件保持不变，没有执行业务数据迁移。
- 类型检查、构建、274 项测试及最终 60 项客户端回归通过；真实隔离 DSH 验证科目切换、错题浏览、旧练习单预览与保存禁用，日常远程安装验证原档案显示。规范检查通过；文档检查仍仅受保留草案的 `route.ts` 断链影响，排除该草案后 174 份 Markdown 链接通过。
- 发布包含预构建 Host／Client、知识材料与双语说明，公开下载 SHA256 校验通过。原学习数据、profile 与验收证据备份于 `~/.dsh/backups/student-legacy-display-20261115-31sw_fbq/`。

<a id="student-full-migration"></a>

2026-11-15：经家长确认，`qiqiStudy` 全部学习记录已迁入格式 2，原数据、profile 配置和原生对话保留；CLI 校验及日常 Web 的编辑、保存、翻页、图形预览和互动课显示验证通过。缺失的历史日期、帮助、目标及答案依据仍待核实，不影响新记录保存。迁移脚本、原始目录与完整性证据：`~/.dsh/backups/student-full-migration-20261115-12fo9mjy/`，最终结果见 `evidence/final-integrity.json`。

<a id="student-profile-migration"></a>

2026-11-15：Student 改由独立`student`profile（3084）启动；20份历史会话完整保留，学习档案及账号字节不变，日常Web与creative移除Student。服务管理、登录启动及浏览器验收通过；备份：`~/.dsh/backups/student-profile-migration-20261115-me2r3aej/`。

2026-11-15：自媒体工作台[v2.7.0-winter.8](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.8)统一原生状态查询，已发布、更新市场；200项全量及6项定向测试通过。发布备份：`~/.dsh/backups/media-desk-native-state-20261115-64wegg9x/`。

2026-11-15：MediaDesk拆分至独立`media`profile（3085），日常`web`移除插件；5个原生会话、164个内容文件及其他依赖与补丁保留。启停、重复启动保护和登录启动尊重手动停止验证通过。迁移备份：`~/.dsh/backups/media-profile-migration-20261115-eemd1snw/`。同日，自媒体工作台[winter.9](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.9)改进作品编号、读取上限和策划纠错提示；17项定向测试、语法、构建与规范检查通过，未重跑真实模型。市场及独立`media`远程更新，浏览器确认两个组件运行；Notes正文不变，启动恢复更新回执、完成时间及会话缓存。备份与完整性证据：`~/.dsh/backups/media-desk-tool-feedback-20261115-jfabe1v1/`。

2026-11-16：Writer [v0.2.1](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.1) 已发布并更新市场；工作台默认定位原生 `novels` 工作区，按既有目录结构发现 12 个作品候选，并只列出同工作区的 Writer 会话。`web` 与 `headless` 已从远程标签安装并重启 Web。

- 类型检查、构建、229 项测试和桌面 DSH 验收通过；包 SHA-256：`3ecf4f241a9703b367fd61010884e7cbfe3e31443be082d3ec0b2431600a6765`。
- 备份：`~/.dsh/backups/writer-release-0.2.1-20261116/`。窄屏 Ego 验收受本机 token 重定向阻断，未声称通过。

<a id="writer-0.2.3"></a>

2026-11-17：Writer [v0.2.3](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.3) 已合并 `main`、打标签发布并加入市场；日常 `web` 从 `v0.2.1` 升级到该远程标签，`headless` 仍为 `0.2.1`。扫描写作项目时跳过不可读或缺少长/短篇标记的候选目录，不再把这类目录列为作品或追加扫描错误。类型检查、构建、242 项测试与 16 项文档检查通过；`--dump-config` 合成保留用户的 `gptImageBaseUrl` 补丁，其他直接依赖与用户补丁不变。Release 包 SHA-256：`30d76416423413c77a2640b5f2adf3c3e58e685c396f5b23cd758e00f50aff41`。备份：`~/.dsh/backups/writer-release-0.2.3-20261117-220544/`。Web 重启后浏览器验收通过：工作台正常打开，`novels` 工作区 12 个项目、5 个拆文库与 3 个扫榜照常列出，未出现扫描错误提示。

<a id="writer-0.2.4"></a>

2026-11-18：Writer [v0.2.4](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.4) 已发布并更新公开市场，独立 `writer` profile 从远程标签安装，3086 服务重启后浏览器显示两个组件运行中。写作入口使用原生对话与右侧写作栏，独立小说创作工作台已移除。现有会话、文件树与文稿预览验收通过。类型检查、构建、233 项测试、16 项文档检查和 3 项规范检查通过。隔离 DSH 另验证模型完成后自动刷新、脏稿保留、保存与窄屏明暗主题。3,586 个历史与书稿文件中，3,585 个逐字节一致，当前会话保留原始字节并追加一条 `session/end-seed`。用户配置与其他直接依赖保留。Release 包 SHA-256 为 `d2b295c64149fb5c4682098a6ffa48014d89ffebffd7385e6162c5b8ba04ea06`，公开下载校验一致。备份与证据位于 `~/.dsh/backups/writer-release-0.2.4-20261118-e16l6qtv/`。

<a id="writer-0.2.5"></a>

2026-11-19：Writer [v0.2.5](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.5) 修复写作栏 Markdown 表格预览，已发布并更新公开市场。独立 `writer` profile 从远程标签升级，3086 服务重启；浏览器确认扫榜文稿中的两张表格渲染为表格，列对齐和横向滚动正常。类型检查、构建、234 项测试、16 项文档检查和 3 项规范检查通过。3,586 个会话、文稿和书稿文件升级前后逐字节一致，其他直接依赖与用户配置保持不变。Release 包 SHA-256 为 `646ec5f532e408e8f9addfc3863beb79d4fe4948d3600a790061bada42753c05`。备份与验收证据位于 `~/.dsh/backups/writer-release-0.2.5-20261119/`。

<a id="media-desk-winter10"></a>

2026-11-19 发布 Media Desk [v2.7.0-winter.10](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.10)，公开市场和本机独立 `media` profile 均已更新。复盘只反映已提交的编辑。在 100 篇稳定作品的回归测试中，单篇进度读取只打开目标正文。207 项插件测试、语法检查、客户端构建和 3 项规范检查通过。3085 服务重启后，浏览器硬刷新加载了五个视图入口，并打开了复盘页。升级前后的 25 篇作品记录、102 个 Notes 文件和 3 个 profile 数据文件逐字节一致。启动恢复清理了一条已有回执的停机日志，该日志不含作品修改。配置、数据备份及验收证据位于 `~/.dsh/backups/media-desk-winter10-20261119-123716-8YzfTJ/`。

<a id="writer-0.2.6"></a>

2026-11-19：Writer [v0.2.6](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.6) 已合并 `main`、发布并更新公开市场。DSH 技能入口使用原生写作角色和当前生效技能目录，其他宿主的部署、Dashboard 与更新说明按需读取；朱雀设置释放订阅并忽略过期凭据响应，保存按本次回读确认；技能状态检查在单次调用中复用目录哈希。

- 类型检查、构建、237 项测试、16 项文档检查和 3 项规范检查通过。隔离 DSH 验证设置保存与重载、书稿编辑保存及 GFM 表格预览；外部模型与朱雀 API 未实测。固定输入的技能状态调用中位耗时从 243.00 ms 降至 125.44 ms；9 个 skill 入口字符数减少 27.3%，不等同于 token 数。
- 首次安装时，WSL 的既有 `web` profile 从远程标签由 `0.2.2` 升级到 `0.2.6`；随后已拆分至 [Writer 独立 profile](#writer-profile-wsl)。当时 3080 服务重启后，浏览器确认两个组件运行、发布来源和写作设置加载正常。隔离与日常远程安装均核对 542 个运行文件和技能文件与发布提交一致；公开 Release 下载校验一致。macOS 的独立 `writer` profile 未在本轮更新。
- 配置、凭据、附件与会话完整保留，其他直接依赖及用户补丁不变。61 个受保护文件中，60 个逐字节一致，一个空会话保留原始记录字节并追加一条 `session/end-seed`；完整解压所有 Zstandard 帧后核验。当前 WSL 工作区未发现书稿，日常验收没有创建测试作品。
- Release 包 SHA-256 为 `d5fa1cad2878c5f2ce46f517a7a71ed44d2d333ec8bec28edbcac0e8a81357a9`。配置、数据备份及验收证据位于 `~/.dsh/backups/writer-release-0.2.6-20261119-044158-9p8ysugv/`。

<a id="writer-profile-wsl"></a>

2026-11-19：WSL 的 Writer 已从 `web` 拆分至独立 `writer` profile，默认写作模式，端口为 3086，使用固定远程 `v0.2.6`。`web` 已移除 Writer，其他直接依赖及用户补丁保持不变。原有一个 Writer 会话及工作区登记迁入 `~/.dsh/profiles/writer/data/`，书稿工作区路径保留。

- 浏览器确认原对话、写作栏、远程版本与两个运行组件正常，3080 插件列表不再包含 Writer。服务重复启动复用已有进程，`dsh-sre restart writer` 只重启 Writer；已启用 systemd 用户服务自动启动，手动停止标记沿用现有机制。
- 59 个受保护文件逐字节一致，包含迁移会话、其他会话、附件、凭据和原有配置；工作区登记仅转移该 Writer 会话。安装的 542 个运行文件和技能文件与发布提交一致，浏览器没有页面错误。备份与证据位于 `~/.dsh/backups/writer-profile-migration-20261119-045433-xqtdw4ml/`。
- 服务源码新增 `dsh-writer` 并接入统一管理。Python 语法、Shell 语法、Linux 安装与 macOS 控制器保留验证通过；本轮未修改插件源码。macOS 仍使用已有 Writer 控制器，本次只验证安装器保留行为，未在 macOS 启停服务。

<a id="writer-0.2.7"></a>

2026-11-19：Writer [v0.2.7](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.7) 已合并 `main`、发布并更新公开市场。技能按作者授权范围改稿，默认直接修改目标正文；短篇拆文保留同源续跑进度，按源文记录结构与反转，构思按当前题材和阶段选读资料。短篇精修与交付沿用用户指定的逐节字数下限，封面命令读取配置的密钥变量，DSH 导入直接进入原生流程。

- 类型检查、构建、28 项定向测试、16 项文档检查和 3 项规范检查通过。隔离命令样例验证局部改稿范围、精修后的逐节字数门槛，以及封面两条通路的默认、自定义和缺失凭据；封面验证使用模拟接口，未运行真实模型写作或付费生图。
- WSL 独立 `writer` profile 从远程固定标签升级，3086 服务重启后，浏览器确认版本、远程来源和两个运行组件。隔离与日常 DSH 原生技能发现均确认 15 个技能，日常安装的 541 个运行及技能文件与发布提交一致；97 个受保护的数据和配置文件逐字节保留，其他直接依赖与用户补丁不变。macOS 的 `writer` profile 未在本轮更新。
- Release 包 SHA-256 为 `e3daee2c5c90d83826efa74b5e5311334b3d131d77917dbd24ed67851ddf00ff`。发布包和本机验证材料位于 `.artifacts/writer-release-0.2.7-20261119-063341/`。
