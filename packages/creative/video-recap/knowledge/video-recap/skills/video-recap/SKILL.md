---
name: video-recap
description: >
 制作或修改视频解说、配音与字幕成片，接入视频、续跑现有项目、生成本地草稿并核对交付。
 也处理素材分析、单独配音、剪辑和合成请求；只策划或写改解说稿时使用 video-script。
---

# 视频解说制作

按用户本轮目标执行素材分析、制作或修订。项目使用 `video-recaps/<project>/sources/` 和 `work/`；先查看现有产物与 `recap_run_manifest.json`、`recap_phase.json` 判断进度，不重建已有项目或重复付费处理。

## 选择当前任务

| 用户要做什么 | 执行范围与资料 |
|---|---|
| 首次理解视频 | 读取理解工序 `references/understanding.md`，只在新工作目录且没有下游输入时用编排器产出索引后暂停 |
| 写稿、调整故事或剪辑方案 | 加载 `video-script`；已有有效材料不重复分析 |
| 制作、续跑、翻译配音 | 按生产流程 `references/production.md` 选择 full / cut / dub |
| 仅把现有旁白配成音频 | 按配音工序 `references/voiceover.md` 调用 `video_produce_run` 的 `video-voiceover` |
| 仅剪辑或合成已有材料 | 按剪辑 `references/cut.md` 或合成 `references/assemble.md` 使用对应本地脚本，不启动完整编排器 |
| 无密钥预览 | 按本地草稿 `references/draft.md`，保留降级标记 |
| 已有版本局部修改 | 确认修改项，其他部分默认冻结；只改受影响稿件、剪点、音轨或字幕，再核对实际输出 |

已有旁白、剪辑计划或 dub 译文时，完整编排器可能继续剪辑、TTS 与合成。它没有独立的“仅重新理解”入口；此类请求应说明限制并确定分析目录或重跑范围，不删除用户稿件来控制阶段。

## 生产与费用

付费或外部处理前，展示当前素材/稿件、处理范围、provider 与声音选择、输出和可确认的费用范围，取得对应确认；无法确定费用时说明计费依据与未知项。输入变化、追加生成或可能重新计费的续跑需重新确认。

凭据通过 DSH 配置与凭据存储读取；使用 `video_recap_produce_status` 查看是否已配置，用 `video_produce_run` 的 `video-doctor` 查看能力。不能从普通 shell 的环境推断 DSH 没有密钥。参考声音发送到外部前需要相应授权。工具入口名 `video-voiceover` 是脚本选择参数，不是另一个 Skill。

原声剪入、剪出与恢复都须落在可靠句末或静音边界。旁白保持完整音频，遇到 `unsafe_clip_sentence_boundary`、`interrupts_source_sentence`、`no_safe_fit` 或 `timeline_audio_mismatch`，修改剪点或完整句子，不截尾或自动再次付费合成。

## 完成与交付

检查本轮实际最终文件，再报告其路径、字幕与剩余问题。完整播放、声音和接点检查按交付检查 `references/delivery.md` 执行；只有工具或人员实际完成的观看才能记录为已验证。

`delivery_evidence.json` 的覆盖率、连续原片区间、授权声明和画幅记录不判断授权是否合法，也不代表平台批准。部分 TTS、草稿与未完成的观看保持可见；本技能不向平台发布。

需要具体字段时查阅数据格式 `references/data-schema.md`；高级覆盖参数查阅配置 `references/config-playbook.md`，剪映导出查阅时间线与剪映 `references/timeline-and-jianying.md`。不要预加载全部资料。
