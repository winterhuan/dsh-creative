# 原生 workflow 单章执行

用户明确选择 workflow，或已有持续偏好时，`story-write` 可使用本模板完成一章新长篇正文及其未提交稿的局部修订。普通任务沿用 [单章流程](workflow-chapter.md)。已提交章修订、短篇、接入与全书分析不使用本模板。

## 准备与调用

父会话确认父工作区、直接子目录作品名、章号和约束。“下一章”先用 `node {CLI} project check --workspace {工作区} --book {作品名} --json` 取实际进度。细纲检查、补建和场景计划由 Prepare 完成，父会话不重复准备。

读取本 Skill 的 `workflows/chapter.js` 全文并作为 `script` 顶层调用原生 `workflow`。模板不是 ES 模块，不添加 export、不改写阶段或另套运行器。使用 `meta: {"name":"story-chapter","description":"完成一章准备、正文、独立审稿、必要修订及追踪提交"}`，默认前台。args 示例：

```json
{
  "cli": "/installed/story/lib/cli.js",
  "workspace": "/workspace",
  "book": "神机诸天录",
  "skills_root": "/installed/story/knowledge/story/skills",
  "chapter": 1,
  "instructions": "按已确认卷纲续写，保留用户文风、字数、信息边界和停笔点。",
  "context_paths": [],
  "resume": false,
  "compression_used": false
}
```

`skills_root` 是当前 Skill 目录的直接父目录，供模板定位各阶段所属 Skill；每个阶段只读自身参考。`cli` 按当前 Skill 上四级的包位置解析，不猜另一份检出目录。所有路径填写实际绝对路径。

`context_paths` 可为空；提供时只包含本章必要的设定、上一章、状态、选定风格与作者记忆。`body_path`、`outline_path`、`expected_state_revision` 可省略，由 Prepare 解析；显式传入时作为约束核对，不允许静默替换。`resume=true` 表示保留已有未提交稿，先重检重评审，再按新意见修订。`compression_used` 据实际历史记录该稿是否用过唯一压缩机会；不清楚时先核实，不重置机会。子会话不保证继承用户约束，必须写入 `instructions`。

只有用户明确接受这份稿件的自然长度时，才加入 `accepted_length: {"body_sha256":"…","outline_sha256":"…"}`，哈希来自该稿的 `chapter check`。接受只对应这份正文与细纲，修订改变哈希后需重新处理长度；`ready` 不能代替授权。缺少 workflow、结构化响应或必要工具时报告具体缺口，不默默切换执行模式。

## 阶段职责

模板把责任和检查命令直接交给各阶段；子 Agent 只读取任务指明的专业参考。Role 描述专业能力，正文写入提醒不改变阶段分工。本页供父会话调用与恢复使用。

| 阶段 | 工作与交接 |
|---|---|
| Prepare | 按[单章准备](workflow-chapter.md#1-准备本章)核对追踪和唯一实际路径，按[补纲规则](workflow-setup.md#中途补纲)复用或补建细纲，交回场景计划、细纲哈希、修订号，以及本次读到的文件清单。准备者用原生进度反馈展示清单与修订号；模板继续下一阶段，不依赖父会话插入回合。缺关键事实时停下；已有正文缺细纲时只恢复原批准版本。 |
| Write / Revise | 按 Role 和准备结果写正文，运行 `chapter check`，交回实际哈希、长度及压缩使用情况；不改细纲或追踪。恢复稿先检查再审稿。 |
| Review | 读取实际材料，前后运行 `chapter snapshot` 核对原始字节哈希、文件版本和追踪修订号；返回 `ready / revise / needs_input` 及有来源的可读意见。 |
| Submit / Verify | 按[追踪事务](tracking-transaction.md)提交与审稿版本一致的正文，再核对实际状态和持久记录。已提交章直接验证，不重写或重复提交。 |

每个子 Agent 用原生 `structured_output` 返回模板要求的字段，普通消息里的 JSON 或进度说明不算完成。初稿后最多两轮局部修订，每轮重检重评审。带外自然长度必须得到用户对准确正文、细纲哈希的接受；欠长不填充，超长最多使用一次压缩机会。细纲或追踪变化后须重新准备，不能悄悄替换预期值。

## 结果与恢复

父会话读取工具结果的业务 `result.status`：`committed` 为提交并验证完成，`already_committed` 为已提交章本次只验证，两者带实际哈希、修订号及路径。`needs_input`、`revision_limit` 保留草稿和问题，停止后续章；`uncertain` 先核查真实追踪、事务与文件，不能盲目重试。子会话失败、null 或无效响应使运行失败。原生运行完成本身不等于章节提交。

Prepare 尚未解析实际路径时，结果的 `body_path`、`outline_path` 可为 null。普通缺细纲由 Prepare 内部处理；返回 `needs_input` 时依据具体缺口补充事实或作者决定，再重新调用同一章。已有正文须使用 `resume=true` 并保留实际压缩记录，重新经过准备、检查和审稿；不能只重试缺文件的调用。

`no structured result` 表示原生 `agent()` 返回 null：子会话可能因模型或工具错误中断，也可能结束时未调用 `structured_output`。这不是摘要长度错误，改短 `summary` 或改成后台运行不能据此修复。先从原生运行记录定位失败成员的 `childId`，检查该子 Session 的工具结果和结束原因，再核查正文与追踪；诊断不可访问时明确报告。模型服务的认证、内容审核、模型下线及请求参数错误须按实际诊断处理，不自动切换模型或重复整章。只有返回了对象但字段无效时才按字段错误修正。

连续续写由父会话串行调用同一模板，上一章验证提交后再加载新状态。不用 `pipeline` 或 `parallel` 并发依赖前章的连续章。显式选择后台时复用原生 `run_in_background` 与 job 查询/取消，等待终态后再推进，不另建任务登记。

取消保留实际产物，不能撤销已完成的提交。进程退出后先核查追踪与文件，再为未提交稿发起新调用，不恢复旧 JavaScript 栈。用户改变运行中章节范围时先取消、核对产物，再传入新约束；父会话新消息不会自动改写正在执行的子任务。

模板按原文调用及审稿只读都是指令要求；原生工具允许任意脚本，现有权限没有本模板专用的逐成员文件 ACL。哈希与结构化响应验证版本和分支，不能证明文学质量。文件检查检测读取和验证窗口里的变化，不保证排除所有外部程序并发写入。
