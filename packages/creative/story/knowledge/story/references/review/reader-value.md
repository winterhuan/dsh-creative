# 章节提交读者价值证据


当审查对象是即将提交的章节时，优先让 `story-architect` 按本节评审最终正文；调用 prompt 附本章细纲、题材卡、最终正文路径和七类证据要求。`narrative-writer` 只负责修订，`consistency-checker` 只查事实、角色和伏笔。除常规 findings 外必须输出以下 JSON，供 `storyctl.py chapter commit` 或 `chapter accept-current-length` 校验：

```json
{
  "schema_version": 1,
  "verdict": "approve",
  "body_sha256": "<当前正文 UTF-8 字节的 sha256>",
  "reviewer": {"role": "story-architect", "provider": "...", "model": "...", "reasoning_effort": "high"},
  "evidence": {
    "opening_hook": {"summary": "...", "location": "正文/第N章.md:行", "quote": "逐字原文"},
    "chapter_promise": {"summary": "...", "location": "...", "quote": "逐字原文"},
    "main_conflict": {"summary": "...", "location": "...", "quote": "逐字原文"},
    "protagonist_choice": {"summary": "...", "location": "...", "quote": "逐字原文"},
    "state_change": {"summary": "...", "location": "...", "quote": "逐字原文"},
    "local_payoff": {"summary": "...", "location": "...", "quote": "逐字原文"},
    "next_page_question": {"summary": "...", "location": "...", "quote": "逐字原文"}
  },
  "summary": {
    "fulfilled_promise": "...",
    "protagonist_action": "...",
    "state_change": "...",
    "open_expectation": "...",
    "largest_remaining_risk": "..."
  }
}
```

从 `creative_role` 返回的 `resolvedAgent` 记录模型配置，不让评审者猜测模型名；缺省推理强度写 `default`。用户选择 `solo` 或委派不可用时，主会话在写作结束后重新读取最终正文并完整执行本次评审，填写 `reviewer.role=solo` 和当前会话实际配置。它是单会话分阶段评审，不是独立评审，也不能拿写作时的自检代替。无法取得模型配置就报告缺口，不伪造配置或批准。`quote` 必须是正文中的逐字引句（最多 600 UTF-8 字节），`location` 标出文件与行；提交会核对哈希及引句存在性，语义是否支持结论由评审负责。五项摘要各不超过 300 字节，且整份逐章记录仍须在 3072 字节内。

缺少具体开篇承诺、可见状态变化、不可替代的主角选择或明确下一页问题时，`verdict` 必须为 `reject`，提交工具会阻断；这不是跨题材通用分数。AI 检测分数、模式命中和标点建议只能作为 advisory，不能写入完成条件或要求写作者追逐。


同一次章节评审同时核对事实连续性；仅遇到具体争议时追加专门核查，不再例行调用第二套完整评审。任何正文修改都使旧哈希和证据失效，修订后重新评审。`story-review` 只返回证据；构造事务、提交与追踪修复由 `story-write` 执行。
