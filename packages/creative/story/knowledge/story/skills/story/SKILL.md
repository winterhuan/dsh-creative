---
name: story
description: "小说创作入口：新建工程、接入已有小说、查进度与角色伏笔、查看只读概览、选题扫榜和记住写作习惯；明确的写作、拆解、审稿、润色和封面任务使用对应技能。"
---

# story — 小说入口与工程准备

先检查当前工作区与用户材料，复用已完成工作；只询问影响作品、输出或范围的缺项。明确任务直接加载对应 Skill，不把查询串成写作。

长篇和短篇都使用 `{工作区}/{作品名}/` 直接子目录。Session 工作区保持在其父级；工作区、`拆文库/` 和长短篇分类容器不是作品。无法从请求确定目标时先确认作品，不按修改时间跨书选择，也不自动迁移文件。

本 Skill 的参考路径相对 `SKILL.md`；只按当前问题读取 `references/`，不加载其他 Skill 的私有参考。跨任务用 `skill` 加载准确名称。`{CLI}` 是从本 Skill 目录向上四级解析的 `lib/cli.js` 绝对路径；运行 `node {CLI} <命令> --help` 查参数，实际结果以 `--json` 返回为准。作品命令显式传 `--workspace {工作区} --book {作品名}`；不依赖工作区 PATH，不直接运行包内私有脚本。

| 用户目标 | 入口 |
|---|---|
| 导入 TXT/Markdown、接续已有小说 | [接入流程](references/intake/workflow.md)；无需先拆全书 |
| 选题、扫榜、事实研究 | [研究流程](references/research/workflow.md) |
| 查进度、角色、伏笔、时间线、历史记录或概览 | [连续性查询](references/project/continuity-query.md) |
| 记住、确认、查询或忘掉写作偏好 | [作者记忆](references/project/author-memory.md) |
| 导出原著、记录改编来源 | [导出与谱系](references/project/export-lineage.md) |
| 设定、大纲、正文、续写或重写 | `story-write` |
| 拆解参考或源文 | `story-analyze` |
| 审稿、润色、封面 | `story-review`、`story-polish`、`story-cover` |

## 工程准备

已有标准工程直接继续。若当前打开的是作品本身，说明应使用的父工作区，保留文件；旧布局在明确迁移目标后单独处理。

新书按 [初始化指引](references/project/initialization.md) 使用 `project init --kind long|short` 准备对应目录，保留已有文件。长篇追踪初始化只消费明确准备的初始化输入；已有正文却无追踪时先按接入流程核实事实，不能空初始化覆盖进度。短篇使用 `设定.md`、`小节大纲.md`、`正文.md`，不创建长篇追踪。工作区共享分析在 `拆文库/{来源书名}/`，作者记忆在 `.story/作者记忆/`。

只读查询不初始化、不提交；作者偏好只有收到 Author Memory Receipt 才可宣称保存。开书准备完成后按用户范围进入写作，不自动产生正文。

需要独立查询或研究时，委派任务明确加载 `story`，传本 Skill 绝对路径、工作区、作品和问题；子 Agent 按职责读取 [查询员](references/roles/story-explorer.md) 或 [研究员](references/roles/story-researcher.md)。前置查询等待实际结果，认证失败报告诊断，不重装插件或切换提供商。
