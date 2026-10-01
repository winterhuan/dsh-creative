---
name: short-drama-produce
description: 在展示精确任务并取得本次明确确认后，执行短剧图片、视频、配音、音乐或整集合成；返回核验后的文件和运行证据，不把生成成功当质量审查。
---

# 短剧媒体生产与成片

只执行用户请求的媒体任务。先读取当前提示词或合成计划，再按 `references/produce/workflow.md` 建立任务；原生 `read` 使用 DSH 资源根。不为每份草稿预建 job，不修改已确认剧情、台词或提示词。

## 本次生产确认

1. 用 `skills/short-drama-produce/scripts/production_tool.py prepare` 建立有边界的 job，并完整展示数量、来源条目、prompt/spec、参考绑定、参数、输出、覆盖行为与 adapter。
2. 创作者看过这份预览后明确确认，才执行 `confirm`。普通“继续”、预算讨论、上游接受或旧版本确认不能替代本次确认。
3. 用可见的 `drama_produce_run` 执行当前已确认的 `job_id` 和 adapter。启动时确认只消费一次；启动后成功或失败，重试均需重新确认。任何输入、正文、参数或输出变化都重新 prepare。
4. 运行后核验并报告实际输出及账本。未决 running attempt 不能重投；不自动启动下一批或审查。

来源条目：图片提示词选 `IMG-*`，分镜冻结起始帧选 `SHOT-*`（image），视频提示词选 `MOTION-*`。`source` 指向当前拥有条目的 Markdown，参考绑定在 prepare 时与条目一致；不把计划生成图片当真实输入。job 参数与命令见 `references/produce/adapter-contract.md`。

凭据只由 DSH 设置注入；用 `drama_produce_status` 查配置，不读取凭据文件或索取聊天明文密钥，不通过 shell 绕过运行入口。供应商参数仅按命中的 `references/produce/providers/` 文档读取，不套相近模型参数。

## 整集合成

创作者选择片段后，用 `composition-plan.json` 固定顺序、裁剪、对白时序、音乐、尺寸与 `source_audio: retain|replace`。通过相同 prepare/confirm/run 路径使用 `episode-compose`；新增配音仍须付费确认，不能自由拼 shell 绕过计划。完整格式见 `references/produce/composition.md`。

发布前检查可用媒体流、时长、尺寸、音频与解码结果。目标、请求、作业与内容哈希清单关联真实输出，不凭文件名或 UI 成功状态宣称交付。缺凭据或本地输入校验在启动前失败不代表已请求供应商；结果不明的请求不得自动重投。

输出固定在 `剧集/<EP>/制作成果/`，运行账本与临时 job 不成为第六份创作文档。生产视图仅展示或跟踪实际作业，不提供生产授权。用户要质量复核时转 `short-drama-review`，媒体采样结论只能作为建议。
