# 原生专业 Agent 协作

需要独立执行者时，使用当前可见的 DSH 委派工具创建真实 Agent；Role 文件只是该执行者的专业指令，不是新工具或 Skill。主会话直接完成简单任务时，不称为调用了独立 Role。

| 任务 | 专业身份 | Role 文件（相对于当前 Skill 资源根） |
|---|---|---|
| 章节摘要与情节点 | chapter-extractor | `../creative/roles/chapter-extractor.md` |
| 角色、动机与对白 | character-designer | `../creative/roles/character-designer.md` |
| 事实与连续性核查 | consistency-checker | `../creative/roles/consistency-checker.md` |
| 正文与定点改写 | narrative-writer | `../creative/roles/narrative-writer.md` |
| 结构、大纲与世界观 | story-architect | `../creative/roles/story-architect.md` |
| 项目资料查询 | story-explorer | `../creative/roles/story-explorer.md` |
| 外部事实研究 | story-researcher | `../creative/roles/story-researcher.md` |

把 Role 路径按 DSH 返回的 Skill 资源根解析成绝对路径。委派任务直接说明专业身份、资源根、Role 文件、输入材料、产物路径和成功条件，让子 Agent 先用原生 `read` 读取所选 Role，再按需读取参考。不要预加载全部 Role 或把整库内容复制进任务。

普通独立任务使用原生 `subagent`，前置任务等待结果。用户明确要求 Team 且工具可用时，使用 `spawn_teammate` 创建成员，再用 `send_message` 复用该成员；名字是成员地址，不是 Role 类型。Team 的任务、消息、等待和恢复遵循原生工具说明，不另外维护协作状态。

只并行互不依赖的产物；写作、审稿、修订、提交按依赖推进。成员创建、inactive 或任务 complete 都不是作品质量认证。工具不可用或执行失败时报告实际缺口，主会话只能继续已获授权的工作，不能虚构独立执行。

专业指令不改变模型、系统 persona 或工具权限。模型与授权由 DSH 管理；同一 Agent 换专业指令不构成独立审稿。
