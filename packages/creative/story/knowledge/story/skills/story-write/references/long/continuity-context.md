# 本章写前事实

当前书固定为 `{工作区}/{作品名}/`。只读取本章需要的事实，使用 Skill 定位的 CLI；状态查询与检查不推进创作。

```text
node {CLI} project check --workspace {工作区} --book {作品名} --json
node {CLI} project query --workspace {工作区} --book {作品名} --kind foreshadow --filter due --chapter {N} --json
```

从 check 获取 `last_committed_chapter` 与 `state_revision`。状态卡最多展示 8 条活跃伏笔，不能代替全部到期项；有 `next_offset` 时保持筛选参数并带 `--offset {next_offset} --revision {state_revision}` 继续。修订号变化须从第一页重查，任何页失败或未覆盖剩余项都停止依赖它的准备。

把到期义务与已确认卷纲核对，不能为方便写作自动延期或标记已回收。缺少角色事实可 query `--kind characters --search {角色名}`；信息边界分别查询 `reader-timeline`、`author-timeline`，历史原因查 `chapter --chapter {历史章}` 和对应原文。每项采用事实保留实际来源路径；静态设定不能替代动态状态，大纲未来计划不能当既成事实。

匹配作者习惯直接运行 `memory query --workspace {工作区} --book {作品名} --json`，只用 active 记录，当前指令和本书设定优先。用户要完整状态解释或修改记忆时加载 `story`。
