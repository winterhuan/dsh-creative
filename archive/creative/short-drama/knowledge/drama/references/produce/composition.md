# 短剧整集合成

创作者选定片段后，写 `composition-plan.json`：`segments: [{path,start,end}]` 按确认顺序裁剪；`dialogue: [{start,end,narration}]` 从剧本提取并确认；可选 `music` 指向项目内音乐；`width`、`height` 是偶数像素；`source_audio` 必须明确为 `retain` 或 `replace`。合成配音通常选择 `replace`，避免视频模型原声重复对白。默认附可开关字幕轨；`burn_subtitles: true` 额外要求 ffmpeg 的 libass 滤镜。

用现有 prepare/confirm/run 流程提交 `adapter: episode-compose`、`modality: video`、`source: composition-plan.json`、一个 MP4 output，并把所有片段和音乐列入 references。`drama_produce_run` 仍使用 entry `drama`，adapter `episode-compose`，job_id 和生产请求上下文；MIMO 凭据由设置注入。适配器执行 `scripts/compose_episode.py`，复用 video-recap 的语音、旁白混音、音乐压低、响度与字幕实现。片段顺序确认不代替新配音的付费确认。

缺少凭据在消费确认前失败。输出必须通过 ffprobe 流、时长、尺寸及音频要求检查，并经 ffmpeg 解码后才发布。带生产上下文的成功输出写入 `.short-drama/production/manifests/`，记录目标、请求、框架作业身份和内容哈希；工作台只关联仍匹配这些字节的输出。没有清单的旧文件可保留在文件树中，但不能凭文件名冒充目标版本。

REF 标签只供创作者阅读，可以使用任意语言；身份、造型和地理参考的标签要与本镜视觉依据的主体名称一致。provider 仅收到位置 token 和目标语言的用途句，不接收标签、角色名或控制字段。部分参考的末尾可写 `；待补参考图：<缺口>` 来准备冻结关键帧；最终视频仍需补齐或绑定已确认的起始帧。视频和音频路径可使用 mp4/mov/webm/wav/mp3/m4a/aac/flac。
