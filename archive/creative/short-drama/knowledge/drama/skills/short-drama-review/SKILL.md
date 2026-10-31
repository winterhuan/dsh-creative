---
name: short-drama-review
description: 审查短剧原著分析、剧本、视觉方案、提示词或成片，报告有证据的问题与修订方向；不修改来源，不把媒体抽样当整片验收。
---

# 短剧审查

只读取用户点名范围和必要依据，报告问题、影响与修改方向，不改剧本或视觉来源。用户只要口头结论时不写文件；需要保存时写 `审查/<主题>-审查.md`。

通过 DSH 原生 `read` 按范围选择：

| 范围 | 参考 |
|---|---|
| 原著分析 | `references/review/rubric-source-analysis.md` |
| 故事与剧本 | `references/review/rubric-story-script.md` |
| 资产、连续性、图片提示词 | `references/review/rubric-assets-prompts.md` |
| 分镜、关键帧、视频提示词 | `references/review/rubric-visual-motion.md` |
| 已有成片、生产质量 | `references/review/production-quality-gates.md`；采样操作见 `references/review/workflow.md` |
| 项目生产观察的校准 | `references/review/project-calibration.md` |

先查引用、状态、时序与实际材料，再判断故事和制作效果；缺输入只限制依赖它的结论，不中断其他可审部分。可用时由未参与该版本创作的 reviewer 完成，否则如实说明自检，不例行多代理重复评审。

每个 finding 写位置、必要短引文或冲突事实、观众/制作影响、应达到的修订结果、对应文档、严重度与规则等级。技巧与口味不能冒充结构阻断；无法读媒体时不推断人物一致性、表演、口型或市场效果。

结论使用 APPROVE / APPROVE_WITH_NOTES / REVISE / PROVISIONAL，明确范围、实际复核方式与缺口。需要完整方法或反模板修订依据时读 `references/review/review-method.md`、`references/review/anti-template-repair.md`，不预加载整个项目。

媒体三帧采样与联系表不计费，也不证明整条视频连续性；需要外部画面分析时先展示范围和费用并取得明确确认。审查不执行生产或自动修稿，修订由 `short-drama-write` 或 `short-drama-visual` 在授权范围内完成。
