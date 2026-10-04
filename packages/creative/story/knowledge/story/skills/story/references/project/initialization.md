# 长篇追踪初始化

作品目录为工作区直接子目录。已有正文先核实最后完整章与事实；输入保留本次实际覆盖和缺口。用 `node {CLI} project init --workspace {工作区} --book {作品名} --kind long --input {初始化事务.json} --json` 提交，随后 `project check` 核验。已有状态不覆盖，失败保留输入。


新书从第 0 章初始化。`story` 接入已有小说时把最后完整章写入 `last_chapter=N`；第 1..N 章不伪造日更记录，常规续写从 N+1 章开始。

```json
{
  "schema_version": 1,
  "book_title": "让你管账号，你高燃混剪炸全网",
  "last_chapter": 0,
  "context": {
    "position": {
      "volume": "第一卷·军宣整顿",
      "volume_start_chapter": 1,
      "story_time": "江晨到火箭军文工团报到前",
      "scene": "火箭军文工团"
    },
    "long_term_constraints": ["军宣爽点要用作品效果和围观反应链兑现，不能只靠系统播报"],
    "active_character_names": [],
    "continuity_risks": [],
    "recent_chapters": [],
    "next_chapter_commitments": ["让江晨报到，并落下五天百万粉的新手任务"]
  },
  "character_snapshots": {},
  "foreshadow": [],
  "timeline_events": []
}
```

导入初始化时直接传入当前核心角色快照、伏笔当前行、时间线事件和固定 7 栏状态输入。阶段/卷级回看按需查询正文，不作为每章强一致追踪产物。

调用方的逐章 JSON 不写 `wordcount`，也不需要评审字段；正式入口在提交当下生成并注入字数记录。state 为已提交章节保留 `metric / target / actual / status / resolution / body_sha256`，不认证文学质量。续写只消费既有事实、近章摘要、下一章承诺与连续性风险。
