# dsh-creative 开发交接

最后更新：2026-10-31。

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

本仓库是 DeepSeek Harness（DSH）的外部插件仓库，包含四个独立创作插件、学生学习插件、项目默认模式插件、Skill Viewer、模型设置增强及配套客户端；[子系统索引](docs/subsystems/README.zh.md)按包列出职责与信任边界。

2026-10-31 DSH 升级到 `0.2.1-rc.5`：现役包与根的 `@deepseek-ai/dsh-*` 依赖、`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`、typert 补丁同步到 `0.2.1-rc.5`，子模块移到 `dsh-v0.2.1-rc.5`（`b830ec950f`）；`@deepseek-ai/cordis` 配套范围仍为 `~4.0.5`。第 8 节四个 rc.3 同步脚本与上游对照仅本地改动差异，更新复制版本标注。archive 下旧包与迁档删档未纳入本次提交。install 后未在本提交内跑全量 typecheck/build/test。

2026-10-30 学生插件全面改造：取消时长/休息限制与 `timeNotice`；内置语数英习题知识库与工作区真题沉淀；复习曲线改为 1/7/16/35 天；西蒙四步、费曼小老师、任务微步骤与探究疑问；知识地图逻辑树；家长档案就地更新与面板自动确认；错题本面板增删改。见[全面改造](.agents/notes/implemented/feature/2026-10-30-student-overhaul.zh.md)。

2026-10-29 小说模块边界见[架构笔记](.agents/notes/implemented/architecture/2026-10-29-story-architecture-structure.zh.md)。命令名、JSON 与门禁缺省未改。

2026-10-28 学生学习：OpenMAIC 课记在 `.study/openmaic-lessons.json`，由助手 shell 生成，Host 不代理 `:3000`。兴趣标签 3–8 个，未保存时用示例；今日建议先走当前目标，到期错题最多清 2 条。见[互动课](.agents/notes/implemented/feature/2026-10-28-student-openmaic-lessons.zh.md)与[兴趣情境](.agents/notes/implemented/feature/2026-10-28-student-interest-context.zh.md)。

2026-10-25 六个小说 Skill 与 CLI 对齐：缺键的 `rule_audit` 与 `facts_diff` 为 `required`，schema 6 只挂事实账本摘要，`project check` 报告 `facts` 缺口。见[Skill 同步](.agents/notes/implemented/process/2026-10-25-story-skill-cli-sync.zh.md)。

2026-10-25 小说章末收束：`facts extract` 从带标签的细纲和正文写出 `草稿/事实/第NNN章.claims.json`；`chapter finish` 在一次 JSON 里做可选审稿校验、主张 diff、提交、入账和过期检查。提交失败不写账本，入账失败不回滚正文。`project context --profile lite`、`project gates`、卷纲范围 hint、节奏卡标题别名、细纲出场名单 hint 一并落地。见[章末收束](.agents/notes/implemented/feature/2026-10-25-story-chapter-finish.zh.md)。

2026-10-25 学生状态读路径缓存与掌握度口径统一：读取按文件版本缓存已校验状态，作答证据单遍索引、目标改查十二图全局索引，一次请求只算一遍洞察；轮询可携带修订号，未变化时只返回时间状态（3000 作答合成态完整 dashboard 约 17ms、未变化轮询约 0.1ms）。跨年级摸底与本期洞察共用同一掌握度规则，修复此前分叉；`queryStudy` 未知 kind 显式报错。见[读路径决策](.agents/notes/implemented/simplification/2026-10-25-student-read-path.zh.md)；包内 129 项测试通过。

2026-10-25 学生练习单改为网页渲染与浏览器打印：删除 Host 端 `src/worksheet.ts`（pdfkit）、`/student/worksheet.pdf` 与 `/student/print` 接口及随包 NotoSansSC 字体（约减 17 MB）；新增客户端 `src/client/worksheet-view.tsx`，复用屏上题图的 SVG 渲染整张卷，预览后经浏览器打印对话框打印或存储为 PDF（Windows 可打印）。无 `kind` 旧卷的命名启发式改由客户端按 `sources` 判定；schema 不变。双语 README、SKILL、questions、subsystem 文档、i18n 与 Agent Note 已同步，见[练习单网页化](.agents/notes/implemented/simplification/2026-10-25-student-worksheet-html.zh.md)；包内 126 项测试通过，本机验证见第 12 节。

2026-10-24 DSH 升级到 `0.2.1-rc.3`：11 个插件与根的 `@deepseek-ai/dsh-*` 依赖同步，子模块移到 `dsh-v0.2.1-rc.3`，typert 补丁重做；typecheck、build 通过，全量测试 1015 项里 1011 通过、3 跳过，唯一失败是 story 的设定符号链接用例（测试指向 macOS 不存在的 `/etc/hostname`，返回 ENOENT，与版本无关）；web 服务已重启，页面与 10 个 `@winterhuan` 客户端 bundle 经 HTTP 请求验证返回 200，未做浏览器交互验证。

2026-10-25 思考能力简化为批量开启：本包思考能力改为与图片输入对称的纯批量入口，下拉选择标准级别（关闭空值加低/中/高，参数值同档位名）、不支持或恢复继承，勾选同一提供方下的目标模型应用；去掉单模型选择、逐档勾选与参数映射，逐档编辑留在原生模型列表。pi-ai 之外的提供方不显示思考分组，图片批量不变。文案、README、子系统文档与 i18n 记录同步。

2026-10-24 模型设置增强新增图片输入批量操作：提供方卡片新增「图片输入」批量控件，选择仅文本、文本和图片（pi-ai 提供方还可恢复继承），勾选同一提供方下的目标模型写入草稿，与思考能力、重试修改一起保存；单模型开关仍在原生模型列表。pi-ai 写 `input`（或 `modelOverrides` 覆盖项），恢复继承移除字段；deepseek 写 `inputModalities`，改仅文本时同时移除 `imagePixelBudget` 与 `imageMaxBytes`。文案、README、子系统文档与 i18n 记录同步；`typecheck`、`build`、包内 73 项测试、文档与规范检查通过；全量 1011 项通过（story 一例为本机既有失败）。本机 web profile 已重新构建，重启 DSH 并硬刷新后生效；未在真实浏览器验证，未调用真实模型。

2026-10-25 小说追踪 schema 6 只挂事实账本摘要，条目仍在旁路文件。`rule_audit` 与 `facts_diff` 缺省为 required；旧书用 `project migrate-gates --legacy-off`。见[事实账本](.agents/notes/implemented/feature/2026-10-19-story-fact-ledger.zh.md)。

当前实现是独立的 `@winterhuan` 插件仓库：

- 依赖 npm 上发布的 DSH `0.2.1-rc.5`，像普通第三方插件一样安装到 DSH 里；依赖声明、锁文件与已安装版本一致。
- 不依赖、也不修改上游源码。`upstream/` 子模块只作代码参考，以及给客户端单元测试提供同版本源码（原因见[问题 10](#问题-10单元测试dsh-发布的客户端包在-node-里无法加载)）。
- 11 个包都位于 `@winterhuan` scope 下。
- 包目录采用 `packages/<组>/<包>` 两层布局。

2026-10-18 小说设定库检索：`project lookup` 只读 `设定/`，精确名称和别名优先，一次不超过 16 KiB。命令见[小说包说明](packages/creative/story/README.zh.md)。未在真实 DSH 浏览器验证，未调用真实模型。

2026-10-17 小说伏笔与人物健康检查：`project query --kind health` 只读四类风险，默认阈值 30／20／40。命令见[小说包说明](packages/creative/story/README.zh.md)。未在真实 DSH 浏览器验证，未调用真实模型。

2026-10-17 DSH 升级到 `0.2.1-rc.2`：11 个插件依赖声明同步，插件版本不变；配套与拷贝见第 6、8、9 节。install、typecheck、build 通过；全局 dsh 仍 `0.2.1-alpha.2`，未在真实 DSH 验证。

2026-10-17 知识点可考事实：语文摸底只靠一句定义时，会写出课页里没有的内容（《场景歌》被写成“一片沙滩”，葡萄干被写成“阴房”，《植物妈妈有办法》漏掉石榴）。知识点新增可选 `facts`（2–8 条、每条最多 240 字）。`kind=curriculum` 与 `kind=elements` 随知识点返回，工作台在知识点下列出；出题说明要求答案能在 `facts` 里核对，没有 `facts` 的知识点只用定义和例子。二年级上册语文 39 个知识点已按随包人教课页写上事实，并改正与课页矛盾的定义和例子。其余十一份地图的每个知识点也写了可考事实：数学是算法和例子，语文是这一课可以核对的内容。英语二年级上册前四单元按朗读纸、后六单元和一年级四个单元按已读原句核对，其余英语单元仍是词义。出版社和册次可以不同，只收与该知识点同一个概念的内容。新题另写，不照抄原题。学习目标 ID 不变。决策见[知识地图事实](.agents/notes/implemented/feature/2026-10-17-student-knowledge-facts.zh.md)。学生包 7 个文件 110 项测试通过，`typecheck`、文档 16 项与规范 3 项检查通过。未调用真实模型，未在真实 DSH 浏览器打开工作台。

2026-10-17 题图与课本对齐修正：核对北师大版二上 236 页课本文字层与一二年级知识地图后，修正三处与课本不一致的配图。其一，`drawSticks` 原画五根一捆，与课本“十根一捆（一捆是一个十）”及数位教学矛盾，改为十根一捆并收紧布局（9 捆 9 根不溢出）。其二，`place-value` 允许 `regroup:'yes'` 退位虚点与 `crossTens`/`crossOnes` 划线同图出现，孩子分不清划的是哪一类，退位减法课本配的是计数器+竖式；schema 加校验——`regroup:'yes'` 时划线必须为 0、`regroup:'no'` 时划线不超画点数，store.ts 加载时把旧 state 里混用图形的划线清零做向后兼容。其三，questions.md 重写题图规则：每种图形写明课本里的固定用法（计数器配退位、竖式配加减计算、小棒配数的组成、点子方阵配乘法意义等），并加硬规则——一题一图、图是全部已知条件题干不复述、`bar-model` 的 `units` 要与数量成比例。新建[题图对齐](.agents/notes/implemented/bug-fix/2026-10-17-student-figure-textbook-alignment.zh.md) Agent Note。根 `typecheck`、`build` 通过；包内 53 项测试通过（含 place-value 混用拒绝、超范围划线拒绝、sticks 渲染）；真实 state.json（24 张卷）迁移后可加载；未在真实 DSH 浏览器验证，未调用真实模型，课本图片层因当前模型不支持图像输入未逐页核对。

2026-10-17 重叠圈修复与语义扩展：家长发现练习卷里"使每个圈里的两个数相加等于圈上的数"印成了集合图且带一个无意义的合计框。两处问题：`drawOverlap` 把右圈独有区的标签画进了左圈右瓣（`cx1 + radius` 而非 `cx2 + radius - gap`），`left`/`right` 标签 100pt 宽互相重叠；`overlap` 文档只写了"集合图"一种用法，schema 还强制 `left`/`right` 非空（"必须写两个集合名"），模型只好把教材的和圈题硬套成集合语义。修复：右圈独有区归位、标签收窄到 62pt 不重叠；`left`/`right` 留空印答案框（求圈上的数本身）；questions.md 写明和圈与集合图两种用法，重叠区的数同时计入两个和。两份 README、中英文 Agent Note 与 i18n 记录同步；printable-figures 测试补和圈形态。根 `typecheck`、`build` 通过；包内测试 53 项通过，全量测试除 `packages/creative/story` 一项在干净树上同样失败的既有失败外全部通过；未在真实 DSH 浏览器验证，未调用真实模型。

2026-10-16 学生练习单图形补全与简笔画兜底：核对一二年级四份数学地图后，图形词汇表从十种扩到二十三种（新增数的分与合、规律条、数墙、方格表、点子方阵、平面图形、立体图形、计数器、厘米尺、方向板、天平、田字格与四线格，钟面扩到 5 分钟刻度），并新增受限的 `sketch` 简笔画兜底（画布高度 40–260，最多 24 笔，坐标范围与越界校验）；questions.md 列全清单并要求优先用专用图形，练习卷提示词与 SKILL 改为指向该清单。决策见[图形补全](.agents/notes/implemented/feature/2026-10-16-student-figure-completeness.zh.md)。

2026-10-16 学生练习单新增重叠圈（集合图）图形：`figure` 词汇表加入第十种 `overlap`（`left`/`right` 是两个集合名，`leftOnly`/`both`/`rightOnly` 写三个区域的数，空标签印答案框，可选 `total` 在两圈下方画括号合计；集合名留空会被拒绝），重叠问题可以出题打印；渲染沿用 pdfkit 矢量绘制，不引入 HTML。questions.md、`worksheet` 工具描述、练习卷提示词与两份 README 同步；printable-figures 测试从实际只画六种补到十种全覆盖（数轴、钟面、小棒一并补上），分两张卷、每张不超过 8 题。决策见[重叠圈](.agents/notes/implemented/feature/2026-10-16-student-overlap-figure.zh.md)。

2026-10-16 学生错题复习规则放宽：家长反馈复习规则太严格（提前做对不算数、答错一次清零），无法坚持。独立答对现在在任何一天都进入下一阶段（同一天最多一阶），下次复习日从做对那天按 1/3/7/14/30 天起算，提前于到期日做对也计入；答错、半对或依赖帮助不再清零，只把下次复习日改回第二天，复习阶段不倒退。`record` 与复习题不再要求错题已到期，可提前复习；巩固卷出题窗口（错题需在明天结束前到期）与「已巩固」判定（第 4 阶段）不变。决策见[复习放宽](.agents/notes/implemented/feature/2026-10-16-student-review-relaxation.zh.md)。根 `typecheck`、`build` 与包内 7 文件 106 项测试、文档 16 项与规范 3 项检查通过；重启 DSH 后按新规则重算历史复习进度。

2026-10-16 学生学习插件增强（出题要素、错因与拍照闭环）：知识地图新增出题要素层（概念常见错法、目标错因/出题要点/变式维度、单元日常侧重，十二份全覆盖，`study_status kind=elements` 按已教范围返回）；新增分科错因词表与错题 `errorType`、`classify-mistake` 归类、变式阶梯（巩固题按复习阶段换数字→情境→说理且必须换题面）、`paperDrafts` 草稿集合与 `paper-draft`/`confirm-paper` 取代 `paper-result`（拍照先存草稿、家长在工作台核对入库）、`worksheet.kind` 与每日小卷/对话听写双入口（新参考 `daily-routine.md`）、理解提醒（派生展示，不落盘不评分）；掌握收紧为近期无依赖帮助或答错，薄弱点新增反复错因理由与按科目错因汇总，`review-sheet` 升级为 picks+薄弱目标补题并按学校进度过滤。配图联合扩到九种（数轴、钟面、小棒、百数表窗口、结构化钱币），修复图形截断并显式拒绝未知图形。路由白名单补 `school-progress`（修复家长「学校进度」表单 403）、`classify-mistake`、`confirm-paper`。工作台新增「待核对转录」、错因下拉与归类、今日学科环节卡与提醒卡。决策见[出题要素](.agents/notes/implemented/feature/2026-10-16-student-error-elements.zh.md)与[拍照闭环](.agents/notes/implemented/feature/2026-10-16-student-photo-grading.zh.md)。

2026-10-16 模型设置增强重试分类扩展：真实 DSH 中一次运行以「Service temporarily unavailable」失败且未重试；该文案不含状态码，被 pi-ai 适配器归入兜底 `PI_AI_ERROR`，不在默认可重试集合，也不在原三类可选项内。`packages/client/ui-settings-model-options` 现为 pi-ai 提供方增加「重试未分类错误（PI_AI_ERROR）」开关（默认关闭），开启后加入该提供方 `retryPolicy.retryableCodes` 并沿用次数上限；deepseek 不产生该码，不显示。中英文案、双语 README、i18n 记录与测试同步更新。`typecheck`、`build`、包内 3 文件 60 项测试、文档 16 项与规范 3 项通过；未在真实 DSH 浏览器验证界面，未调用真实模型。

2026-10-14 教材目录内置：语文和英语的一年级上下册、二年级上册知识地图改为按家长确认的教材目录列出单元和课名（含语文园地、英语各单元栏目和附录）。数学二年级上册的购物单元名为欢乐购物街。三科二年级下册不在这份目录里，仍用先前的学习框架。随包人教语文、北师大数学课页与地图不是同一份目录。

2026-10-14 学校进度界线：家长确认教材后，可用 `school-progress` 标明学校教到的地图单元。今日建议里的到期错题、薄弱点、摸底和新课停在该单元及之前；跟上学校只在当前单元出新课，先补缺则先练已教过的缺口，复习周不开始新目标，预习最多下一单元。没有这条记录时仍按整册建议。更换教材保留已确认的单元。决策见[学校进度](.agents/notes/implemented/feature/2026-10-14-student-school-frontier.zh.md)。

2026-10-13 学生学习工作台与沪教版数学目录：数学一年级上下册、二年级上册的内置单元和知识点改为对齐沪教版《义务教育教科书·数学》（五四制·2024）册次目录（一年级上册含进位加法，一年级下册为退位减法、100 以内加法、长度与身体尺、数学广场，二年级上册为 100 以内减法、欢乐购物、表内乘法、方位与分类；表内除法不在二上）。二年级下册仍用先前的学习框架。工作台改为粘性标签栏、科目分段、今日建议主卡片、单元进度条、可横向滚动的知识关系图，以及主按钮样式。未在真实 DSH 浏览器中验证本次界面。

2026-10-12 学生知识地图与薄弱点：`packages/education/student` 内置一、二年级上下册语文、数学、英语十二份知识地图（`knowledge/curriculum/*.json`，154 个知识点、87 个学习目标、96 条关系），`src/curriculum.ts` 按需加载并用 schema 校验 ID 唯一、单元归属、目标引用和科目方法；内置目标 ID 可直接用于 `task`、`record`、`mistake`、`link-mistake`、`worksheet`，不经家长确认，状态文件只存引用。`learning.ts` 新增 `studyInsight` 与 `curriculumView`：按目标汇总作答、纸上结果与错题阶段，推导到期、需要加强、久未练习、已掌握、练习中、待学习六种状态，排序薄弱点并给出每日建议（先复习到期错题，再补薄弱点，再学新目标）；`study_status` 默认附带前三个薄弱点与建议，新增 `kind=curriculum`、`kind=weak`。工作区接口参数 `mistakeSubject` 改名 `subject`，新增 `mistakeStatus`（all、due、reviewing、mastered），`dashboard` 改为 options 对象并返回 `curriculum`、`weakPoints`、`recommendation`、`mistakeBook`。工作台标签改为今日学习、知识地图、错题本、成长记录、家长设置：主标签含今日建议（可直接开始复习或目标练习）、薄弱点、当前科目知识地图摘要与错题本摘要；知识地图标签展示单元、知识点、关系与掌握状态并可选目标；错题本按状态筛选，30 天间隔的错题显示已巩固；学科方法提示保留在开始表单下。知识地图内容依据 2022 年版课程标准与上海通行教学顺序编写，本机 Web 检索不可用，未逐页核对沪教版教材，`basis` 字段写明限制。加载器通过变量读取 `import.meta.url`，避免 jsdom 测试里 Vite 对 `new URL(…, import.meta.url)` 的资源路径改写（问题见[排障速查](#11-排障速查)）。同日第二轮起的选项作答、学期浏览、摸底分档和单元关系图见决策笔记。决策见[知识地图决策](.agents/notes/implemented/feature/2026-10-12-student-knowledge-map.zh.md)。

2026-10-11 DSH 升级到 `0.2.1-alpha.2`：12 个包的 375 处 DSH 依赖声明统一改为 `0.2.1-alpha.2`，插件自身版本不变；配套 Cordis 范围仍为 `~4.0.5-alpha.1`、schemastery 仍为 `~3.18.5-alpha.1`（按发布包的 peer 声明核对）。子模块移到 `dsh-v0.2.1-alpha.2`。删除对上游已移除的 `dsh-subagent-in-process-driver` 的依赖，`STRUCTURED_OUTPUT_TOOL` 改从 `dsh-subagent` 导入；story 新增 `dsh-working-directory` 测试依赖——alpha.2 的 `dsh-subagent` 服务注入 `workingDirectory`，手工组合子代理的两个测试必须提供它，宿主侧由上游 `bundle/base` 提供，bundle 补丁不用加行。按工作目录与子代理 activation 升级指南：五个 preset 删掉 persona `suffix` 里的 `{{cwd}}` 语句，八行 `tool-subagent` 删掉 `backgroundMode`，测试夹具删掉 `enableRunInBackground`，三个领域包的 skill-provider 改为按 activation 与结算通知描述委派，角色委派测试改为等子级 activation 完成后在父级请求中核对结算通知。[第 8 节](#8-从上游复制的文件及本地改动)重新同步 `tsdown.client.ts`、`bundle-input-isolation.ts` 并新增 `experimental-package-policy.ts`。typert 生成器的 `isTypeMetaSymbol()` 未变，补丁按 alpha.2 重做（问题 5）；`api-remotes` 仍只把 Remote 包列为 devDependencies（问题 6）；`dsh-client-test-runtime` 仍导入 3 个未发布的 `src` 文件（问题 10）。清理构建后 install、typecheck、build 与全量 97 文件 862 项测试通过。未在真实 DSH 安装验证；上游设置页重组、新会话总是新建 Agent，以及 `dsh plugin --profile` 的参数顺序留待下次核对。

2026-10-11 项目默认模式插件：新增 `packages/preset/project-default-mode`（`@winterhuan/dsh-project-default-mode`，Host + Client 单包，独立 bundle）。Host 面维护 volatile `rules` 配置（`workspaceId` → `agentPreset`），在 `agent/created`（仅 `source === 'startup'` 且非 fork/subagent）中把会话 cwd 解析到 Workspace 并用 `agentPresets.select` 切换 preset，失败只记日志不否决创建；Client 面在会话「…」菜单（order 500）加「设为本项目默认模式」对话框，经 `configForms.set('rules', …)` 写入。不新增 Remote，未改上游拷贝文件。审查修正：对话框控制器等设置表单取得首个已接受区段后再暂存项目规则，表单非 `ready` 时拒绝保存（空镜像写回会丢掉其他项目的规则）；补 `@deepseek-ai/dsh-agent-preset-registry/remote` 类型导入。真实 DSH 里为 `qiqiStudy` 设置默认模式后新建会话报 `cannot create effect on inactive context`：Host 曾在 `agent/created` 串行派发中途调用 `agentPresets.select` 重组 agent，而 `select` 的契约是只作用于已发布的 agent（它重绑作用域并触发 `tools/change`，preset 作用域内的监听器此时仍按创建时 preset 运行）；现改为派发结束后（`setImmediate`）、首个回合之前切换，并新增真 registry、Agent loop、subagent 与 `tool-subagent` 行的真实组合测试。该测试未复现生产报错（生产组合更大），修法依据契约，需用户重启后确认。清理构建后 typecheck、build、包内 51 项测试、文档与规范检查通过；隔离安装的合成配置含该插件，页面脚本无错误。未做真实浏览器交互，未调用模型。全量测试里 story 脚本测试受代理警告影响，清除代理后通过，见[排障速查](#11-排障速查)。

2026-10-05 移除聚合包：删除 `@winterhuan/dsh-creative` 包及旧通用生产工具、`/creative` 路由，四个领域按各自包安装。各包提供独立 `build`、`typecheck`、`test` 命令；领域测试归回所属包，跨领域组合和媒体交付验证位于根 `tests/`。四个包独立构建、独立压缩包资源与依赖检查、隔离 profile 独立安装均通过；`typecheck`、`build` 和 77 个文件 712 项测试通过。旧聚合入口的路径与别名测试随入口移除。

2026-10-05 DSH 升级：10 个插件包的 247 处 DSH 依赖声明统一为 `0.2.1-alpha.1`，插件自身版本不变；对齐配套 Cordis 依赖，迁移 typert 补丁，移除 invariant 构建入口，构建显式使用 native config loader。短剧生产投影适配工具结果的 `name` 与 `PartialArguments`。清理构建后 `typecheck`、`build`、75 个文件 762 项测试通过，peer 检查无冲突。隔离新版 DSH 已验证聚合安装、小说独立安装配置、500 章概览、六个小说技能参考预览、正文保存和外部修改冲突，以及四个工作台入口；小说、创意生产设置与模型思考／重试控件可见，页面脚本错误为零。文档 16 项和规范 3 项检查通过。概览阶段写请求为零，追踪哈希不变。媒体生产和真实模型调用未验证。

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

2026-09-29 接口核对基于 `dsh-v0.1.7-rc.2..dsh-v0.2.0-rc.2`：

| 插件接入点 | 上游变化与适配结论 |
|---|---|
| 右侧栏 | 内部改由所选会话和已登记的 store 驱动；移除了旧的 `SidebarRightBinding`。插件未使用该内部接口，仍使用 `sidebarRightTabs.register` 与标签自身的 `actions.openTab` |
| 会话输入 | `submit` 增加可选来源参数，`fork` 增加可选回调；现有调用不需要改变 |
| 工具卡片 | 增加限时问答面板接口，现有 `ToolCallViewProps` 保持兼容 |
| Remote、设置与密钥 | 外部 `skillViewer` 仍需自行挂载；生成器仍不识别 npm 协议包，保留补丁；设置 Remote 仍需显式导入类型 |
| 客户端构建工具 | 第 8 节的 7 个上游文件在该版本区间没有变化，保留现有副本和本地适配 |

游戏页在没有项目时显示空状态，并保留鼠标及键盘切换其他模式的入口。

上游新增功能的使用说明由上游维护：[自动化任务迁移](upstream/docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.zh.md)说明提醒工具的 preset 接入，[限时提问](upstream/packages/interaction/tool-ask-user/README.zh.md)需显式选择 timed 模式；本次版本适配不改变 Creative 的默认生产流程。

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
│   ├── education/
│   │   └── student/                   @winterhuan/dsh-student（Host + Client，学习工作台与状态）
│   ├── preset/
│   │   └── project-default-mode/      @winterhuan/dsh-project-default-mode（Host + Client，按项目的默认 Agent 模式）
│   ├── skill/
│   │   └── skill-viewer/              @winterhuan/dsh-skill-viewer（Host，skillViewer Remote）
│   └── client/
│       ├── ui-skill-viewer/           @winterhuan/dsh-client-ui-skill-viewer（Client）
│       ├── ui-settings-creative-produce/  @winterhuan/dsh-client-ui-settings-creative-produce（Client）
│       ├── ui-settings-story/         @winterhuan/dsh-client-ui-settings-story（Client）
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
├── upstream/                          子模块，固定在 dsh-v0.2.1-rc.5；只读
├── docs/、.agents/                    设计文档和决策记录
├── tsconfig.base.json                 编译选项（取自上游，去掉 paths）
├── tsconfig.base.client.json          浏览器编译选项（DOM、React JSX、构建期环境类型）
├── tsconfig.host.json                 Host 编译面聚合：skill-viewer、四个领域 Host 与 project-default-mode
├── tsconfig.client.json               Client 编译面聚合：ui-skill-viewer、ui-settings-creative-produce、ui-settings-story、四个领域 Client、project-default-mode
├── tsconfig.json                      编辑器入口，引用上面两个聚合
├── tsdown.config.ts                   Host 面打包 + typert 生成；Client 面交给各包自己的 tsdown.config.ts
├── vitest.config.ts
├── pnpm-workspace.yaml                packages/*/*、allowBuilds、patchedDependencies
└── package.json                       工具链与测试依赖
```

包之间的关系：

- 四个领域包分别构建、测试和安装，不依赖其他业务插件；`packages/creative/creative` 聚合包及其旧工具、路由已删除。短剧和视频继续使用已有生产设置页及凭据引用。
- `skill-viewer` 的 `dependencies` 包含 `ui-skill-viewer`；`ui-skill-viewer` 的 `devDependencies` 包含 `skill-viewer`，用它的 `/types` 和 `/remote`。这个结构沿用上游，所以 `pnpm install` 会提示 `There are cyclic workspace dependencies`，这是预期的。
- 四个领域包各自构建 Host 和 Client；在仓库根目录执行 `pnpm --filter @winterhuan/dsh-story build` 或 `test`，可只开发小说包。其余领域替换包名。跨领域组合验证位于 `tests/`。
- 包路径固定为（`packages/education/student`、`packages/preset/project-default-mode`、`packages/creative/story`、`packages/creative/short-drama`、`packages/creative/video-recap`、`packages/creative/novel-to-game`、`packages/skill/skill-viewer`、`packages/client/*`），文档和构建脚本按这些路径工作。

## 3. 与 DSH 的集成方式

### Bundle 与插件行

五个业务包均通过独立原生模式激活：`story`、`short-drama`、`novel-to-game`、`video-recap`、`student`。Host 负责路由和全局设置，`/agent` 负责模式内技能与工具；工作台跟随会话模式。边界及取舍见[领域模式决策](.agents/notes/implemented/feature/2026-10-06-domain-modes.zh.md)。

五个业务包、`skill-viewer` 与 `project-default-mode` 的 `package.json` 声明 `dsh.bundle.patch: ./cordis.patch.yml`，安装到 profile 后，DSH 按下面的行加载插件：

| bundle | 行 id | 加载的模块 | 作用 |
|---|---|---|---|
| story | `story` | `@winterhuan/dsh-story` | 小说文件 API 与朱雀凭据配置 |
| story | `preset-story` | `@deepseek-ai/dsh-agent-preset` | 小说创作模式，作用域内挂载 `@winterhuan/dsh-story/agent` 的技能、工具和钩子 |
| short-drama | `short-drama` | `@winterhuan/dsh-short-drama` | 短剧文件与生产预检 API |
| video-recap | `video-recap` | `@winterhuan/dsh-video-recap` | 视频文件、交付与播放 API |
| novel-to-game | `novel-to-game` | `@winterhuan/dsh-novel-to-game` | 游戏文件与隔离预览路由 |
| short-drama | `preset-short-drama` | `@deepseek-ai/dsh-agent-preset` | 短剧创作模式，作用域内挂载 `/agent` 技能和工具 |
| novel-to-game | `preset-novel-to-game` | `@deepseek-ai/dsh-agent-preset` | 游戏创作模式，作用域内挂载 `/agent` 技能和工具 |
| video-recap | `preset-video-recap` | `@deepseek-ai/dsh-agent-preset` | 视频解说模式，作用域内挂载 `/agent` 技能和工具 |
| student | `preset-student` | `@deepseek-ai/dsh-agent-preset` | 智能学习模式，作用域内挂载 `/agent` 技能和工具 |
| student | `student` | `@winterhuan/dsh-student` | 学习工作区 API |
| story | `ui-settings-story` | `@winterhuan/dsh-client-ui-settings-story` | 小说设置页，编辑 `story` 命名空间里的朱雀密钥引用 |
| short-drama / video-recap | `ui-settings-creative-produce` | `@winterhuan/dsh-client-ui-settings-creative-produce` | 短剧与视频生产设置页的 Node 入口，负责登记浏览器 bundle |
| skill-viewer | `skill-viewer` | `@winterhuan/dsh-skill-viewer` | Host 服务 `SkillViewerCatalog`（继承 `TypertRemoteService`，Remote 命名空间 `skillViewer`） |
| skill-viewer | `ui-skill-viewer` | `@winterhuan/dsh-client-ui-skill-viewer` | Skill Viewer 面板的 Node 入口 |
| project-default-mode | `project-default-mode` | `@winterhuan/dsh-project-default-mode` | 按项目的默认 Agent 模式：Host 在 `agent/created` 应用规则，浏览器半边经 `dsh.client` 清单提供 |

### 客户端包

客户端包在 `package.json` 里声明 `dsh.client`：`platform: web`，`inject` 列出运行时由宿主提供、打包时外置的 DSH 客户端模块。

`lib/client.js` 是给 DSH 前端模块加载器用的闭包工厂格式（调用 `window.__ModuleLoader__.load`），不是普通 ES 模块。web 服务器用 `plugins/??<a>/client.js,<b>/client.js` 这样的合并 URL 提供它们。

### Remote

DSH 内置的 `@deepseek-ai/dsh-api-remotes` 只挂载内置包的 Remote。外部插件必须自己挂：`packages/client/ui-skill-viewer/src/client/mount.ts` 调用 `ctx.remote.$mount(skillViewerRemote)`。`skillViewerRemote` 和 `ClientRemote.skillViewer` 的类型合并都来自 typert 生成的 `@winterhuan/dsh-skill-viewer/remote`。

DSH 内置 `api-remotes` 只挂载内置包的 Remote，外部插件不能依赖它自动挂载自己的 Remote。

2026-10-03 Skill Viewer 验证：会话列表通知只在所查看的会话身份变化时重载，普通状态更新保留技能选择。搜索、刷新、Markdown 预览与参考文件查找见[查看器说明](packages/client/ui-skill-viewer/README.zh.md)。`typecheck`、`build` 和客户端 104 项测试通过；隔离 DSH 的 Chrome 验证快速切换、另一标签页更新同一会话、重开保留选择、磁盘刷新、参考文件导航、深浅色及 720px/390px 布局，页面脚本错误为零。证据位于 `/var/folders/b7/m96mgydd5334jqqnhxtw0bmm0000gp/T/dsh-skill-viewer-owssq_44/`；使用本地模拟模型接口，未修改用户 profile 或技能文件。

### 设置与密钥

`ui-settings-creative-produce` 编辑 `creative-produce` 设置命名空间，保存短剧和视频的六个提供方密钥引用。`ui-settings-story` 编辑 `story` 命名空间里的朱雀密钥引用。密钥通过 `ctx.remote.credentials` 写入；这个 Remote 由 DSH 内置的 `@deepseek-ai/dsh-api-settings-controller` 提供，由 `api-remotes` 挂载，插件只需要它的类型（见[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)）。

### 学生学习

`@winterhuan/dsh-student` 位于 `packages/education/student`，独立构建和安装，不依赖创作包。右侧学习工作台分成学生页和家长页：学生页是今日学习；家长页包含知识地图与学习摸底、概念、练习单与错题巩固、家长设置与成长记录；`/study` 使用原生对话和图片；`study_status`、`study_update` 通过会话文件系统保存一名学生一学期的档案、教材依据、作答、错题、工作区习题与奖励。无单段/休息/每日时长限制；内置习题知识库按目标索引。题目、原始回答和提示请求与工作台共用持久化状态，面板请求通过主会话文件系统和修订检查保存；辅导消息与图片走 DSH 原生队列和附件。未提供教材的二年级上册使用随包课页，用户教材优先。使用方法及教材确认和模型能力的限制见[学生插件](packages/education/student/README.zh.md)。

### 模型设置增强

`ui-settings-model-options` 是独立安装的客户端组合包，通过 DSH 模型页的提供方卡片插槽编辑模型思考能力、提供方重试次数及无效请求、认证、额度错误的重试开关。它复用内置设置、模型目录和重试运行时，不随领域包安装。安装与配置见[包说明](packages/client/ui-settings-model-options/README.zh.md)。

2026-10-03 重试开关验证：`typecheck`、`build`、包内 54 项及全量 65 文件 683 项测试通过。隔离 DSH 的 Chrome 与本地模拟接口确认 400 在关闭开关、开启并设置 3 次、开启并设置 0 次时分别请求 1、4、1 次，413 沿用此开关。QUOTA 关闭时请求 1 次，开启并设置 2 次时请求 3 次，设为 0 时请求 1 次；接口恢复后可成功完成。AUTH 关闭时 401 请求 1 次，开启并设置 1 次时请求 2 次。刷新持久化、深浅色及 720px 窄窗口检查通过，页面脚本错误为零。证据位于 `/var/folders/b7/m96mgydd5334jqqnhxtw0bmm0000gp/T/dsh-retry400-2mtl7t6i/` 的 `results.json` 与 `quota-results.json`；未调用付费模型或修改用户 profile。

### 小说技能与资源

小说包提供原生 `story` 模式；选择小说会话后才显示工作台及小说文件跳转，设置仍全局可用。Host 路由与作用域能力分开加载，详见[模式决策](.agents/notes/implemented/feature/2026-10-06-story-mode.zh.md)。2026-10-06 类型检查、构建、四 worker 全量 755 项测试、文档和规范检查通过；默认并发全量曾有一项原生章节测试 30 秒超时，独立复核通过。隔离 DSH 与 Chrome 验证模式选择、普通会话隐藏入口、跨会话与刷新恢复未保存草稿，无页面脚本错误。证据在 `/tmp/dsh-story-mode.RrT7Cf/`；未调用真实模型或付费服务。

小说包提供 `story`、`story-write`、`story-analyze`、`story-review`、`story-polish`、`story-cover` 六个入口。长短篇流程按需读取；已有工程直接继续，原始文本接入不要求先拆全书。普通润色不调用朱雀，检测需要用户明确请求。

六个技能的 `resourceBase` 均指向自身目录，各自维护 `references/`；专业 Role 位于所属技能的 `references/roles/`，由子 Agent 原生读取。`story-write` 和 `story-analyze` 各自维护原生 workflow 模板。确定性操作统一调用包内 `lib/cli.js`，也可在 PATH 可用时执行 `dsh-story`；`lib/cli.js` 是 TypeScript CLI 的构建产物（`src/cli/` 打包、内部模块在 `src/core/`），包内不再有 `runtime/`。章节提交保留哈希与修订检查，普通审稿不要求评审 JSON。朱雀 Host 适配器只向 CLI 子进程提供所需凭据（含经 stdin 的密钥池）；story 的 Python 运行时已退役，原先从它同步到其他领域的脚本副本就地冻结，`sync-video-runtime.py` 只在 video-recap 与 short-drama 之间同步。

2026-10-11 小说运行时迁移到 TypeScript：`runtime/` 整体迁到 `tests/reference/`，只作差分测试基准，`package.json` 的 `files` 不再包含它；`lib/cli.js` 由 `src/cli/` 打包，字数口径、细纲契约、四个文本检查器、追踪事务与查询、章节提交、作者记忆、拆文、导出、谱系、朱雀检测都在 `src/core/` 用 TypeScript 重写，兼容性由 16 项 `tests/ts-port-parity*.spec.ts` 差分测试对齐（同一输入比对 `tests/reference/` 的 Python/JavaScript 实现，追踪目录逐字节一致）。新增 `project context`：一次返回续写状态卡、到期伏笔与 `--text` 提及角色的快照，作为写前快路径，知识层 `continuity-query.md` 与 `continuity-context.md` 已记录。事务锁从常驻锁文件改为 `追踪/.tracking-commit.lock/` 目录锁（PID 文件、死进程或超过一分钟接管、等待十秒超时）；朱雀密钥池经 `--credential-pool-stdin` 在单进程内轮换，保持后台任务 `observed` 偏移一致；客户端工作台刷新信号按会话 cwd 作用域识别提交命令（兼容 `lib/cli.js` 与旧脚本形态）。`scripts/sync-video-runtime.py` 不再从 story 复制脚本。`typecheck`、`build`、story 包 29 文件 224 项测试通过；未做真实 DSH 浏览器交互与付费调用，parity 是兼容性依据。

2026-10-04 小说资源与 CLI 验证：六个 Skill 各自拥有参考，共 162 份（含 7 个 Role），两个 workflow 归属写作与拆文技能；15 个私有脚本移入 `runtime/`。`typecheck`、`build`、全量 75 文件 757 项测试、修改的运行相关测试的严格 TypeScript 检查、文档 16 项与规范 3 项检查通过。真实 DSH 确认六个参考列表与预览可用，`shenji` 只列出“神机诸天录”，没有小说写请求且追踪哈希不变。最终压缩包包含 CLI、runtime、本地参考与模板，隔离安装后的 bin 成功读取真实作品；本地 `web` profile 经 Creative 解析到当前仓库 CLI。证据位于 `/var/folders/b7/m96mgydd5334jqqnhxtw0bmm0000gp/T/dsh-story-cli-qa-oxowfbe_/`。用户服务未重启，重新启动 DSH 并加载 Skill 后使用新指令；未调用付费服务。

2026-10-03 小说规则归属简化：所选 Skill/workflow 安排顺序，Role 提供专业方法，写入 hook 将追踪交给指定提交者。Python 细纲检查与提交共用解析，子会话按阶段读取资料，查询员只返回事实、来源和缺口；工作台保留实际编辑与冲突处理，删除未使用的流式状态、其他领域词典及项目元数据投影。兼容接口缩减与保留边界见[规则归属决策](.agents/notes/implemented/simplification/2026-10-03-story-rule-ownership.zh.md)。

规则简化验证：清理构建产物后的 `typecheck`、`build` 通过；全量 65 文件 656 项测试、相关测试的严格 TypeScript 检查、文档 16 项及规范 3 项检查通过。原生 workflow 回归使用真实 `write` 和写入 hook 完成检查、修订及提交；脚本回归覆盖两种解析曾有分歧的目标、缺失细纲和多候选。`pnpm pack` 确认新检查器、共用解析器、提交入口、workflow 及客户端产物均在包内，旧 JS 细纲入口和已删除模块的编译产物不再分发。

本轮真实 DSH 浏览器验证使用隔离 `DSH_HOME` 的独立 story 和 Creative 聚合 profile，两者均通过保存落盘、刷新恢复、外部修改冲突与草稿保留、同名兄弟章节隔离、Markdown 表格与任务列表、深浅色及 720px 窄窗口检查，页面脚本错误均为零。证据位于 `/var/folders/b7/m96mgydd5334jqqnhxtw0bmm0000gp/T/dsh-story-simplify.70jstw4u/`，各 profile 的 `*-results.json` 与截图对应本轮构建。临时 profile 使用浏览器目录选择器完成自动化；未调用真实模型或付费服务，未修改用户 profile 或小说。

2026-10-03 原生小说 workflow：新增按需加载的单章模板，由 `story-write` 在明确选择时顶层调用 DSH 原生 `workflow`，完成细纲检查与必要补建、场景计划、写作、独立审稿、最多两轮修订和提交验证。`chapter check` 返回正文/细纲哈希，提交支持可选预期哈希并在追踪锁内校验；普通审稿与无审稿记录的提交保持可用。具体入口、范围、恢复及 token 成本见[小说包说明](packages/creative/story/README.zh.md)。决策记录已转为 implemented，原生专家协作决策仅增加 workflow 局部结构化路由例外。

验证：`typecheck`、`build`、全量 64 文件 628 项测试通过；补充用例后相关 3 文件 37 项及新增测试的独立 TypeScript 检查通过，Python 版本校验夹具含 9 项回归。文档 16 项和规范 3 项检查通过。原生模型循环与工具运行时测试覆盖五个独立子会话的写作—审稿—修订—再审稿—提交、真实脚本与追踪、待裁定返回、无效结构化响应及取消清理。使用脚本化模型，未调用付费服务，不据此宣称文学质量提升。

准备阶段与失败诊断修复验证：相关 3 文件 50 项回归及新增测试的严格 TypeScript 检查通过。原生运行时使用脚本化模型，覆盖 Prepare 内补建/复用细纲、交接场景计划、缺失规划时停止、无原批准细纲时保留已有正文，以及模型报错或未调用 `structured_output` 的诊断；成功修订流程包含六个子会话。以下五成员浏览器记录来自加入 Prepare 前，本轮未重做浏览器或真实模型验证。

隔离 `DSH_HOME` 完成本地链接和压缩包独立安装，模板、调用说明、三个 Python 脚本及写手 Role 六项包内资源检查通过。已有设置包未发布到 npm，压缩包安装在临时 profile 的 `pnpm-workspace.yaml` 配置本地压缩包 override；pnpm 11 不读取 package.json 中的 pnpm.overrides。Chrome 中原生 DSH 的历史运行展示与刷新验证通过：已提交运行显示 5 个已完成成员，待作者裁定显示 2 个已完成成员，早期取消显示 cancelled；没有页面脚本异常。历史夹具采用未压缩 Session，临时 profile 显式配置相同编码，并使用浏览器目录选择器；路径按 macOS 实际路径统一。浏览器验证针对历史呈现，实时子会话导航与真实模型文学判断未验证。临时服务和浏览器均已关闭，用户 profile 未改动。

2026-10-04 长篇连续性：现有 story 接入只读状态／分类查询、写前到期伏笔分页检查和“概览／文件”视图，继续使用原有追踪事务与作者记忆。使用与限制见[小说包说明](packages/creative/story/README.zh.md)，实施范围及证据见[连续性规划](docs/scratch/2026-10-04-story-continuity-plan.zh.md)。`typecheck`、`build`、全量 712 项测试及最后错误分支的 11 项面板回归通过；独立安装后的 Chrome 验证涵盖跨书与跨 Session、只读浏览、刷新恢复、草稿保留、深浅色及窄窗口，工程哈希不变、写请求与页面脚本错误为零。使用隔离工程和脚本化模型，未验证真实模型的长篇文学质量。

### 短剧、游戏与视频技能资源

短剧提供五个任务入口，视频解说提供两个；它们的原生资源根分别为 `knowledge/drama` 和 `knowledge/video-recap`。普通参考集中在各自的 `references/`，运行脚本仍在 `skills/<资源组>/scripts/`；仅含运行资源的目录不注册为技能。游戏提供四个入口，资源仍跟随各技能，构建模板和 QA 脚本路径不变。具体任务划分见各包 README。

迁移参考时要同时检查 Markdown 链接、模型读取路径和脚本生成的提示；保持 `sync-video-runtime.py` 管理的副本与来源一致。退役的技能名没有注册别名，脚本目录名不代表可调用技能。

### 小说项目发现

小说工作台的长篇与短篇统一为 `{工作区}/{作品名称}/`，会话工作目录保持在作品的直接父目录。作品选择、文件访问、聊天跳转和创作入口共用这一层级；根目录正文与额外分类层不算作品。工作区级 `拆文库/` 仍在文件页可访问，但不进入作品列表。作品内部的分卷递归展示，具体结构见[小说包说明](packages/creative/story/README.zh.md)。

2026-10-04 单层作品目录验证：`typecheck`、`build`、全量 71 个文件 724 项测试、文档和规范检查通过；真实 DSH 只读打开 `/Users/winter/workspace/shenji` 时，概览仅列出“神机诸天录”（第 11 章、修订 24），共享拆文库仍可访问。临时长短篇工程、仅含拆文库的工作区和直接打开作品目录的空状态均已验证，写请求和页面脚本错误为零；用户追踪文件哈希不变。证据位于 `/var/folders/b7/m96mgydd5334jqqnhxtw0bmm0000gp/T/dsh-story-layout-qa-obthcuwo/`。

2026-10-02 验证：`typecheck`、`build` 和全量 62 个文件 610 项测试通过，其中小说包 63 项；文档与规范 19 项检查通过。对 `shenji` 实际目录的只读接口检查识别到 `神机诸天录` 的 55 个文件，其中正文 10 个，追踪元数据无读取错误。独立临时 profile 的离线安装成功，但 DSH 启动报告未完成的顶层 await 并以状态 13 退出，未能完成本次浏览器验证；用户 profile 未改动。

### 从 Chat 打开文件

小说和短剧通过各自的 `src/client/file-redirect.tsx` 注册文件跳转，使用 `story-file`、`drama-file` 标签类型。它们匹配 `dsh-resource://file/session/**`，只接管对应领域支持的文件，再通过 `params.creativeFile` 打开 `story` 或 `short-drama` 页面。其他文件交给 DSH 自带预览。

## 4. 开发命令与构建流程

### 前置条件

- Node `^22.19.0 || >=24`（本机是 nvm 管理的 v22.22.2）。
- pnpm 11.7.0（`package.json` 的 `packageManager` 字段，通过 corepack）。
- `python3`：`packages/creative/*/tests/knowledge-*.spec.ts` 会执行 `knowledge/` 下的 Python 脚本；story 的差分测试会执行 `tests/reference/` 中的 Python 参考实现。
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
   - `tsc -b tsconfig.host.json` 编译 skill-viewer 和 creative 的 Host 面，输出 `lib/types/*.js` 与 `*.d.ts`。
   - `tsdown --env.DSH_BUILD_FACE host`：根 `tsdown.config.ts` 把各包的 `lib/types/index.js` 打成 `lib/index.js`，并由 `typertPlugin({ mode: 'workspace', faces: ['host'] })` 生成 skill-viewer 的 `lib/typert.host.{js,d.ts}` 和 `lib/typert.remote-client.{js,d.ts}`。
2. `build:client`：
   - `tsc -b tsconfig.client.json` 编译四个领域工作台和四个独立 UI 包的客户端编译面。`ui-skill-viewer` 要用第 1 步生成的 `@winterhuan/dsh-skill-viewer/remote` 声明，所以 client 面必须排在 host 构建之后，`typecheck` 也因此先跑 `build:host`。
   - `tsdown --env.DSH_BUILD_FACE client`：客户端包各自的 `tsdown.config.ts` 调用 `scripts/tsdown.client.ts` 的 `clientBundle()`，产出 Node 入口和浏览器 bundle。

构建产物：

| 包 | 产物 |
|---|---|
| creative | `lib/index.js`、`lib/produce-settings-entry.js` |
| story | `lib/index.js`、`lib/client.js` |
| short-drama / video-recap | `lib/index.js`、`lib/produce-settings-entry.js`、`lib/client.js` |
| ui-settings-story | `lib/index.js`、`lib/client.js` |
| novel-to-game | `lib/index.js`、`lib/client.js` |
| skill-viewer | `lib/index.js`、`lib/typert.host.{js,d.ts}`、`lib/typert.remote-client.{js,d.ts}` |
| ui-skill-viewer | `lib/index.js`、`lib/client.js` |
| ui-settings-creative-produce / ui-settings-model-options | `lib/index.js`、`lib/client.js` |
| project-default-mode | `lib/index.js`、`lib/client.js` |

`lib/`、`*.tsbuildinfo` 和 `.dsh-build/`（`client-build-environment.ts` 的构建记录）都被 git 忽略。`dsh plugin add` 是链接安装，安装和调试前必须先 build。

构建时 tsdown 会提示 `Detected dependencies in bundle`（`dsh-util-values`、`dsh-util-crypto`、`dsh-util-workspace-path`、`zod`）。这是预期的：`clientBundle()` 会把无状态工具内联进 bundle。

### 测试如何解析依赖

- Host 测试直接使用 npm 上的 DSH 包。
- 客户端测试（`*.client.spec.ts(x)`）通过 `@vitest-environment jsdom` 注释选择 jsdom，并依赖两项配置：
  - `scripts/vitest-upstream-client.ts`：把 `@deepseek-ai/<包>/client` 和 `@deepseek-ai/<包>/src/*` 解析到 `upstream/` 里的同版本源码；这些源码里的裸导入通过 pnpm 的隐藏提升目录 `node_modules/.pnpm/node_modules` 解析，从而与插件包使用的 npm 副本共享同一个模块实例。
  - `vitest.config.ts` 的 `server.deps.inline: [/@deepseek-ai\/dsh-client-/]`：让 Vite 而不是 Node 处理 DSH 客户端库，这样它们导入的 CSS 和 `src/` 子路径才能被解析。
- 测试输出里的 `An error occurred while trying to read the map file at index.js.map` 是无害警告：发布的包没有带 source map。

## 5. 在 DSH 中安装、调试和移除

下面的安装与启动步骤已在 DSH `0.2.1-alpha.1` 的隔离 `DSH_HOME` 中验证。安装使用链接指向本仓库已构建的包。

```sh
# 使用已安装的 DSH 0.2.1-rc.5
cd ~/dsh-creative && pnpm run build

# 从 web 模板创建 profile，--dump-config 使它只创建、不启动
dsh --profile creative --from-default-profile web --dump-config > /dev/null
dsh plugin --profile creative add ~/dsh-creative/packages/creative/story
dsh plugin --profile creative add ~/dsh-creative/packages/creative/short-drama
dsh plugin --profile creative add ~/dsh-creative/packages/creative/video-recap
dsh plugin --profile creative add ~/dsh-creative/packages/creative/novel-to-game
dsh plugin --profile creative add ~/dsh-creative/packages/skill/skill-viewer

# 确认合成配置里有独立的 @winterhuan 安装层
dsh --profile creative --dump-config | grep -E '^# == @winterhuan|name: .@winterhuan'

dsh --profile creative --host 127.0.0.1 --port 0 --no-open   # 随机端口，终端打印带 token 的地址
```

注意事项：

- 必须先从 web 模板创建 profile。profile 不存在时，第一次 `dsh plugin add` 会建一个只有 `@deepseek-ai/dsh-base` 的 profile，没有 web 应用。
- `dsh plugin add <路径>` 用 `link:` 安装。日常本机验证用的是 `web` profile（`~/.dsh/profiles/web`），`@winterhuan/*` 已 link 到本仓库 `packages/...`。
- **开发完如何生效（日常）**：

  ```sh
  cd ~/dsh-creative
  pnpm run build                              # 或：pnpm --filter @winterhuan/dsh-story build
  dsh-webctl restart                          # Host / 飞书 bot 立即加载新 lib/
  # 浏览器若开着 dsh web：Cmd+Shift+R 硬刷新，避免旧 client bundle
  ```

  说明：插件入口指向各包的 `lib/`，只改 `src/` 不 build 不会生效；dsh-web 进程也不会热替换已加载模块，必须重启。控制脚本在 `~/.dsh/bin/dsh-webctl`（`status` / `restart` / `logs` / `plugin-add`）。
- **第一次把新包链进 web**：

  ```sh
  cd ~/dsh-creative && pnpm run build
  dsh plugin --profile web add /Users/winter/dsh-creative/packages/<分类>/<包目录>
  dsh-webctl restart
  ```

  之后仍走「build → restart」。不要对已 link 的 `@winterhuan/*` 执行会改写依赖的 npm `plugin-update`（会盖掉本地 link）；外部包如 `@xmanrui/dsh-im` 才用 `dsh-webctl plugin-add <pkg>@版本`。
- 想不碰 `~/.dsh` 做隔离测试，就给每条命令加上 `DSH_HOME=/tmp/<目录>`。
- 隔离 `DSH_HOME` 不会改变首次默认工作区的 Documents 路径。在首次打开浏览器前，为临时 profile 的 `workspace-controller.config.documentsDirectory` 指定临时目录；已有工作区仍使用原路径，新一轮验证应使用没有工作区记录的临时 home。
- 确认浏览器 bundle 已加载：页面 HTML 的 `plugins/??...` 列表里应有四个领域包、`dsh-student`、`dsh-project-default-mode`、`dsh-client-ui-skill-viewer` 和三个 `dsh-client-ui-settings-*` 的 `client.js`（共 10 个）。
- 用 curl 检查本地服务时：本机设置了 SOCKS 形式的 `all_proxy`，curl 访问 127.0.0.1 也会走代理，需要加 `--noproxy '*'`。token 地址会先 303 跳转到 `./`，还需要 `-L` 和 cookie（`-c`/`-b`）。
- 移除：

  ```sh
  dsh plugin --profile creative remove @winterhuan/dsh-story  # 仅移除小说；其他领域使用各自包名
  dsh plugin --profile creative remove @winterhuan/dsh-skill-viewer
  ```

## 6. 依赖策略

- **DSH 包**：dependencies、peerDependencies、devDependencies 里一律写精确版本 `0.2.1-rc.5`。不要写 `*` 或 `latest`，原因见[问题 2](#问题-2pnpm-install-报-deepseek-aidsh-type-meta-404)。
- **cordis 系列**：`@deepseek-ai/cordis` 写 `~4.0.5`，`cordis-plugin-loader` 写 `~1.0.6`，`cordis-plugin-include` 写 `~1.0.10`，`schemastery` 写 `~3.18.5`。根开发依赖显式提供 `cordis-plugin-group` 的 `~1.0.5`，满足 `dsh-app-boot` 的 peer 范围。
- **分类**：沿用上游的分类，上游已用 `package-dependency-policy` 检查过。
  - 需要与宿主共享实例的 DSH 包同时放进 `peerDependencies` 和 `devDependencies`。运行时 peer 由正在运行的 dsh 安装提供，devDependencies 只给类型检查和测试用。
  - 无状态工具放 `dependencies`。这是 DSH 发布文档（`upstream/docs/user/develop/basic/publish.md`）的规则。
- **仓库内部包**之间用 `workspace:*`。
- **新发布版本**：pnpm 11 为选定的 DSH 包记录精确到 `0.2.1-rc.5` 的 `minimumReleaseAgeExclude`；该列表不豁免其他版本或其他包。
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

- **现象**：`build:host` 里 Host 面编译通过，typert 插件报 `TypertAnalysisError: typert(host): @winterhuan/dsh-skill-viewer publishes Remote artifacts but has no Remote methods`。
- **原因**：生成器通过 `FaceAnalyzer.isTypeMetaSymbol()` 识别 `@Remote`、`TypertRemoteService`、`bindTypertRemote`，只接受两种情况：
  - 声明所在文件属于一个名为 `@deepseek-ai/dsh-typert-protocol` 的 workspace 包。workspace 包的登记来自根 `tsconfig.host.json` / `tsconfig.client.json` 引用的、位于 `<根>/packages` 下的项目。
  - 声明位于 `declare module '@deepseek-ai/dsh-typert-protocol'` 块内。

  从 npm 安装时，协议包在 `node_modules` 里，两个条件都不满足，skill-viewer 的 `@Remote` 方法被忽略。这是生成器只考虑 monorepo 场景造成的缺口。
- **解决**：用 `pnpm patch` 加一个判断，复用生成器里已有的 `externalModuleIdentityForFile()`。补丁文件为 `patches/@deepseek-ai__dsh-typert-generator@0.2.1-rc.5.patch`，由 `pnpm-workspace.yaml` 的 `patchedDependencies` 引用：

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
| `Cannot find module .../dsh-client-ui-renderer/src/client/bind.ts imported from .../dsh-client-test-runtime/lib/index.js` | 发布的 `dsh-client-test-runtime`（rc.3 仍如此）导入了 3 个没有发布的 `src` 文件：`dsh-client-ui-renderer/src/client/bind.ts`、`scoped-slots.tsx`，以及 `dsh-api-session-controller/src/client/scope.ts` | 同一个插件把 `@deepseek-ai/<包>/src/*` 解析到 `upstream/`；再用 `server.deps.inline` 让 Vite 处理 test-runtime，否则 Node 直接加载时根本不经过 Vite 插件 |
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

- 改名涉及：4 个 `package.json` 的 `name` 和相互依赖，两个 `cordis.patch.yml`，源码里的运行时 id（例如 `workbench.tsx` 的 `WORKBENCH_ID`、`file-redirect.tsx` 的 `REDIRECT_ID`、`skill-viewer/src/index.ts`），3 个 `tsdown.config.ts` 的 `clientBundle()` id，测试与 `tests/fixtures/headless/cordis.yml`，以及 README 和 `docs/subsystems/` 中的对应文档。
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

下面 8 个文件已核对至 `dsh-v0.2.1-rc.5`。`scripts/tsdown.client.ts`、`scripts/client-build-environment.ts`、`scripts/experimental-package-policy.ts` 与 `scripts/platform.ts` 与上游对照仅本地改动差异，复制版本标注更新为 rc.5；`clientBundle()` 接收包目录，各插件的 `tsdown.config.ts` 传入 `import.meta.dirname`。其余 4 个文件的上游内容未变，保留原有复制版本标注（`bundle-input-isolation.ts` 为 `dsh-v0.2.1-alpha.2`，其余三个为 `dsh-v0.1.7-rc.2`）和现有本地改动。

| 本仓库文件 | 上游来源 | 本地改动 |
|---|---|---|
| `scripts/tsdown.client.ts` | `packages/client/tsdown.client.ts` | 删除 `optionalStringArray` 的导入并在文件末尾内联；`platform`、`client-build-environment`、`experimental-package-policy`、`bundle-input-isolation` 改为同目录相对导入；`REPOSITORY_ROOT` 用 `new URL('..', import.meta.url)` |
| `scripts/client-build-environment.ts` | `scripts/client-build-environment.ts` | `CLIENT_ARTIFACT_PATTERNS` 删掉 `apps/web/dist/**/*` |
| `scripts/bundle-input-isolation.ts` | `scripts/bundle-input-isolation.ts` | 仅首行标注 |
| `scripts/experimental-package-policy.ts` | `scripts/experimental-package-policy.ts` | 仅首行标注 |
| `scripts/platform.ts` | `packages/client/web/src/platform.ts` | 仅首行标注 |
| `scripts/vitest-shared.ts` | `vitest.shared.ts` | 仅首行标注 |
| `scripts/test-dom-environment.ts` | `scripts/test-dom-environment.ts` | 仅首行标注 |
| `types/client-build-environment/index.d.ts` | `scripts/types/client-build-environment/index.d.ts` | 仅首行标注 |

`scripts/verify-concrete-terms.ts` 保留上游扫描逻辑，并增加 `webnovel-writer/` 排除项；该目录是同一仓库中独立维护的外部项目，其领域字段不纳入 DSH 主仓库的措辞门禁。

参照上游写的配置文件（没有首行标注）：

| 本仓库文件 | 参照的上游文件 | 差异 |
|---|---|---|
| `tsconfig.base.json` | `tsconfig.base.json` | 去掉 `paths` |
| `tsconfig.base.client.json` | `tsconfig.base.client.json` | `typeRoots` 指向本仓库的 `./types` |
| `tsdown.config.ts` | `tsdown.config.ts` | `workspace` 为 `packages/*/*`；`typertPlugin` 从 npm 包 `@deepseek-ai/dsh-typert-generator/tsdown` 导入；入口为 `{index,startup}`，构建命令显式使用 `--config-loader native` |

对比上游当前版本：

```sh
diff <(git -C upstream show HEAD:packages/client/tsdown.client.ts) scripts/tsdown.client.ts
diff <(git -C upstream show HEAD:scripts/client-build-environment.ts) scripts/client-build-environment.ts
```

### `.agents/skills`（与上游同名的 skill）

`.agents/skills/` 下 11 个与上游同名的 skill 也是拷贝。链接指向本仓库已有的文档时保留本仓库路径；指向上游独有的文档、包或笔记时加 `upstream/` 前缀。比对方式：

```sh
tmp=$(mktemp -d) && git -C upstream archive dsh-v0.2.1-rc.5 .agents/skills | tar -x -C "$tmp" \
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

5. 按[第 8 节](#8-从上游复制的文件及本地改动)重新同步复制的文件（含 `.agents/skills` 中与上游同名的 skill），并重新应用本地改动。
6. 检查 typert 补丁是否还需要：安装新版本后，查看 `node_modules/.pnpm/@deepseek-ai+dsh-typert-generator@$NEW*/node_modules/@deepseek-ai/dsh-typert-generator/lib/types/analyzer.js` 里的 `isTypeMetaSymbol()`。
   - 上游已支持 npm 安装的协议包：删除 `patches/` 下的旧补丁，以及 `pnpm-workspace.yaml` 里对应的 `patchedDependencies` 项。
   - 仍未支持：删除旧版本的补丁项，然后执行 `pnpm patch @deepseek-ai/dsh-typert-generator@$NEW --edit-dir /tmp/typert-patch`，重新加上[问题 5](#问题-5typert-生成器报-publishes-remote-artifacts-but-has-no-remote-methods) 的判断，再 `pnpm patch-commit /tmp/typert-patch`。
7. 检查发布版 `api-remotes` 是否仍只把各 Remote 包列为 devDependencies（[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)），以及 `dsh-client-test-runtime` 是否仍导入未发布的 `src` 文件（[问题 10](#问题-10单元测试dsh-发布的客户端包在-node-里无法加载)）。
8. 依次运行 `pnpm install`、`pnpm run clean`、`pnpm run typecheck`、`pnpm run build`、`pnpm test`，再按[第 5 节](#5-在-dsh-中安装调试和移除)在真实 dsh 里安装验证。
9. 阅读上游的变更，重点看插件依赖的接口：slot `sidebar.right.pane.tab`、`tool.call.toolview`，`sidebarRightTabs.register`，typert 协议（`TypertRemoteService`、`@Remote`、`ctx.remote.$mount`），settings / credentials Remote，Session controller 的客户端接口。

## 10. 已知限制与待办

- **四领域独立开发与安装**：各包拥有技能、工具、路由和侧栏；聚合包及其兼容入口已删除。详细边界见[四领域决策](.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.zh.md)。
- **浏览器验证范围**：新版已验证技能列表、生产设置、小说读写与模式/工作区切换。此次没有调用模型、付费生产或实际媒体生成；从 Chat 打开文件的重定向尚未单独复验，重定向内容组件也没有单元测试覆盖。
- **录制会话快照与 web e2e 未配置**：本仓库目前没有快照或 e2e 测试设施；浏览器内交互仍需手动验证。
- **版本号继承自 DSH**：`skill-viewer`、`ui-skill-viewer` 是 `0.1.5-rc.2`，`ui-settings-creative-produce` 是 `0.1.7-rc.2`。发布前改成插件自己的版本号；发布到 npm 的 `@winterhuan` scope 需要对应的 npm 账号。
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
| 小说 workflow 报 `no structured result` | 查看失败成员的子 Session 结束原因，再核查草稿和追踪；模型报错与未调用 `structured_output` 都可能返回 null，不能归因于摘要长度或盲目重跑（[结果与恢复](packages/creative/story/knowledge/story/skills/story-write/references/long/native-workflow.md#结果与恢复)） |
| 新章细纲不存在 | workflow 的 Prepare 按[中途补纲](packages/creative/story/knowledge/story/skills/story-write/references/long/workflow-setup.md#中途补纲)在授权内创建并检查后交给写手；普通路径由主会话准备。章号检查返回缺失路径与补建建议，同章多个文件则先核实，不重复创建 |
| 类型检查报 `Cannot find module '@deepseek-ai/<包>/remote'` 或 `ClientRemote` 缺属性 | 把该包加进 devDependencies，并 `import type {} from '<包>/remote'`（[问题 6](#问题-6客户端类型检查clientremote-上没有-credentials找不到-dsh-agent-preset-registrytypes)） |
| 类型检查报找不到 `@winterhuan/dsh-skill-viewer/remote` | 先跑 `pnpm run build:host`；`typecheck` 已经包含这一步 |
| typert 报 `has no Remote methods` | 确认补丁已应用（`pnpm install` 会重新打补丁），以及补丁版本与安装的生成器版本一致（[问题 5](#问题-5typert-生成器报-publishes-remote-artifacts-but-has-no-remote-methods)） |
| 改了依赖或 tsconfig 后 tsc 行为异常 | `pnpm run clean`，清掉 `lib/` 里的 `*.tsbuildinfo` |
| 客户端（jsdom）测试里 Host 模块读取包内数据文件报 ENOENT，路径缺少仓库前缀 | Vite 的 web 转换会把 `new URL('…', import.meta.url)` 改写成站点相对资源路径；先把 `import.meta.url` 读进变量再拼 URL（见 `packages/education/student/src/curriculum.ts`） |
| 客户端测试报 `window is not defined` | 有 `@deepseek-ai/<包>/client` 导入没有被 `vitest-upstream-client.ts` 映射，检查子模块是否已检出、包名是否存在于 `upstream/packages/*/*` |
| 客户端测试报 `Cannot find package 'X' imported from upstream/...` | 把 X 加进根 devDependencies，版本用 `git -C upstream grep -h '"X"' HEAD -- '*package.json'` 查 |
| 测试报 `Unknown file extension ".css"` | 该包没有被 `server.deps.inline` 覆盖，把它加入内联规则 |
| 构建报 `declares no string package name` | `clientBundle()` 要传入该包 `tsdown.config.ts` 的 `import.meta.dirname`，并且同目录 `package.json` 要有字符串 `name` |
| `dsh plugin add` 后界面没有变化 | 确认已 `pnpm run build`，并且 profile 是从 web 模板创建的；用 `--dump-config` 查看是否有 `# == @winterhuan/...` 层 |
| 日志出现 `skipping profile bundle ... incompatible ... requirements {...rc.2}` | web 进程在插件清单仍写旧 DSH 版本时启动。先把根和 11 个插件的依赖升到同一版本，跑 `pnpm install` 和 `pnpm run build`，再 `dsh-webctl restart`；确认 `~/.dsh/logs/dsh-web.log` 最后一条 `dsh web:` 之后不再出现该行 |
| story 的 Python/Node 脚本测试报 `TOOL_ERROR`，消息含 `[UNDICI-EHPA]` | 本机 SOCKS `all_proxy` 使子进程把实验性代理警告写进 stderr，脚本检查把它当作失败；清除 `all_proxy`/`http_proxy`/`https_proxy` 环境变量后重跑 |
| 运行失败错误码 `PI_AI_ERROR` 且消息无状态码（如「Service temporarily unavailable」），没有重试 | 该文案未被 pi-ai 适配器归类，落入兜底，不在默认可重试集合；在模型设置里为对应 pi-ai 提供方开启「重试未分类错误（PI_AI_ERROR）」（见[第 1 节](#1-现状速览)） |
| `dsh-webctl restart` 后按旧地址访问返回 401 | 重启会轮换 web token；用 `dsh-webctl status` 取当前地址 |
| 家长设置保存「学校进度」报 403，或错题归类、草稿核对请求被拒 | 工作区接口白名单缺少 school-progress、classify-mistake 或 confirm-paper；2026-10-16 的版本已补齐，升级并重启插件后重试 |

## 12. 本机环境变更记录

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
