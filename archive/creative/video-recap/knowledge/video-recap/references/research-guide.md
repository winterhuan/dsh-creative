# 按需补充背景

已有素材能支持当前任务时跳过调研。只有作品名、人物关系、剧情前提或科普概念不明且影响理解时，使用当前 DSH 可见的搜索/网页工具，或用户提供的资料。

先读已有 `work/background_research.json`，只补当前缺口。检索失败或来源不明确时保留未知，继续不依赖这些事实的工作；不因缺联网工具阻断，也不从分析阶段越过到写旁白。

只记录可靠且与本次素材相关的事实，字段按需省略：

```json
{
  "synopsis":"剧情前提",
  "characters":{"角色名":"关系与身份"},
  "worldbuilding":"背景概念",
  "episode_context":"当前集上下文",
  "cultural_notes":[{"item":"术语","explanation":"解释"}]
}
```

分析前的背景可进入 VLM 上下文；分析后的补充不会自动重跑或改写已有 VLM/ASR，只是 `context-only` 写稿与评审背景。当前画面和台词仍由 `vlm_analysis.json`、`asr_result.json` 与原片证明。冲突信息以可验证素材或用户明确上下文为准，不把后续剧情混入当前画面。
