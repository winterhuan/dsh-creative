---
name: video-script
description: >
 基于已有视频理解索引策划、撰写或修改解说稿和剪辑计划，核对画面、原声与旁白分工。
 支持单独文案审查；本技能不启动视频理解、付费配音或最终渲染。
---

# 解说策划与写稿

先明确本轮是创作、指定方案执行、局部修改还是只读审查。用户给定的方向直接落实；修改时未点名部分默认冻结；只读审查不写项目文件。只有存在影响结果的真实分歧时才比较备选方案，不凑两个假设。

## 读取当前材料

先看 `work/recap_run_manifest.json`、`recap_phase.json` 与 `agent_narration_brief.md`。按当前片段查原文、`vlm_analysis.json`、`asr_result.json`、`timeline_fusion.json` 和 contact sheet；长对白需要时再读 `asr_writing_chunks.json`，不把所有索引全文重复读入。

- full：使用原片时间。
- cut 第一阶段：没有已生成的 `edited_source.mp4` 与 `clip_plan_validated.json` 时只写原片时间的 `clip_plan.json`。
- cut 第二阶段：读取真实剪后视频与映射后，写输出时间的 `narration.json`。剪辑计划改变时，旧旁白不能直接复用。

材料缺失时列出具体缺口，交给 `video-recap` 决定分析范围；不要假装看过画面。背景资料只补上下文，不能证明当前画面；确需补充时读取调研指南 `references/research-guide.md`。

## 写或改稿

需要规划或修改故事时查阅创作决定 `references/creative-editing-playbook.md`。`recap_story_plan.json` 记录当前主线与变化，`visual_audio_board.json` 记录画面/原声/旁白分工；已有决定仍有效时直接复用。简单文案修改不重做整套策划。

- 旁白增加上下文、因果、解释或衔接；画面、对白或沉默已经足够时不加旁白。
- 信息与动机要有 visual / ASR / research / user context 依据，区分当前画面事实与背景推断。
- 文本按连续口语思路与呼吸写，字幕换行不决定 TTS 断句；按有效 speech budget 控制窗口，不靠加速堆字。
- 节奏、句数、旁白比例与修辞服从素材和用户方向，不套固定配额。
- 只修改本轮要求的层；删除的镜头或文案同步从相关计划中移除。表达反馈需要持续使用时更新 `style_card.json`。

具体 `clip_plan.json`、`narration.json` 与可选 `original_subtitles.json` 字段见数据格式 `references/data-schema.md`。多视频片段必须保留 `source_id`，重叠片段需要相应来源标识。

## 检查与交接

对修改过的部分核对因果、主角/POV、声音分工和事实依据。只读审查到报告为止，不启动生成，也不为取得外部报告运行会继续 TTS 的编排器。

准备进入制作的稿件运行本地确定性检查：

```bash
python3 <资源基目录>/skills/video-script/scripts/validate.py --work-dir <work_dir> --mode full
```

cut 输出时间使用 `--mode cut_output --output-duration <实际秒数>`。修复 error 后重验；正文、时间线与检查输入未变时不重复执行。校验可规范化字段并测量原声重叠，不自动移动已写的起止时间，也不改变文本含义。

语义评审默认建议型。已有匹配当前稿件的报告可直接使用；没有外部评审时标明未运行，不把 Agent 自查冒充 `review.py`。当前完整生产流程默认在 TTS 前调用一次外部评审，可在已确认范围中用 `--no-review-narration` 关闭。独立写稿不触发此调用。

只有实际改稿或明确要求复核才重新评审，不循环追求 PASS 分数。明确启用 `--require-narration-review` 时，事实 error、解析失败或评审不可用会阻止 TTS；修正后重新验证。保留意见可以附简短证据说明，但 `narration_review_override.md` 不会解除运行时严格门禁。

交付稿件或审查意见及准确的未解决问题。需要成片时再由 `video-recap` 在授权范围内制作；实际最终文件的观看检查发生在渲染之后。
