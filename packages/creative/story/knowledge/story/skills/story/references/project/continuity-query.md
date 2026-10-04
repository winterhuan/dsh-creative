# 长篇状态与事实查询

使用 `node {CLI} project` 查询当前书的已提交事实，所有命令只读。`--workspace` 与 `--book` 必须指向已确认的工作区直属作品；不向父目录寻找其他作品。

## 状态

```text
node {CLI} project status --workspace {工作区} --book {作品名} --json
```

返回书名、已提交章、下一章、修订号、紧凑上下文和计数。`initialized=false` 表示没有追踪；查看状态不初始化，已有正文需要继续时按 `story` 接入。损坏状态或提交正在进行会返回失败，不解释为零进度。状态查询不替代 `node {CLI} project check --workspace {工作区} --book {作品名} --json` 的派生视图核验，也不代表审稿通过。

## 定点查询

```text
node {CLI} project query --workspace {工作区} --book {作品名} --kind characters --search {角色名} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind foreshadow --filter due --chapter {待写章} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind reader-timeline --search {关键词} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind author-timeline --search {关键词} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind chapter --chapter {已写章} --json
```

每条结果带来源；历史章只提供现存逐章记录，`missing_sources` 列出缺失记录，不能凭当前角色快照还原任意历史章的完整状态。静态设定与大纲用原生检索定位后读取，它们不属于已发生事实。读者时间线不会返回或检索作者真相字段。

伏笔 `--filter` 支持 `all`、`open`、`due`、`overdue`、`unscheduled`、`resolved`。默认截止为已提交章加一；`due` 包括截止章之前及当章计划回收、状态仍为“已埋”的伏笔，`overdue` 仅包括截止章之前的项。未定回收章单查 `unscheduled`；“已过期”和“放弃”不算待回收。回收计划需要结合卷纲判断，查询不会自动修改它。

列表默认 20 条，`--limit` 可设 1–50；单次结果最多 16 KiB，不截断条目内容。`total` 是筛选后总数，`omitted` 是本次未展示数量，`next_offset` 非空时使用该值与本次 `state_revision` 继续：

```text
node {CLI} project query --workspace {工作区} --book {作品名} --kind foreshadow --filter due --chapter {待写章} --offset {next_offset} --revision {state_revision} --json
```

翻页必须保留相同筛选参数；修订号改变时从第 0 页重查，不拼接不同版本。写前读取全部到期页，处理本章应消费的约束；无法完成时报告未检查范围并停止准备。不要因为状态卡只展示 8 条活跃伏笔，就忽略查询返回的其他到期项。

## 工作台与写法记忆

作者在小说工作台的“概览”查看总览、角色、伏笔、双时间线及来源；“文件”保留编辑功能。概览只读已提交状态，未保存编辑和未提交稿不计入进度。刷新重新读取磁盘；来源跳转进入已有文件视图。

“记住本书的写法”按 `references/project/author-memory.md` 写入 book 范围偏好；角色、伏笔和事件仍经章节事务保存。当前请求与本书设定优先，待确认候选不参与写作约束。只有得到 Author Memory Receipt 才报告保存成功。
