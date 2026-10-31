# 短剧项目配置与交付

日常任务按 `short-drama` 选择模式；本文件只在需要初始化、项目级选择或导出时读取。已确认生产档案通过现有项目工具写入，发布owner与记录ID保留原含义，不因技能合并重建。

## 初始化与工作区

需要项目配置时运行：

```bash
python3 {资源根}/skills/short-drama/scripts/project_tool.py init ./my-drama --title "示例短剧"
```

直接输入已经确认创作者说明语言、提示词语言、画幅、集数或单集目标时长时，首次 `init` 就带上对应的
`--language`、`--prompt-language`、`--aspect-ratio`、`--episode-count`、`--target-seconds`；只省略
未确认项，不让 Brief 中的确定事实留成配置里的 `null`。写入已确认的生产档案时，状态统一为
`accepted`；`unset` 只表示尚未决定，不另造中间状态。
`init` 只建立配置和空目录；第一次创作时再把文档写入 `剧集/<EP>/`，不预建空文件。
项目已经建好、用户之后才定下目标视频模型时，把选择写进档案，并同时展示它对时长区间、参考方式和
正文语言的影响。档案只接受已发布并已接受的创作者决策，所以是三步，不是一步。先写一行决策记录
（`accepted_value` 就是要落进 `choices` 的对象本身，不要再包一层 `choices`）：

```jsonl
{"decision_id":"CD-H3","status":"accepted","target_locators":[{"src":"short-drama","field":"/creator_authority/production_profile/choices"}],"accepted_value":{"target_video_model":"minimax-h3","video_prompt_dialect":"minimax-h3","video_prompt_language":"en","native_duration_seconds":{"min":4,"max":15},"supported_generation_modes":["text","first_frame","first_last_frame","reference"],"audio_generation":"same_pass"}}
```

再发布、接受、写入：

```bash
python3 {资源根}/skills/short-drama/scripts/project_tool.py publish <project> --owner short-drama \
  --artifact-id AR-PROFILE --output "创作者决策/production-profile.jsonl=输入/profile.jsonl"
python3 {资源根}/skills/short-drama/scripts/project_tool.py accept <project> --artifact-id AR-PROFILE --decision accepted
python3 {资源根}/skills/short-drama/scripts/project_tool.py set-authority <project> \
  --field /creator_authority/production_profile/choices \
  --decision-ref "创作者决策/production-profile.jsonl#CD-H3"
```

各字段取值由命中的模型方言给出：`$short-drama-visual` 的 MiniMax H3 / Seedance 方言文件都写了
推荐档案。写完用 `status` 复核 `video_model_profile` 是否已经出现。

项目定位与安全写入见 [运行预检](runtime-preflight.md)。用户要打开短剧创作台时，使用当前 DSH 会话的「短剧」视图，不另起服务器或会话。需要聚焦生产目标时使用可见的 `creative_production`，它不编辑创作文档，也不授权或执行媒体生产。

新项目只创建当前请求需要的 creator-first 文档，不预建空文件、不补造阶段。其他项目格式不受支持。

## 项目级创作决定

制作形态、视觉方向、播放面和集长目标确实约束多个阶段时，展示选择及影响后由用户决定。
Look Development 是可选分支，不是进入图片提示词或分镜的固定门槛。

按问题只读取一份相关知识：

- 规则分级与 owner 路由：[规则与路由索引](knowhow-index.md)
- 输出语言、稳定 ID、所有权与安全边界：[契约与所有权](contract-and-ownership.md)
- 实拍、二维、三维、水墨、Q 版、国漫的形态差异：[制作形态](production-form-profiles.md)
- 需要比较代表帧时：[Look Development](look-development.md)
- 参考图能控制什么：[参考角色](reference-roles.md)
- 遮挡、延迟揭示和观众知情时机：[观众揭示](audience-reveal.md)
- 母版、补拍和替代版的职责：[补拍与替代](pickup-and-alternate.md)

## 生产与交付边界

外部生产永远保留 `preview -> explicit confirm -> run`。归档只复制用户点名的当前文档和成品，排除
私有输入、凭据、绝对路径与隐藏运行状态；不为归档补造审批、哈希或第二套内容。

用户问“做完了怎么导出/交付给我”时，用 `export` 打包当前状态：

```bash
python3 {资源根}/skills/short-drama/scripts/project_tool.py export <project> --out <项目外目录>
```

它把每集现有的五份创作文档和 `剧集/<EP>/制作成果/` 复制到 `--out`，附 `manifest.json` 与
`checksums.sha256`，并排除 `输入/`、`交付/` 和 `.short-drama/`。只要一部分时加
`--episode EP001`（可重复）；只要文字时加 `--no-media`；覆盖旧目录加 `--overwrite`。
`--out` 必须在项目之外。

`export` 是**当前状态快照**，manifest 里 `asserts_approval` 恒为 `false`：它不声称任何审查或
创作者接受。需要带审批证据的正式交付包仍然只有 `package`/`verify` 那条路径。

## 安装维护

只有安装、升级或排障时运行 `python3 {资源根}/skills/short-drama/scripts/selftest.py`。
