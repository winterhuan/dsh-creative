---
name: story-review
description: "审查小说正文、设定和大纲，指出有原文依据的问题并给出修改建议。按实际范围审稿，不修改正文或追踪，也不要求固定评审 JSON。"
---
# story-review：小说审稿

审查用户指定范围；未指定时定位当前书最近改动的章节，并说明实际范围。以原文、当前设定与目标读者为依据；材料不足时列出无法判断的部分，不臆造问题或宣称检查通过。

## 阅读与判断

使用原生 `read` 按需读取 `references/review/workflow.md` 和相关原文、设定。按用户或项目平台选一份标准：番茄 `references/review/rubrics/fanqie.md`、起点 `references/review/rubrics/qidian.md`、知乎 `references/review/rubrics/zhihu.md`；未指定则用 `references/review/quality-rubric.md`。缺少参考时报告，不重复加载多个相似 rubric。

关注读者承诺、主角目标与选择、冲突带来的变化、情绪铺垫、局部兑现、后续期待、事实与因果连续性，以及语言是否清楚自然。低压章可以靠关系变化和微期待成立，不强塞高潮、反转或代价。词频、标点、检测分数和固定公式不代替阅读判断。

默认由当前会话完成适合范围的审查。确需独立视角时按 `references/project/delegation.md` 创建专业 Agent；Team 中复用已有审稿成员。仅有具体疑点时追加一致性或人物核查，不例行创建多名评审者。同一 Agent 换 Role 不算独立评审；委派失败或只能自审时如实说明。

## 审稿意见

先给简短结论，再按影响程度列出问题、原文位置或必要引句，以及可执行的修改方向。事实冲突指出需要核对或裁定的来源，不代写剧情。不强制字段表、分数、模型信息或七项证据 JSON；没有问题就说明实际检查范围和限制，不为填报告制造 finding。

审查不修改正文、设定、大纲或追踪。修改交给 `story-write` 或 `story-polish`，重要问题应在提交前解决；正文改变后复核受影响部分，不把旧结论当成新文本的批准。长报告或用户需要文件时可交付普通 Markdown，默认在当前会话或原生 Team 消息中反馈。

脚本只验证可客观检查的文件与事务条件，提交成功不代表文学质量通过。

参与显式选用的原生 workflow 时，遵循 `references/writing/long/native-workflow.md` 的版本核对，按任务 schema 返回 `recommendation` 和可读 `review`；它只控制该运行的分支，不是持久质量证明，普通审稿不要求此 JSON。
