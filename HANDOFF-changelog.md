# dsh-creative 本机环境变更记录

本文件从 [HANDOFF.md](HANDOFF.md) 拆出，按时间记录 macOS（`/Users/winter/dsh-creative`）与 WSL（`/home/maiscrm/projects/dsh-creative`）的全局 DSH 安装、profile 与验证环境的变更；主机差异在对应记录中说明。主文档的[第 12 节](HANDOFF.md#12-本机环境变更记录)是索引。

2026 年 9–10 月记录见[历史日志](archive/docs/HANDOFF-changelog-2026-09-10.md)，11 月 6—7 日记录见[月初日志](archive/docs/HANDOFF-changelog-2026-11-06-07.md)。

<a id="dsh-rc5-all-plugins"></a>

2026-11-25：WSL 全局 DSH 升至 `0.2.2-rc.5`，9 个插件新增固定发布标签并更新市场。`web`、`story`、`superagent`、`antfarm`、`student`、`media` 均从远程固定提交安装、重启并通过浏览器组件检查，profile 补丁与其他依赖保留；macOS 未更新。修复 Antfarm／Shadow Mind 的子会话激活接口、技能查看器声明文件打包与原生测试的多帧日志读取。类型检查、构建、插件测试、父仓库测试、文档与规范检查通过；Oh Story 合并提交通过 Linux、macOS、Windows CI 及三条宿主浏览器检查。Media Desk 完整测试的两个超时用例分别重跑通过。Superagent 仍需选择 GitHub 仓库，未执行真实模型或付费媒体验收。备份与证据：`~/.dsh/backups/all-plugins-rc5-20261125-134131/`。

<a id="story-profile-wsl"></a>

2026-11-25：WSL 将 Oh Story `0.1.31` 整体迁至 `story:3081` 并启用登录启动，旧 `writer:3086` 停用并禁用登录启动。143 个数据文件完整保留，176 个书稿文件不变；历史会话仅更新缓存并追加恢复日志。合成配置、认证页面、四工作台入口、历史会话及四种启停组合验证通过，未调用模型或付费媒体。备份与证据：`~/.dsh/backups/story-profile-wsl-20261125-091457/`。

<a id="superagent-media-desk-integration"></a>

2026-11-23：macOS 日常 `superagent` profile 通过配置层加载已安装 Media Desk `2.7.0-winter.14` 的 `media-desk` 与 `image-generation` skill；团队提示词 revision 2 提供 `dsh-superagent-media-desk` 接入指引。主会话和执行器均能发现这些技能，业务操作明确使用 Media Desk 的包根目录适配器、独立数据 home、Wiki 与服务 URL。日常 Superagent 重启及全部健康检查通过，默认模型保留 `me/group/never-stuck`，两个插件继续使用远程发布包。

独立资料库中的真实模型工单完成了模拟飞书请求、作品创建、成稿接收、测试封面生成与媒体接收，执行器报告 ready，最终模拟飞书回复包含作品 ID、正文绝对路径及两项回执。制作请求为 accepted，成稿受理回执恰好一项，本机模拟图片服务恰好调用一次。日常接口读取现有 4 件作品成功，241 个 Notes 文件逐字节保持不变；本轮未执行付费生图，也未向真实飞书发送验收消息。

Superagent 类型检查、构建和 6 项文档测试通过，双语部署指南及配置示例已补齐。配置、提示词与验收材料位于 `/Users/winter/.dsh/backups/superagent-media-desk-integration-20261123-133833/`，完整工单结果见其中的 `smoke-result.json`。

<a id="media-desk-skill-release"></a>

2026-11-22：Media Desk [v2.7.0-winter.14](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.14) 已发布并更新公开市场，固定提交为 `9d6abde17df431a8844a45098c88635ed2c33a3c`。共用业务 skill 组织创作与规则学习，Agent 直接修改 Notes；同包 CLI 只读取与校验。生图使用独立全局 skill，配置沿用 `~/.config/image-generation/.env`。有效规则文件由插件登记为待审，用户启用后供下一次制作固定版本并逐条自检。

隔离远程安装验证了真实 DSH Web、86 个运行文件、npm CLI 符号链接、离线提案读取和插件登记启用。macOS 日常 `media` profile 已从远程固定提交安装，3085 重启与浏览器硬刷新通过；两个全局 skill 和 `~/.local/bin/media-desk` 指向该安装包。209 个 Notes 文件逐字节保留，4 件作品、3 条规则、原生请求记录和 profile 用户补丁保持不变。启动恢复清理一条已有受理回执的保存日志，更新三件作品的完成时间，Session 保留原字节并追加恢复数据；旧助手模型设置被移除，原生会话继续使用自己的模型。

229 项完整插件测试、语法检查、构建、16 项文档与 3 项规范检查通过；远程验收发现 `.13` 的 npm 符号链接入口未执行，`.14` 修复后另有 8 项针对性检查通过。`.13` Release 已注明使用修订版，标签未覆盖。公开包 SHA-256 为 `5f343c5fffd7ec641ea50d39483f9f0471faf722f1428f7761a02f1cca3f10d2`，下载校验一致。本轮未执行付费生图。备份与证据：`/Users/winter/.dsh/backups/media-desk-winter14-20261122-8nx0e9wp/`。

<a id="media-desk-direct-files"></a>

2026-11-21：Media Desk [v2.7.0-winter.12](https://github.com/winterhuan/dsh-media-desk/releases/tag/v2.7.0-winter.12) 已发布并更新公开市场，固定提交为 `837ee85afb4a8827e850e2808989177b5bf5d571`。日常改稿由 Agent 原生文件工具直接写入，`media_desk_validate` 只校验已保存文件的格式和登记身份。直接编辑立即生效，失败轮次不会回滚，也不生成业务撤销条目；结构化成稿与媒体任务沿用原有流程。

macOS 独立 `media` profile 已从远程固定提交安装，3085 重启与浏览器硬刷新验收通过，五个工作台视图入口及原有作品正常显示。隔离远程安装和本机安装均核对了 62 个运行文件与发布提交一致。原有 179 个 Notes 文件逐字节保留，配置未变，会话日志保留原始字节并追加一条 `session/end-seed`。启动恢复清理了一条已有回执的停机日志，并更新生产完成时间与回执。语法检查、客户端构建、210 项插件测试、16 项文档检查与 3 项规范检查通过。

Release 包 SHA-256：`f77a724f4d838066b19861a7b792052056d488d83ff6bae7565e131e0b2fe064`，公开下载校验一致。配置、数据备份与验收证据位于 `~/.dsh/backups/media-desk-winter12-20261121-7_t_q995/`。

2026-11-21：macOS 的 Story／Writer 拆分及 Oh Story `0.1.31` 固定 Tag 安装，见[当日迁移与安装记录](archive/docs/HANDOFF-changelog-2026-11-21.md)。

2026-11-20 Shadow Mind `0.2.2`／`0.2.3` 发布与远程安装：

- [v0.2.2](https://github.com/winterhuan/dsh-shadow-mind/releases/tag/v0.2.2) 先发布原生审查工作台，[v0.2.3](https://github.com/winterhuan/dsh-shadow-mind/releases/tag/v0.2.3) 随后补齐导出 API JSDoc 并修正随机种子回归测试；市场最新版本固定到 `17aa2e79f095e5827baea9118185e2653e29f4e6`。
- `web` profile 已从远程提交安装 `0.2.3` 并完成服务重启、配置回读和 45 KB Web HTML 健康检查；类型检查、Host/Client 构建、29 项测试、包检查与父仓库 hygiene 通过。包检查保留一个 Client CJS/ESM 格式提示。

2026-11-08／09：Writer、Shadow Mind 与插件包名修正见[月初发布记录](archive/docs/HANDOFF-changelog-2026-11-08-09.md)。

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

<a id="writer-0.2.8"></a>

2026-11-19：Writer [v0.2.8](https://github.com/winterhuan/dsh-writer/releases/tag/v0.2.8) 已合并 `main`、发布并更新公开市场。七个共享角色源文生成 Claude、Codex、OpenCode、ZCode 和 DSH 定义，Antigravity 继续使用部署生成器；78 组共享资料和脚本通过明确映射维护，共检查 143 个生成产物。技能仍按任务条件渐进读取资料，安装包不运行开发生成器。DSH 包内角色使用原生生成提示词，项目定制模板继续优先，选定来源失败时直接报告。

- 实现阶段类型检查、构建、33 个文件中的 263 项测试、16 项文档检查和 3 项规范检查通过；最终发布版本另完成 34 项生成、角色、原生委派与挂载测试，以及类型检查、构建和文档规范检查。
- 发布包的 474 个技能文件及可执行权限与工作区一致，开发源文和生成器不进入安装包。隔离 profile 从远程固定标签安装后，546 个受 Git 管理的运行与技能文件与发布提交一致，七个 DSH 角色均能加载；Web 启动无组件激活警告，认证后返回 200。第三方宿主权限执行、真实模型的按需读取和付费调用未在本轮验收。
- 公开市场索引已回读确认 `0.2.8` 和固定安装来源。本轮只发布并作隔离安装验证，日常 `writer` profile 继续使用 `0.2.7`，未重启日常服务。
- Release 包 SHA-256 为 `0ce56ef089e59cc8f7558ed7abe2e6a1a0b36c4a242bd4d24a362d8edb0a144c`。发布包、检查日志与隔离验证材料位于 `.artifacts/writer-release-0.2.8-20261119-121045/`。

<a id="writer-oh-story-profile"></a>

2026-11-20：两端[写作服务](HANDOFF.md#independent-service-profiles)统一为同一远程发布包，旧源码归档于 `archive/dsh-writer/`。两端各717个安装文件一致；浏览器、脚本语法与安装器备份验收通过。默认标准模式，旧会话兼容声明一致。

原始会话记录与书稿均保留；两端各一个原有空会话追加模式选择记录并刷新缓存，本机另追加会话初始化结束记录。未发送模型请求；WSL既有模型列表认证失败仍存在。临时代理与验收隧道已关闭。

本机备份及浏览器证据：`~/.dsh/backups/writer-oh-story-20261120-065322-sg1o_12d/`；WSL备份：`~/.dsh/backups/writer-oh-story-20261120-070756-4u23e7vk/`。其中 `evidence/` 保留配置、安装文件和数据差异核验。

<a id="new-api-removal"></a>

2026-11-20：WSL 日常 `web` profile 已卸载 `@winterhuan/dsh-new-api`，服务重新启动并通过 HTTP 就绪检查。浏览器确认已安装列表和设置菜单均无 New API 管理台，原接口返回与不存在的接口相同的响应；其余四个插件保持安装，43 个其他 profile 配置及用户补丁文件的校验值不变。本轮未删除业务数据、GitHub 仓库或历史 Release。

父仓库已移除 `plugins/dsh-new-api` 子模块登记和当前集成文档入口。市场 `gh-pages` 已发布下架改动，公开索引回读为 8 个条目，不含该插件，其余条目不变。

<a id="short-drama-experiment-removal"></a>

2026-11-20：父仓库移除 `plugins/dsh-short-drama` 独立界面试验的子模块登记和当前文档入口，短剧工作台统一由 Oh Story fork 维护。[独立插件提案](.agents/notes/rejected/architecture/2026-11-08-short-drama-canvas-workbench.zh.md)转为拒绝记录，保留原提案及未实现范围，不将媒体运行时设想记为已交付能力。远程仓库与 Git 历史保留。本机日常 profile 和市场均未安装该插件，本轮未修改安装配置或重启服务。

<a id="workbench-provider-wsl"></a>

2026-11-20：WSL 的 `media`、`student`、`superagent`、`antfarm` profile 补入 `me` provider，复用 `web` 已有的 `https://winterhuan-workbench.hf.space/v1`、`ME_API_KEY` 引用与四项文字模型配置。`web`、`writer` 保留已有配置，六个服务均通过实时 provider 注册回读；原默认模型和其他 provider 保留。配置自动加载，无需重启。

Media Desk 的 HTTP 生图设置使用相同网关、`loomy/qwen-image-3.0-pro`、`1024x1024` 与 Base64 返回。直接调用曾返回有效 PNG；插件随后两次调用均收到 Loomy 上游账号暂不支持图片生成的 406，另测 Seedream 路由也是 406，MiniMax 路由返回 502 无图片。已保存配置不代表生图服务稳定可用。备份、图片与验证证据位于 `~/.dsh/backups/workbench-provider-20261120-110804/`。

<a id="plugins-sync-20261120"></a>

2026-11-20 源码、市场与 WSL 本机安装同步：

- 发布 Student `0.2.5`、模型设置增强与技能查看器 `0.1.9`、Antfarm `0.3.4`、Media Desk `2.7.0-winter.11`；各仓库源码、预构建包、新标签与 GitHub Release 已推送，公开附件 SHA-256 校验一致。Media Desk 分页测试显式使用 120 秒内部等待，完整并发测试通过。
- 市场索引已部署至 GitHub Pages，保留历史版本并补入 Shadow Mind `0.2.1`，共 9 个插件。9 个公开固定提交的包名、版本及组合声明通过校验，公开索引与发布索引完全一致。
- WSL 的 `web`、`student`、`antfarm`、`media` 从固定远程 Git 提交更新并重启，隔离安装和日常真实浏览器均验证版本、运行组件及无页面错误；隔离 Media Desk 另验证文章、关闭自动生图、中英文与明暗主题。全部 9 个插件的运行文件与发布内容一致。Oh Story 沿用 `0.1.28`，其发布清单核对源码提交与预构建提交；Writer、Superagent 未重启，macOS 与云端未更新。
- 全仓类型检查与构建通过；Media Desk 的 `typecheck` 仅为 JavaScript 语法检查。各插件及父仓库测试合计 2,349 项通过；Media Desk 首次完整测试超时后，修复内部等待预算并完整重跑 208 项通过。
- 33 个配置文件字节不变，profile 清单仅变更目标依赖来源。304 个数据文件中 288 个字节不变，5 个会话仅追加且原字节完整保留，其余 11 个为缓存、所有权锁、SQLite 与启动状态；25 篇作品的中英文共 50 份正文及引用快照哈希一致，Antfarm 数据库完整性通过。未调用付费模型，Superagent 待配置仓库和 Shadow Mind 空职责目录保持现状。

发布包、检查日志、浏览器截图与完整性证据位于 `.artifacts/plugin-sync-20261120/`，最终比对见 `installation-verification.json`。


## Student 0.2.8：单元课程与独立内容审查（2026-11-27）

Student 主线提交 `b65182f30462e5fecee6d1a39cd19460100ef246`，固定标签 `v0.2.8`，兼容 DSH `0.2.2-rc.5`。包含单元/课节目录、完整课与复习小课、短按钮意图、原任务直接轮询、显式旧空活动清理，以及生成前后独立内容审查和播放凭证验证。安装不执行学业数据清理。

513 项测试、类型检查、Host/Client 构建、原生工具和反馈集成、文档与 hygiene 检查通过。真实模型回归检出两处已报告错误，正确对照通过、歧义对照拒绝；真实生成课出现改题与互动文案错误时已阻止播放。完整真实作答闭环和性能验收尚未通过，原生保存仍慢；用户在知悉这些限制后明确要求发布并更新日常 3082，发布不代表单元课程 spec 全部验收完成。

发布备份与安装验证保存在 `~/.dsh/backups/student-release-0.2.7-20261127-201526/`；开发验收报告为 `.artifacts/student-unit-implementation-20261127/verification.md`。本机 macOS Student 使用 `student` profile 和 3082，由 `dsh-sre` / `dsh-student` 管理。

日常 `student:3082` 已从上述远程固定提交安装，服务重启及浏览器硬刷新通过；插件详情显示 0.2.8、两个组件运行中，原题「幕」及回答/评价保留。184 份学习与会话文件中 183 份逐字节不变；原会话完整保留 296 条记录，仅追加一条 `session/end-seed`，其他 profile 清单设置不变；公开市场已回读确认 0.2.8。0.2.7 因新增文件术语检查问题被 0.2.8 替代，保留原标签并标记为预发布。


## Student 0.2.10：复用已有教材（2026-11-27）

材料查询与学习指引优先复用教材和已核实知识点；校内同步先确认是否同书和当前课文。正式发布、市场及日常3082更新完成，浏览器确认版本和两个运行组件。516项测试与构建、文档、规范检查通过，最终查询另通过48项测试及真实模型选择验证；整课与性能限制仍保留。

184份保护文件中183份字节不变，原会话完整保留，仅追加结束标记。发布、材料选择及备份证据位于 `~/.dsh/backups/student-release-0.2.10-20261127-214247/` 和 `.artifacts/student-material-selection-20261127/`。
