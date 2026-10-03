# 原生 workflow 单章执行

用户明确选择 workflow，或已有持续偏好时，`story-write` 可使用本模板完成一章新长篇正文及其未提交稿的局部修订。普通任务沿用 [单章流程](workflow-chapter.md)。已提交章修订、短篇、接入与全书分析不使用本模板。

## 准备与调用

父会话确认工程、章号、用户约束及 Python/Node 环境后直接调用模板。“下一章”可先运行 `scripts/tracking_commit.py check --project {项目根}` 确定章号。细纲检查、补建与场景计划由 workflow 的 Prepare 阶段完成，不要求父会话先做一遍。上下文可提供已知的必要路径，其余由 Prepare 在工程内定位。

用原生 `read` 读取资源根下 `workflows/chapter.js` 全文，将原文作为 `script`，顶层调用原生 `workflow`（由 `@deepseek-ai/dsh-tool-workflow` 提供）。不通过 PTC 嵌套调用、包装工具或直接调用引擎。模板是脚本正文，不是 ES 模块，不添加 export 或改写分支。顶层调用提供原生运行、阶段、成员及子会话入口。

使用 `meta: {"name":"story-chapter","description":"完成一章准备、正文、独立审稿、必要修订及追踪提交"}`，默认前台。`args` 为以下 JSON；所有路径替换成实际绝对路径：

```json
{
  "project": "/workspace/book",
  "resource_base": "/installed/story/knowledge/story",
  "chapter": 1,
  "instructions": "按已确认卷纲续写本章；列明用户的文风、字数、信息边界与停笔点。",
  "context_paths": [],
  "python": "/usr/bin/python3",
  "resume": false,
  "compression_used": false
}
```

`context_paths` 可为空；提供时只包含本章必要的设定、上一章、状态、选定风格与作者记忆。`body_path`、`outline_path`、`expected_state_revision` 可省略，由 Prepare 解析；显式传入时作为约束核对，不允许静默替换。`resume=true` 表示保留已有未提交稿，先重检重评审，再按新意见修订。`compression_used` 据实际历史记录该稿是否用过唯一压缩机会；不清楚时先核实，不重置机会。子会话不保证继承用户约束，必须写入 `instructions`。

只有用户明确接受这份稿件的自然长度时，才加入 `accepted_length: {"body_sha256":"…","outline_sha256":"…"}`，哈希来自该稿的 `chapter check`。接受只对应这份正文与细纲，修订改变哈希后需重新处理长度；`ready` 不能代替授权。缺少 workflow、结构化响应或必要工具时报告具体缺口，不默默切换执行模式。

## 阶段职责

各阶段完成或需要裁定时，调用 DSH 为该子会话提供的 `structured_output` 工具交回 schema 字段。普通消息里的 JSON、进度说明和纯思考输出都不算返回结果。

Prepare 原生读取 story-write Skill、[单章准备](workflow-chapter.md#1-准备本章)及必要的[补纲规则](workflow-setup.md#中途补纲)，核对追踪并定位本章唯一实际文件。新章缺细纲时，在已确认卷/单元规划和续写授权内创建并检查；已有可用细纲直接复用，缺失字段只据确认材料补齐。多个候选、未知关键设定、缺追踪或超出授权的规划变化返回具体 `needs_input`，不写正文。已有正文而细纲缺失时只恢复可识别的原批准版本，不能从正文倒推批准。

Prepare 检查正文与 `resume` 是否一致。它在读取就绪细纲生成场景计划前计算原始字节 SHA-256，完成后复核细纲哈希和追踪修订号。`ready` 返回实际正文/细纲路径、必要上下文、至多 4000 字符的 `scene_execution_plan`、细纲哈希和修订号。后续阶段接收这些准备结果；写手检查的细纲或修订号与准备结果不一致时停止。已提交章不规划或改写，Prepare 返回 `already_committed` 后直接交独立 Verify 阶段核对。

写手原生读取 narrative-writer Role、story-write Skill 及准备好的材料和场景计划，以任务中的 `project` 为工程根；会话工作目录可能是它的父目录。使用完整 CLI 命令核对追踪、实际路径及细纲哈希。新章没有正文是正常状态，读取批准材料后创建任务中的 `body_path`；正文存在后才运行 `chapter check` 或正文快照。细纲消失或变化则 `needs_input`，不自行补纲。已存在未提交正文但 `resume=false` 时不能覆盖；恢复稿先检查，不自动重写。

写作遵循单章流程的场景、字数检查点和最终 `storyctl.py chapter check`，不修改追踪或大纲。本工作流将最终检查分配给写手，提交仍由独立阶段负责。直接执行文档中的 CLI，不为例行检查导入脚本内部函数。`checked` 必须包含该命令返回的 `body_sha256`、`outline_sha256`、`state_revision`，并把 `length.status` 填入 `length_status`。长度带外且未授权接受则 `needs_input`；超长允许尚未使用的一次净删压缩，欠长不填充。检查失败返回实际原因，不自报通过。

独立审稿者原生读取 story-review Skill、所选标准、实际正文及相关材料。按模板 schema 返回 `recommendation`（`ready / revise / needs_input`）和可读 `review`；普通 story-review 仍为自然语言。`review` 至多 4000 字符，保留重要问题、原文位置及修改方向；没有重要问题就说明检查范围和限制。不写正文、大纲或追踪，不用写手摘要代替阅读。

审稿前后分别用已验证的 Python 读取正文、细纲原始字节及追踪修订号。以下代码接收脚本目录、工程根、章号；两次输出须完全一致，哈希和修订号还须与模板给出的身份相同。它不重复整套质检，也不持有跨模型等待的锁：

```python
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from wordcount_core import chapter_source_snapshot, chapter_source_digests
from tracking_commit import load_state
project, chapter = Path(sys.argv[2]), int(sys.argv[3])
revision = load_state(project)["state_revision"]
snapshot = chapter_source_snapshot(project, chapter)
if load_state(project)["state_revision"] != revision:
    raise RuntimeError("tracking changed during read")
print(json.dumps({**chapter_source_digests(snapshot), "state_revision": revision,
                  "versions": snapshot["versions"]}))
```

版本变化返回 `needs_input`，核对实际产物后重新调用同一章，从 Prepare 重载事实再检查和审稿。`revise` 仅用于授权范围内可执行的修改，触发局部修订、重检及新的独立审稿。初稿后最多两轮修订；仍有重要问题就返回 `revision_limit`，不提交。

提交者读取最终正文、必要事实及 [追踪事务](tracking-transaction.md)，构造 `mode=append`，带审稿对应的 `expected_state_revision`、`expected_body_sha256`、`expected_outline_sha256`，不填 wordcount 或审稿证明。调用 `storyctl.py chapter commit`；明确接受自然长度且哈希一致时才用 `accept-current-length`。脚本重新检查并在追踪锁内校验身份。随后运行 `tracking_commit.py check`，核对持久字数哈希、章号、修订号及实际正文/细纲。`committed` 必须是本章及预期修订号加一，不能仅凭最后一句模型输出判断。

## 结果与恢复

父会话读取工具结果的业务 `result.status`：`committed` 为提交并验证完成，`already_committed` 为已提交章本次只验证，两者带实际哈希、修订号及路径。`needs_input`、`revision_limit` 保留草稿和问题，停止后续章；`uncertain` 先核查真实追踪、事务与文件，不能盲目重试。子会话失败、null 或无效响应使运行失败。原生运行完成本身不等于章节提交。

Prepare 尚未解析实际路径时，结果的 `body_path`、`outline_path` 可为 null。普通缺细纲由 Prepare 内部处理；返回 `needs_input` 时依据具体缺口补充事实或作者决定，再重新调用同一章。已有正文须使用 `resume=true` 并保留实际压缩记录，重新经过准备、检查和审稿；不能只重试缺文件的调用。

`no structured result` 表示原生 `agent()` 返回 null：子会话可能因模型或工具错误中断，也可能结束时未调用 `structured_output`。这不是摘要长度错误，改短 `summary` 或改成后台运行不能据此修复。先从原生运行记录定位失败成员的 `childId`，检查该子 Session 的工具结果和结束原因，再核查正文与追踪；诊断不可访问时明确报告。模型服务的认证、内容审核、模型下线及请求参数错误须按实际诊断处理，不自动切换模型或重复整章。只有返回了对象但字段无效时才按字段错误修正。

连续续写由父会话串行调用同一模板，上一章验证提交后再加载新状态。不用 `pipeline` 或 `parallel` 并发依赖前章的连续章。显式选择后台时复用原生 `run_in_background` 与 job 查询/取消，等待终态后再推进，不另建任务登记。

取消保留实际产物，不能撤销已完成的提交。进程退出后先核查追踪与文件，再为未提交稿发起新调用，不恢复旧 JavaScript 栈。用户改变运行中章节范围时先取消、核对产物，再传入新约束；父会话新消息不会自动改写正在执行的子任务。

模板按原文调用及审稿只读都是指令要求；原生工具允许任意脚本，现有权限没有本模板专用的逐成员文件 ACL。哈希与结构化响应验证版本和分支，不能证明文学质量。文件检查检测读取和验证窗口里的变化，不保证排除所有外部程序并发写入。
