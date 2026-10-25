# 本章写前事实

当前书固定为 `{工作区}/{作品名}/`。只读取本章需要的事实，使用 Skill 定位的 CLI；状态查询与检查不推进创作。

```text
node {CLI} project context --workspace {工作区} --book {作品名} --chapter {N} --text {本章草稿或细纲} --json
node {CLI} project check --workspace {工作区} --book {作品名} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind foreshadow --filter due --chapter {N} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind health --chapter {N} --json
node {CLI} project lookup --workspace {工作区} --book {作品名} --file {本章草稿或细纲} --json
node {CLI} chapter rules --workspace {工作区} --book {作品名} --chapter {N} --json
node {CLI} chapter audit-verify --workspace {工作区} --book {作品名} --chapter {N} --json
```

先用 `project context` 一次取得状态卡、到期伏笔、提及角色的快照、健康摘要、`--text` 指向的细纲或草稿命中的设定摘录、最多 2 KiB 的事实账本，以及最多 1.5 KiB 的卷切片。细纲已经定位时把路径传给 `--text`；还没有这份文件时省略 `--text`，此时不扫描设定。设定摘录最多 4 条。`omitted.settings` 非零，或要核对上下文没扫过的段落时，再运行：

```text
node {CLI} project lookup --workspace {工作区} --book {作品名} --file {同一份细纲或草稿} --json
```

lookup 的 `--text` 是字面量，只在还没有文件、手里只有一段原文时使用。翻页带上一页的 `index_sha256` 作为 `--revision`。设定摘录是参考，预算不够时先于健康摘要和到期伏笔省略，不能代替二者。健康摘要最多 8 条，`health.counts` 是全量；`omitted.health` 非零时用最后一条命令按同一 `state_revision` 补页，阈值与上下文一致时不要改 `--stale-*`。健康摘要不代替全部到期伏笔。其余 `omitted` 非零时按对应定点查询逐页补齐。从 check 获取 `last_committed_chapter` 与 `state_revision`。状态卡最多展示 8 条活跃伏笔，不能代替全部到期项；有 `next_offset` 时保持筛选参数并带 `--offset {next_offset} --revision {state_revision}` 继续。修订号变化须从第一页重查，任何页失败或未覆盖剩余项都停止依赖它的准备。

把到期义务与已确认卷纲核对，不能为方便写作自动延期或标记已回收。`omitted.facts` 非零时运行 `facts query`。补细纲后运行 `project rhythm --from {max(1,N-8)} --to {N+2}`；爽点或卖点超限时先改细纲再写正文。`project plan check --chapter {N}` 有 blocking 时先补卷纲或改登记状态。`chapter rules` 另给本章一份带 ID 的规则清单，正文可以还不存在；缺来源只产生 warning。写手逐条遵守并在自检里引用 ID，格式见 [写作检查配置](artifact-protocols.md#写作检查配置)。正文写完后，`chapter audit-verify` 核对 `草稿/审稿/第NNN章.rules.json` 是否覆盖当前清单、引文是否在对应行，以及两个哈希是否仍是当前正文和规则。`rule_audit` 与 `facts_diff` 默认都是 `off`。有效状态用 `project gates` 看，缺键等于 `off`。`--profile lite` 的上下文只带续写卡、事实上限、规则路径、到期伏笔前几条，以及少量规划或节奏信号。`facts_diff` 为 `required` 时，`chapter finish` 在主张冲突时不提交。字段见 [规则审稿](artifact-protocols.md#规则审稿) 和 [事实账本](artifact-protocols.md#事实账本与规划检查)。缺少角色事实可 query `--kind characters --search {角色名}`；信息边界分别查询 `reader-timeline`、`author-timeline`，历史原因查 `chapter --chapter {历史章}` 和对应原文。每项采用事实保留实际来源路径；静态设定不能替代动态状态，大纲未来计划不能当既成事实。拆文库命中用 `project lookup --reference`，结果标 `source: reference`，不能写进事实账本。

匹配作者习惯直接运行 `memory query --workspace {工作区} --book {作品名} --json`，只用 active 记录，当前指令和本书设定优先。用户要完整状态解释或修改记忆时加载 `story`。
