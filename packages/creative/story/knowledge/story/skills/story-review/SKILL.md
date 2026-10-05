---
name: story-review
description: "审查小说正文、设定和大纲，指出有原文依据的问题并给出修改建议。按实际范围审稿，不修改正文或追踪，也不要求固定评审 JSON。"
---

# story-review — 小说审稿

审查用户指定范围；未指定时只在当前书内定位最近改动的章节，并说明范围。材料不足列出不能判断的部分，不臆造问题或宣称通过。

长篇和短篇都使用 `{工作区}/{作品名}/` 直接子目录。Session 工作区保持在其父级；工作区、`拆文库/` 和长短篇分类容器不是作品。无法从请求确定目标时先确认作品，不按修改时间跨书选择，也不自动迁移文件。

本 Skill 的参考相对 `SKILL.md` 解析，只按当前问题读取 `references/`，不加载其他 Skill 的私有参考；跨任务用 `skill` 加载准确名称。`{CLI}` 由本 Skill 目录上四级定位 `lib/cli.js`，参数查 `--help`、结果以 `--json` 为准；作品命令显式传 `--workspace` 与 `--book`，不依赖 PATH，不直接运行包内私有脚本。

读取 [审稿流程](references/workflow.md) 和相关原文、设定。按项目平台只选一份标准：[番茄](references/rubrics/fanqie.md)、[起点](references/rubrics/qidian.md)、[知乎](references/rubrics/zhihu.md)；未指定用 [通用标准](references/quality-rubric.md)。体裁问题再查 [长篇](references/methods/long-quality.md) 或 [短篇](references/methods/short-quality.md)，不叠加多份评分。

关注读者承诺、主角目标与选择、因果后果、情绪铺垫、兑现、后续期待及语言可读性。低压章允许关系变化与微期待，不强塞高潮。词频、标点、检测分数和公式不能替代阅读。

默认当前会话完成；具体事实疑点需要独立核查时，委派加载 `story-review`、读取 [一致性核查员](references/roles/consistency-checker.md)，传本 Skill 和书籍路径。前置任务等待结果；Team 仅用户明确要求时使用，不例行创建多名审稿者。同一 Agent 换 Role 不算独立评审。

先给结论，再列有依据的问题、位置和修改方向。事实冲突指出待核实来源；没有问题则说明实际范围与限制，不为填报告制造 finding。不要求固定分数、评审 JSON 或七项证据表；用户需要报告时在本书目录保存普通 Markdown。

审稿不修改正文、设定、大纲或追踪。需要重写加载 `story-write`，局部表达修改加载 `story-polish`；变化后复核受影响范围。

在章节 workflow 内，审稿前后使用 `chapter snapshot --workspace {工作区} --book {作品名} --chapter {N} --json` 比较正文、细纲和状态身份；任何变化都使本轮结论失效。按任务 schema 返回 recommendation 与可读 review，仅用于运行分支，不是持久质量证明。机械检查与提交成功也不代表文学质量通过。
