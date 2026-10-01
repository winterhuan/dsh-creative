# 无密钥本地草稿

在用户需要预览且本地能力可用时选择此路径，不默默把正式制作降级成草稿。`video-doctor` 的 `local_draft` 报告本地识别、语音和占位音能力，不下载模型或调用付费服务。

用 `video_produce_run` 的 `video-recap` 入口运行：

```json
{"entry":"video-recap","argv":["--draft","sources/ep1.mp4","--work-dir","work","--stage","prepare","--transcript","sources/transcript.json"],"workdir":"video-recaps/<project>"}
```

对白来源三选一：已校对的 `--transcript` JSON、已安装 whisper-cli 与本地模型的 `--asr-model`，或创作者明确给出的 `--no-transcript-reason`。缺转录不能推断剪点安全。

prepare 生成最多十二张样帧与 `storyboard.json`。视觉可用的 Agent 实际查看样帧后写 `descriptions.json`，每项 `{path,description}`；未查看就报告证据缺失。解说 JSON 每项 `{start,end,narration}`。

创作者确认草稿解说后运行：

```json
{"entry":"video-recap","argv":["--draft","sources/ep1.mp4","--work-dir","work","--stage","render","--narration","work/narration.json","--descriptions","work/descriptions.json"],"workdir":"video-recaps/<project>"}
```

本地 say/espeak-ng 生成语音；只有显式选择 `--stand-in` 才用提示音验证时序。`draft.mp4` 带可开关字幕轨，`draft_status.json` 记录转录依据、样帧观察与声音降级，并保持 `release_ready:false`。Studio 显示“本地草稿”；升级正式处理时重新确认实际外部分析与生成范围。
