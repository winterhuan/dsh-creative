# 媒体复核与采样

文字审查按 `short-drama-review` 选择对应 rubric；只有需要实际媒体抽样时读取本文件。审查不修改来源或执行生产。

媒体复核计划 JSON 使用 `clips: [{targetId,path,subjects,location,references?}]`，每批 1–24 个 clip，每个最多三张主体/地点参考图。运行本 Skill 的 `scripts/media_review.py --plan <plan> --work-dir <review-dir>`，每条 clip 在 10%、50%、90% 取样并生成联系表和 `media-review.json`。仅采样不计费，也不声称识别了人物或文字。

需要画面分析时，先展示采样范围和费用并取得明确确认，再通过 `drama_produce_run` 的 `video-recap` 入口传 `--review-drama-media --plan <plan> --work-dir <review-dir> --confirmed-paid-analysis`。它复用视频理解的图片请求实现，报告身份/服装、地点和画面文字；凭据仍由 DSH 注入。报告是建议，抽样不能保证整条视频连续性，不作为合成阻断条件。
