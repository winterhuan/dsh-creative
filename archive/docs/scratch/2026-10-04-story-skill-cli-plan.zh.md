---
description: "现有 dsh-story 插件的 Skill 独立参考、统一 CLI 与 workflow 改造实现。"
status: implemented
updated: 2026-10-04
---

# dsh-story 技能资源与 CLI 改造方案

[English](2026-10-04-story-skill-cli-plan.md) | 中文

## 概要

六个小说 Skill 各自拥有参考资料，确定性操作统一到随插件分发的 `dsh-story` CLI。DSH 原生 workflow 继续负责模型协作，追踪、作者记忆和只读面板沿用既有数据。改造只调整插件资源和执行入口，不搬动作者作品、不改变既有故事状态格式。本方案已实施，当前用法由[包说明](../../packages/creative/story/README.zh.md)维护。

## 目录

- [问题与依据](#problem)
- [改造设计](#proposal)
- [实施顺序](#implementation)
- [备选方案](#alternatives)
- [验收标准](#acceptance)
- [风险与处理](#risks)

<a id="problem"></a>
## 问题与依据

改造前包有 162 份共享参考、15 个脚本、2 个 workflow 模板及 7 份专业 Role。六个 Skill 的 `resourceBase` 指向自身目录，通过 `../../` 访问共享资料。[资源提供器](../../packages/creative/story/src/skill-provider.ts)与[参考查看器](../../packages/skill/skill-viewer/src/references.ts)的发现方式不一致：查看器只扫描 Skill 内的 `references/`，直接调用现有发现函数时，六个 Skill 均返回零份参考。

审计时调用链存在冲突：短篇检查默认使用当前目录，而 Session 停留在工作区；题材卡禁止正文格式允许的标点；分析模板保留旧阶段和数量配额。旧[拆文 workflow](../../packages/creative/story/knowledge/story/skills/story-analyze/workflows/analyze-batch.js)会拒绝只有一个真实事件的卡片，每章额外调用一个模型排版 Markdown，并在父会话复核前依赖模型自报路径和字节数。旧[章节 workflow](../../packages/creative/story/knowledge/story/skills/story-write/workflows/chapter.js)则要求审稿者临时编写 Python 导入代码进行来源身份检查。

<a id="proposal"></a>
## 改造设计

保留现有 `@winterhuan/dsh-story` 包与六个技能名称。Skill 负责任务指引和内容判断，CLI 负责确定性校验与状态操作，workflow 负责阶段顺序和交接。正文、大纲和设定内容仍通过原生工具读写；CLI 不生成小说，也不认证文学质量。

### 各 Skill 独立参考

消费者迁移完成后删除插件级 `knowledge/story/references/`。每个 Skill 仅加载自身 `references/`，路径相对 `SKILL.md`；切换任务时显式加载目标 Skill，参考不跨目录读取其他 Skill 的私有资料。这能直接适配现有查看器，无需扩大文件访问范围。

| Skill | 参考归属 |
|---|---|
| `story` | 接入、工程准备、研究、状态查询、作者偏好、导出与谱系 |
| `story-write` | 长短篇规划与写作、修订、格式、题材方法、对标使用和章节提交 |
| `story-analyze` | 长短篇分析方法、原文证据、产物示例和批次恢复 |
| `story-review` | 审稿流程、平台标准、人物与连续性核查、来源身份比较 |
| `story-polish` | 表达诊断、局部润色、检测结果解释与报告 |
| `story-cover` | 视觉风格、生成指引、尺寸与验收 |

将 66 份 `agent-references` 按实际用途拆分：创作方法归写作，原文分析方法归拆文，质量标准归审稿。保留题材差异，删除失效的重复规则。同一概念被不同任务使用时，写简短的任务说明，不整份复制手册。命令参数归 CLI 帮助维护，本地参考说明何时调用及如何解释结果。

Role 指令归入对应 Skill 的 `references/roles/`：查询员和研究员归 `story`，架构师、人物设计和写手归 `story-write`，章节提取员归 `story-analyze`，一致性核查归 `story-review`。委派任务明确所属 Skill 并传入必要的本地参考路径。清除 Role 对共享库的假定，将跨任务段落归回相应负责人。

作者工作区继续采用长短篇一致的 `{工作区}/{作品名}/`。工作区 `拆文库/` 保存来源分析，`.story/作者记忆/` 保存偏好；它们属于作者数据，继续在工作区层共享。写作时查询作者偏好直接调用 CLI，无需加载工程技能的整套参考。

### 一个随包 CLI

通过本包 `bin` 提供 `dsh-story`，使用轻量 Node 启动入口和由 `storyctl.py` 扩展的 Python 调度器。已验证的 Python 与 JavaScript 模块集中放入包内 `runtime/`，保留内部导入关系。Node 入口使用参数数组并转发输入输出和终止信号，不拼接 shell 命令；补齐专用构建入口与打包文件，沿用已有 Node/Python 环境要求。

在 DSH 中，根据已安装 Skill 的位置取得包根，以绝对路径执行 `node <包根>/lib/cli.js ...`。终端 PATH 已包含安装命令时，`dsh-story` 是等价入口。插件链接不保证用户工作区 shell 能找到 bin，因此不要求全局安装或联网下载。Skill 与 workflow 任务使用明确的可执行入口路径，不猜其他检出目录。

以下命令族是拟提供的公开入口。已有校验算法作为内部实现复用，命令归并不要求重写算法。

| 命令族 | 职责与现有实现 |
|---|---|
| `project init/status/query/check` | 最小工程准备、连续性查询与完整追踪检查；复用 `storyctl`、`project_query`、`tracking_commit` |
| `outline check` | 长篇细纲就绪检查；复用 `check_outline_contract` |
| `chapter check/snapshot/commit/accept-current-length` | 章节检查、新增轻量来源身份查询、受保护提交及准确稿件的长度接受 |
| `short plan-check/delivery-check` | 短篇规划和整篇交付检查；复用两个短篇校验器 |
| `text count/check/normalize` | 字数、退化、表达、细纲照抄和标点检查；标点修改要求显式 apply 选项 |
| `memory init/query/record/commit/check` | 工作区作者偏好与既有回执；复用 `author_memory_commit` |
| `analysis inspect/write-cards` | 新增有界批次检查、卡片校验、确定性渲染与落盘 |
| `export txt` / `lineage record` | 既有小说导出、章节映射与工作区改编谱系 |
| `detect zhuque` | 使用环境凭据的既有外部检测 |

作品命令要求 `--workspace` 与单段名称 `--book`，不默认使用 `.`，不搜索父目录。校验作品为工作区直接子目录，并检查真实路径归属；工作区根、分类容器及共享拆文资料不能作为作品。新书初始化先验证父目录再创建，保留已有文件；长篇追踪初始化消费明确准备的输入，短篇初始化不创建长篇追踪。

记忆和谱系使用工作区范围。分析使用工作区与来源书名，可读取明确指定的外部原文，产物写入 `拆文库/{来源书名}/`。导出支持明确指定目标位置。纯文本工具可读取显式文件，不把文件所在目录识别为作品。CLI 校验传入路径，访问权限仍由 DSH Session 与沙箱决定。

提供按命令展开的 `--help` 与稳定的 `--json` 结果。stdout 返回结果，stderr 输出诊断；通过明确的退出码与错误码区分成功、检查未通过、无效输入和执行失败。保留修订号、哈希、来源、查询分页及体积限制和准确回执语义。查询、身份快照和普通检查不写入、不初始化；中断或结果不确定的提交先核实状态再重试。

保留 `story_zhuque` 作为 DSH 凭据适配器，将解析后的密钥放入子进程环境并调用同一个 CLI。CLI 不读取 DSH 凭据仓库，也不把密钥放入命令参数；终端检测使用明确提供的环境凭据。普通润色仍在本地，检测仍以用户请求为前提。适配器只负责凭据注入和取消，不维护另一份检测实现。

### workflow 接入

将 `chapter.js` 归入 `story-write/workflows/`，`analyze-batch.js` 归入 `story-analyze/workflows/`。父 Skill 读取自身模板并调用 DSH 原生 `workflow`；子阶段加载对应 Skill，接收 CLI 路径、工作区、作品或来源范围及用户约束。当前 workflow 运行时提供编排方法，没有通用文件系统 API，文件操作继续由原生工具和 CLI 完成。

章节流程保持准备 → 写作 → 审稿 → 有限修订 → 提交／验证。直接脚本调用和模型临时导入改为 CLI 命令；审稿前后调用 `chapter snapshot`，提交时在既有事务锁内独立复核已审身份。保留全部到期伏笔分页、草稿恢复、准确版本的长度接受和跨章串行推进。需要在执行中展示准备依据时使用原生进度反馈，不承诺连续阶段之间会出现父会话回合。

分析采用三步批次：父会话用 `analysis inspect` 检查至多四章的选定范围与已有产物，workflow 返回有界结构化卡片，再由父会话调用 `analysis write-cards` 校验、渲染并写入。移除仅负责 JSON 排版的模型调用。保留单章失败隔离、显式替换、已有文件保护及真实产物核验，写入前拒绝原文身份变化。事件和锚点按实际数量记录，原文确实没有时允许零，以体积上限和原文定位约束输出，不设促使补造内容的最低配额。

章节创作、审稿、润色和封面生成仍属于模型任务。不新增 workflow 引擎、自动并发续章、持久运行登记或重复故事状态。现有只读面板保留只读数据通路；CLI 用于模型执行，不要求每次浏览器刷新都启动进程。

### 目标包结构

```text
packages/creative/story/
  src/cli.ts
  lib/cli.js
  runtime/                  # internal Python/JavaScript modules
  knowledge/story/skills/
    story/{SKILL.md,references/}
    story-write/{SKILL.md,references/,workflows/chapter.js}
    story-analyze/{SKILL.md,references/,workflows/analyze-batch.js}
    story-review/{SKILL.md,references/}
    story-polish/{SKILL.md,references/}
    story-cover/{SKILL.md,references/}
```

<a id="implementation"></a>
## 实施顺序

每阶段以可运行的检查收尾。所有实际消费者迁移完成前保留旧资源路径，在同一发布中完成切换与删除；不保留第二套可编辑参考或长期脚本转发层。

| 阶段 | 工作 | 完成证据 |
|---|---|---|
| 1. 迁移清单 | 为所有参考、Role、模板指定归属；追踪 Skill、workflow、Host、测试、打包及脚本副本消费者 | 审核旧路径 → 归属／移动／删除映射，保留独有内容 |
| 2. CLI | 增加随包入口与调度，先复用现有脚本，实现范围校验及快照／卡片命令 | 构建入口与 bin 测试覆盖真实文件效果、错误和取消 |
| 3. Skill 独立 | 移动参考与 Role，清理冲突规则，将脚本指引替换为 CLI 用法 | 六个 Skill 均可解析本地参考并在查看器展示 |
| 4. workflow | 迁移模板，使用 CLI 快照／提交，以父会话 CLI 写入替换拆文排版 Agent | 原生章节恢复及批次部分失败流程通过 |
| 5. 打包安装 | 内部模块移入 runtime，删除退役路径，更新脚本副本同步和文档，验证本地链接与压缩包安装 | 包内资源完整，真实 DSH 浏览器及运行验证通过 |

导出和谱系模块还被短剧、视频及游戏插件使用。更新现有同步脚本，并补齐遗漏的游戏目标，保持各插件独立可安装；这些实现副本不构成共享 Skill 参考。同步修改当前归属文档和测试，不改 upstream 与历史归档记录。

<a id="alternatives"></a>
## 备选方案

- 保留共享参考并改造查看器，仍保留跨 Skill 加载依赖；本地归属直接满足本次方向。
- 将 162 份参考复制进每个 Skill 虽能恢复本地路径，却扩大冲突规则的维护量；按任务迁移，仅保留必要的本地说明。
- 将 Python 全部重写成 TypeScript 会增加事务和计数风险，且不是 CLI 化的必要条件；新入口复用已验证实现。
- 新建 CLI 包、自定义 Agent 运行时或为每项检查注册模型工具都会增加安装和发现成本；在现有插件内提供一个 CLI，并保留职责明确的凭据适配器。

<a id="acceptance"></a>
## 验收标准

使用临时工程与实际构建包验证。脚本化模型用于验证执行和隔离，不据此证明几百章的文学质量。

- 六个 Skill 在真实 DSH 中均能发现和预览本地参考；有效 Skill／Role／workflow 指引不包含退役共享参考路径或私有脚本直调，压缩包包含所有被引用资源。
- 长短篇均使用工作区直属作品目录；缺书名、工作区当书、分类层、分析当书和越界路径在写入前失败，同名章节的两本作品保持隔离。
- CLI 保留追踪修订、回执、来源哈希、到期伏笔分页及读者／作者信息隔离；只读查询和检查不在工程内创建文件、目录或运行缓存。
- 审稿通过快照发现正文、细纲或修订号变化；提交拒绝过期身份并保留锁内检查，取消保留真实产物且不误报完成。
- 批次分析接受有原文依据的少事件卡片，部分失败时保留成功章，未明确替换不覆盖已有产物，仅报告核实的写入；中断后重跑不重复生成已完成产物。
- 独立与聚合安装均能在不依赖工作区 PATH 的情况下解析构建 CLI；缺 Python／Node 或参数错误时返回明确诊断，密钥不进入参数或日志，朱雀测试使用模拟端点。
- 实施时先运行定向测试，提交前执行规定的 typecheck／build／test；验证文档、打包资源、来源工具副本和真实 DSH 参考浏览，资源迁移前后逐字节核对已有作品与记忆文件。

<a id="risks"></a>
## 风险与处理

独立参考若整份复制手册仍会漂移，因此各任务只保留必要方法，确定性规则由 CLI 实现和帮助维护。内部脚本移动可能破坏导入、Host 检测及副本安装，应原子更新消费者并测试构建包。Node → Python → Node 调用链需要验证取消与退出传播。活跃会话可能保留旧路径，切换安装构建前先结束正在执行的 workflow，之后重新加载相关技能。本方案不包含正文或追踪的自动迁移。

## 开发笔记

实施验证：typecheck 和 build 通过，全量 75 个文件 757 项测试通过；修改的运行相关测试通过严格 TypeScript 检查。CLI 检查覆盖搬迁、缺少 Python、取消、过期提交和只读查询。压缩包包含启动入口、runtime、162 份本地参考和两个模板，安装后的 bin 成功读取真实作品。真实 DSH 中六个参考列表与预览可用，shenji 工作区只列出神机诸天录，没有小说写请求且追踪哈希不变。本地 Creative 已解析到当前仓库的 story CLI。浏览器证据与安装细节见 [HANDOFF.md](../../HANDOFF.md)。脚本化模型验证执行链路；长篇文学一致性和付费检测未在本轮验证。
