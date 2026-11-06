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
