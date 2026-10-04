# 原生 workflow 长篇批次拆解

多章或全书拆解使用本模板。开头、单章或局部问题由父会话直接读原文并回答，需要保存时只写对应文件。短篇拆解不使用本模板。

## 准备与调用

父会话先确认一份章节边界表，写入 `拆文库/<书名>/_progress.md`。批次只消费表里的章号、标题和行号，不另做章节识别，也不把全书章号放进同一次运行。

用原生 `read` 读取资源根下 `workflows/analyze-batch.js` 全文，将原文作为 `script`，顶层调用原生 `workflow`。不通过 PTC 嵌套调用、包装工具或直接调用引擎。模板是脚本正文，不是 ES 模块，不添加 export 或改写分支。不另写 workflow 脚本，也不派后台子代理直接写章节摘要。

使用 `meta: {"name":"story-analyze-batch","description":"提取至多四章短卡片并渲染章节摘要"}`，默认前台。`args` 为以下 JSON；路径替换成实际绝对路径：

```json
{
  "resource_base": "/installed/story/knowledge/story",
  "source": "/workspace/拆文库/书名/原文/原文.txt",
  "output_dir": "/workspace/拆文库/书名",
  "chapters": [
    { "chapter": 12, "title": "衙门", "start_line": 2401, "end_line": 2680 }
  ],
  "existing": [1, 2, 3],
  "replace": []
}
```

`chapters` 是父会话为本批选定的待处理章，1 到 4 章。超出 4 章、缺行号或章号重复时，整批在子会话开始前失败，父会话再切一批。`source` 是原文绝对路径，`output_dir` 是 `拆文库/<书名>` 根目录。

脚本不读磁盘。`existing` 是父会话确认已经有 `章节/第NNN章_摘要.md` 的章号，长摘要旧文件也算已有。写文件只发生在本章属于 `chapters`，且本章不在 `existing` 中或本章在 `replace` 中。未列入 `replace` 的已有章不会进入写文件提示。漏传 `existing` 会把已有文件当成新文件。`replace` 只列出允许覆盖的章号；不在本批 `chapters` 里的章号不会被写。

## 阶段职责

每章一个 `() => ...` 交给原生 `parallel`。某一章里的 `agent()` 抛错或返回 null，只让该章失败。

| 阶段 | 工作与交接 |
|---|---|
| Extract | 只读本章行范围，按 `chapter-extractor` 交回短卡片。null 表示子会话没有调用 `structured_output`。字段不合格时不写文件。 |
| Write | 只把这一份 JSON 渲染到 `章节/第NNN章_摘要.md`。`NNN` 为至少三位、不足补零。返回 `written` 与字节数；null、0 字节或路径不符记为该章失败。 |

子会话用原生 `structured_output` 返回模板要求的字段。普通消息里的 JSON 或进度说明不算完成。

## 结果与恢复

结果包含 `written`、`failed` 和 `skipped`。`written` 带路径和字节数。`failed` 带原因。`skipped` 是本批里已有且未列入 `replace` 的章。某一章失败不取消同批其他章。

父会话按缺文件的章号和 `failed` 章号决定下一批，把已完成章号写入 `existing`。只有要重写的章号放入 `replace`。旧的长摘要视为已完成，不要求重抽。批次全部完成后，父会话按至多 10 个卷段写 `剧情/节奏.md`、`剧情/情绪模块.md`、`文风.md` 和 `拆文报告.md`，卷段读原文和短卡片。不生成 `_章节摘要汇总.md`。

`no structured result` 表示原生 `agent()` 返回 null：子会话可能因模型或工具错误中断，也可能结束时未调用 `structured_output`。先查看该章子会话，再决定是否把该章放入下一批。不要为了失败章重跑整批已写章节。
