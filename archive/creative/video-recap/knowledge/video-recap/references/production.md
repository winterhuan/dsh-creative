# 制作与续跑

使用 DSH 提供的资源基目录定位参考与脚本。带凭据的完整处理通过 `video_produce_run`，入口为 `video-recap`；`argv` 传脚本参数，素材与 `work` 路径相对于 `workdir`。先确定本次确认涵盖的处理范围，再调用。

## full 与 cut

新项目的首次调用完成理解、写出 `agent_narration_brief.md` 后暂停：

```json
{"entry":"video-recap","argv":["sources/ep1.mp4","--work-dir","work","--context","背景"],"workdir":"video-recaps/<project>"}
```

随后加载 `video-script`：full 写原片时间的 `narration.json`。cut 先写 `clip_plan.json`，再次调用同一命令生成 `edited_source.mp4` 和真实映射后，再写输出时间的旁白。已有旁白时再次调用会继续校验、评审、配音和合成，不是只做分析。

多视频只支持 cut，各片段必须填写 brief 提供的稳定 `source_id`：

```json
{"entry":"video-recap","argv":["sources/ep1.mp4","sources/ep2.mp4","--edit-mode","cut","--target-duration","10m","--work-dir","work"],"workdir":"video-recaps/<project>"}
```

来源、设置与指纹必须匹配才可复用旧产物。剪辑改变后按新的输出映射修订旁白，不使用原片时间代替输出时间，也不删除用户稿件来强迫编排器暂停。只剪辑或只合成时分别查 [剪辑](cut.md) / [合成](assemble.md)，执行本地工序。

默认语义评审在 TTS 前执行一次，建议型失败不阻断；`--no-review-narration` 可关闭。`--require-narration-review` 显式启用严格模式，事实 error、解析失败或评审不可用阻止 TTS。`--mimo-qc pre-assemble|post-render|both` 是另一项可选采样复核，默认关闭、每个选定阶段最多一次，失败只记录状态。额外外部请求须在已确认范围内。

## dub 原声译配

`--edit-mode dub` 将英文视频逐句译为中文并用原说话者克隆音色替换整条人声轨。当前支持单说话者，不分离背景音乐；参考音频发往 MiMo，需对应声音使用授权。

```json
{"entry":"video-recap","argv":["sources/ep1.mp4","--edit-mode","dub","--work-dir","work"],"workdir":"video-recaps/<project>"}
```

准备阶段输出 `dub_brief.md` 与 `dub_transcript.json`。Agent 写对应译文：

```json
[{"start":0.0,"end":2.0,"zh":"中文译文"}]
```

逐句忠实翻译，沿用原声时间且不重叠。时长预算只用于判断能否读完，不靠删掉事实满足预算。重复调用前确认本次合成范围，随后输出 `dub_<name>.mp4`。相同台词、模型、提示与参考音频的缓存可复用；缓存失效可能重新计费。

## 选配与交付

- `--tts-provider fish-audio` 使用 Fish；ASR/VLM 仍使用 MiMo。完整解说的 `--voice-ref` 与 dub 整轨替换不同，具体限制见 [配音](voiceover.md)。
- 需要覆盖原片字幕区域时，先用 ffmpeg 抽取代表帧，按自动旋转后的显示画布测量字幕带，再传 `--subtitle-y-top` / `--subtitle-y-bot`，区间为半开 `[top, bot)`。显式策略默认用旁白窗口遮罩，不凭空猜坐标。
- `--no-burn-subtitles` 可关闭烧录；烧录需要 ffmpeg 的 libass 支持。普通 ASS 足够时不引入额外渲染框架。
- `--export-jianying` 导出可编辑草稿；cut 模式引用真实原片区间，详见 [时间线与剪映](timeline-and-jianying.md)。
- 输出包含 `recap_<video>.mp4`、字幕与 `assembly_manifest.json` 等工作产物，按 [交付检查](delivery.md) 检查实际文件。

其他参数按入口 `--help` 与 [配置](config-playbook.md) 查阅。`--style` 是自由文本指导，不是枚举或有限预设。高级环境设置由已校验的生产配置提供，不放入工具参数，也不在对话或文件中暴露密钥。
