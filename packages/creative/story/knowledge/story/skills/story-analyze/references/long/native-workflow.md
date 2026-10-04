# 原生 workflow 长篇批次拆解

多章或全书使用本批次模板；局部问答可直接读原文，短篇不使用它。父会话先确认章节边界表，批次只消费明确章号、标题和行范围。

## 1. 检查范围和原文身份

每批选 1 至 4 章，保存输入：

```json
{
  "chapters": [{"chapter":12,"title":"衙门","start_line":2401,"end_line":2680}],
  "replace": []
}
```

```text
node {CLI} analysis inspect --workspace {工作区} --title {来源书名} --source {原文绝对路径} --input {批次.json} --json
```

CLI 核实原文、章节范围和已有产物，返回 `source`、`source_sha256`、`source_version`、`chapters` 与 `replace`。版本字段按返回的十进制字符串原样传递，不能转成会丢失精度的 JavaScript 数字。`chapters` 包含真实 `exists` 和 `path`；已有章未列入 replace 就跳过，不由模型猜是否存在。

## 2. 提取卡片

读取本 Skill 的 `workflows/analyze-batch.js` 全文，顶层调用原生 `workflow`。args 是上一步检查结果，加上 `cli`、`workspace`、`title` 和 `skills_root`：CLI 路径从当前 Skill 上四级的包位置解析；skills_root 是本 Skill 的父目录。路径均用实际绝对路径，不能手工重造原文身份。

使用 `meta: {"name":"story-analyze-batch","description":"从已核实范围提取至多四章短卡片"}`。每章仅一个 Extract Agent，加载 `story-analyze` 后按 [提取员](../roles/chapter-extractor.md) 读取本章原文并通过 `structured_output` 返回卡片；各章可并行，单章异常隔离为 failed。没有仅负责排版的第二个 Agent。

事件和转折锚点按实际记录，确实没有时允许零；需要定位的字段给本章内的行号 `L12`、`L12-L14` 或原文精确引句。禁止为了最小数量拆造事件，不能把范围外引句充作本章证据。返回结果受字段和体积上限约束。

## 3. 校验并落盘

workflow 返回 `source`、`source_sha256`、`source_version`、`chapters`、`replace`、`cards`、`failed`、`skipped`。这是待写数据，不能据此宣称文件已生成。父会话将完整结果保存为输入，然后执行：

```text
node {CLI} analysis write-cards --workspace {工作区} --title {来源书名} --source {原文绝对路径} --input {提取结果.json} --json
```

CLI 重新核实原文身份、卡片字段和锚点，确定性渲染到 `拆文库/{来源书名}/章节/第NNN章_摘要.md`，核实实际路径与字节数。源文变化须重新 inspect 和提取，不能替换哈希继续；未明确 replace 不覆盖已有章。只依据 CLI 结果报告 written、failed、skipped。

## 恢复与汇总

部分失败保留成功章，下一批仅处理失败/缺失章并重新 inspect。旧长摘要也视为已有，不要求全书重抽。`no structured result` 表示子 Agent 未给有效结构化结果，先查原生运行里的该章子会话和实际诊断，不为失败章重跑已完成章节。

批次完成后按至多 10 个卷段读取原文与短卡片，写节奏、情绪模块、文风和拆文报告；不生成 `_章节摘要汇总.md`。中断时先核实磁盘产物，再继续缺章；未落盘卡片、工作流结束和已写文件是不同状态。
