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

每条结果带来源；历史章只提供现存逐章记录，`missing_sources` 列出缺失记录，不能凭当前角色快照还原任意历史章的完整状态。静态设定用下面的 `project lookup`，大纲仍用原生检索；两者都不属于已发生事实。读者时间线不会返回或检索作者真相字段。

伏笔 `--filter` 支持 `all`、`open`、`due`、`overdue`、`unscheduled`、`resolved`。默认截止为已提交章加一；`due` 包括截止章之前及当章计划回收、状态仍为“已埋”的伏笔，`overdue` 仅包括截止章之前的项。未定回收章单查 `unscheduled`；“已过期”和“放弃”不算待回收。回收计划需要结合卷纲判断，查询不会自动修改它。

列表默认 20 条，`--limit` 可设 1–50；单次结果最多 16 KiB，不截断条目内容。`total` 是筛选后总数，`omitted` 是本次未展示数量，`next_offset` 非空时使用该值与本次 `state_revision` 继续：

```text
node {CLI} project query --workspace {工作区} --book {作品名} --kind foreshadow --filter due --chapter {待写章} --offset {next_offset} --revision {state_revision} --json
```

翻页必须保留相同筛选参数；修订号改变时从第 0 页重查，不拼接不同版本。写前读取全部到期页，处理本章应消费的约束；无法完成时报告未检查范围并停止准备。不要因为状态卡只展示 8 条活跃伏笔，就忽略查询返回的其他到期项。

## 伏笔与人物健康

```text
node {CLI} project query --workspace {工作区} --book {作品名} --kind health --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind health --chapter {待写章} --stale-planted 30 --stale-character 20 --stale-thread 40 --json
```

只读，不改状态、不写文件。`--chapter` 省略时截止为已提交章加一，可以晚于已提交章。四类风险按逾期伏笔、久未排期的伏笔、久未更新的角色、长期未收的线索排列；同一类里章龄更长的在前，伏笔再按高、中、低，活跃角色先于其他核心角色。

- 逾期未回收：状态仍为“已埋”，且计划回收章早于截止章。截止章当章计划回收不算逾期。来源是 `追踪/伏笔.md`。
- 未定回收且埋设已久：状态仍为“已埋”、没有计划回收章，且截止章减埋设章达到 `--stale-planted`（默认 30）。来源同上。
- 核心角色久未更新：角色快照没有更新章。最近接触是时间线里点名该角色的事件的最大 `updated_chapter`；截止章减该章达到 `--stale-character`（默认 20）才列入。没有任何点名事件的角色不报。活跃角色带 `active: true`。来源是 `追踪/角色状态/{角色名}.md`。
- 长期未收的线索：作者时间线里“未揭示”或“部分揭示”的事实，从 `first_recorded_chapter` 算起；以及上面那个角色在达到 `--stale-thread`（默认 40）时仍挂着的每条 `open_threads`。来源分别是 `追踪/时间线/作者真相.md` 和该角色文件。“已揭示”“已回收”“已过期”“放弃”不列入。`next_chapter_commitments` 没有章龄，不列入。

`--stale-planted`、`--stale-character`、`--stale-thread` 只接受 1 到 100000 的整数，并且只能与 `--kind health` 同用。`--filter` 不能用于 health。分页、16 KiB、`--search`、`--revision` 与其他查询相同；`thresholds` 回显本次阈值，`counts` 在 `--search` 之后只统计命中行。`omitted` 与 `next_offset` 仍表示未展示的行。未初始化时返回 `initialized: false`，不创建文件。

## 设定库检索

```text
node {CLI} project lookup --workspace {工作区} --book {作品名} --file {细纲或草稿路径} --json
node {CLI} project lookup --workspace {工作区} --book {作品名} --text {一段原文} --json
```

只读 `设定/` 下的 Markdown，不读追踪状态，不写文件。没有追踪文件的书也可以查。`--text` 是字面量，`--file` 是本书内的文件路径，必须且只能给其中一个。`project context` 的 `--text` 仍是文件路径。

匹配顺序固定。文件名和一级标题里的专名优先，其次是文件头声明的别名，最后用关键词打分。中文不依赖空格：先按词典做最长匹配，其余正文切成二字和三字片段。打分是本地 BM25，不使用向量，也不访问外部服务。两个字的栏目标题（关系、文风、设定、角色、题材、势力、大纲、正文、章节、细纲、内容、人物、故事、情节）不作为精确实体，避免细纲里的“人物关系”误中 `设定/关系.md`；文件正文里的专名仍可命中。同一别名指向多份文件时，每份都返回，并带 `ambiguous: true`。

别名格式见[产物模板](../../../story-write/references/long/artifact-protocols.md)的「设定文件别名」。没有别名的旧文件仍按文件名和一级标题匹配。

每条结果带 `source`（相对本书的路径）、`title`、`line_start`、`line_end` 和摘录。默认 8 条，`--limit` 为 1–20。单次结果最多 16 KiB；放不下的条数计入 `omitted`，`next_offset` 非空时用它继续。`--revision` 填上一页的 `index_sha256`。库内容变化则拒绝该页，须从 offset 0 重查。`index_sha256` 只覆盖已索引的 Markdown，不是追踪修订号。空的 `设定/` 返回 `settings_present: false` 和空列表。单文件超过 512 KiB 时只索引开头，命中带 `file_truncated: true`。

## 写前上下文

```text
node {CLI} project context --workspace {工作区} --book {作品名} --chapter {待写章} --text {草稿或细纲文件} --json
```

一次取齐本章写作上下文：续写状态卡、到期伏笔、`--text` 文件中提及的角色快照及其时间线事实、健康摘要，以及该文件命中的设定摘录。`--chapter` 省略时取下一未提交章；`--text` 传文件路径，省略时只返回状态卡中的活跃角色，不扫描设定。`mentions` 按首次出现排序，`characters` 中活跃角色在前。健康摘要最多 8 条，`health.counts` 始终是全量。设定摘录最多 4 条。超出条数或放不进 16 KiB 时计入对应的 `omitted`。字节预算内先省略设定摘录，再省略健康条目，到期伏笔仍最后省略。`omitted.settings` 非零时用上面的 `project lookup --file` 指向同一份细纲或草稿补页。`omitted.health` 非零时用 `--kind health` 按同一修订号补页。设定摘录和健康摘要都不代替全部到期伏笔。单次结果最多 16 KiB；其余省略用定点查询补齐。上下文只读已提交状态和设定文件，不替代 `project check`。

## 工作台与写法记忆

作者在小说工作台的“概览”查看总览、角色、伏笔、双时间线及来源；“文件”保留编辑功能。概览第一张「风险」卡片用默认阈值（30／20／40）和下一未提交章列出健康条目；每条带来源按钮，打开伏笔表、角色快照或作者真相。没有超阈值项时显示暂无超阈值风险。超过 20 条时用概览既有分页。概览只读已提交状态，未保存编辑和未提交稿不计入进度。刷新重新读取磁盘；来源跳转进入已有文件视图。

“记住本书的写法”按 `references/project/author-memory.md` 写入 book 范围偏好；角色、伏笔和事件仍经章节事务保存。当前请求与本书设定优先，待确认候选不参与写作约束。只有得到 Author Memory Receipt 才报告保存成功。
