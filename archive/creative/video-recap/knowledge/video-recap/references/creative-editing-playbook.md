# 当前创作决定

用于需要新建或改变故事、剪辑和视听分工的任务。已有决定有效时复用；简单文案、字幕或音量修改不重做全部规划。用户指定方案直接落实，只有真实存在方向分歧时才比较备选。

## 主线与画面

在 `recap_story_plan.json` 中记录当前观众承诺、POV、主导因果/关系线与必要的 beats。每拍说明实际变化及证据锚点，避免只记场景摘要。关系、情绪、认识与局势变化均可成立，不强求持续加压或固定高潮位置。

```json
{
  "schema_version":1,
  "director_intent":{"viewer_promise":"观众本次要理解的核心问题","pov":"当前跟随的人物或观察位置"},
  "beats":[{"beat_id":"b01","change":"当前发生的变化","evidence":["source_id / 时间 / 对白或画面"]}]
}
```

这是紧凑示例，不是固定字段校验器。交付需要的 `delivery.licensing_basis` 只记录创作者实际声明的授权依据，未声明则保留未知；`delivery.target_vertical` 按真实画幅目标填写。备选方向与弃选理由只在确有决策价值时保存，不为填表制造第二个故事。

在 `visual_audio_board.json` 为需要剪辑或旁白的 beat 记录具体表演、动作或反应、原片区间、入出点依据以及声音分工。比较说话者与倾听者、动作与反应，选择能支撑 POV 与情绪的时刻。晚进早出只在不损害台词、动作和理解时使用。

`audio_owner` 可选 `original_dialogue`、`action_sound`、`ambience`、`music`、`silence`、`narration`；`narration_job` 可选 `context`、`causal_link`、`foreshadow`、`interpretation`、`transition`、`none`。旁白不是默认音轨，画面或原声已经完成任务时用 `none`。

## 时间与表达

cut 第一阶段只使用原片时间。生成 `edited_source.mp4` 与 `clip_plan_validated.json` 后，再补真实输出时间并写旁白。`clip_plan.json.reason` 保留 beat、变化、POV、所选时刻与入出点依据。多视频保留 `source_id`，不能混淆相同时间戳的不同来源。

`style_card.json` 只在需要持久化表达方向或用户反馈时使用，记录当前声音、口语节奏、字幕姿态和明确禁忌。最新反馈覆盖旧决定；删除的镜头、声音或文案从相关计划中同步去除。

## 制作前复核

按本次改动核对：开头承诺是否由结尾兑现，主线与证据是否成立，选定表演是否有作用，旁白是否增加信息而非重复画面，声音分工是否保护完整台词与沉默。删除无功能部分，保留情绪停留，不按固定数量删 beat 或填旁白。

这些判断不要求平台遥测、多个角色轮流评审或循环追求评分。实际成片观看在渲染后按 [交付检查](delivery.md) 执行。
