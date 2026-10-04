# 原著导出与改编谱系

需要单文件原著交给其他创作任务时，使用 CLI 导出；不改原始正文。

```text
node {CLI} export txt --workspace {工作区} --book {作品名} --out-dir {导出目录} --json
```

检查返回的实际路径、章节映射和来源指纹，缺章或失败如实说明；导出完成不代表改编授权或目标产物已经生成。

明确建立原著到目标作品的关系时，再记录工作区谱系：

```text
node {CLI} lineage record --workspace {工作区} --from-domain novel --from-path {原著路径} --to-domain {目标领域} --to-path {目标路径} --json
```

谱系保存在工作区 `改编谱系.jsonl`，它是来源关系记录，不是小说已发生事实。接收改编输入时可登记尚未创建的目标，但需保留其计划性质；媒体交付只记录真实完成的来源关系，不伪造指纹或覆盖历史。
