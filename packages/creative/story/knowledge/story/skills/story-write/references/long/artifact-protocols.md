# 产物创建模板

各产物的标准模板与创建指引。agent 在 Phase 2-3 过渡时按需加载此文件。

**模板列表：**
- 设定/关系.md
- 设定/题材定位.md（含读者契约 + 终局底牌/升级台阶 + 对标登记字段）
- 大纲/大纲.md（全书鸟瞰 + 全书体量与阶段总览）
- 大纲/卷纲_第X卷.md（含卷契约+终局储备+剧情单元+情绪弧线+反转规划）
- 追踪/_tracking-state.json（唯一结构化权威状态）
- 追踪/逐章记录/第NNN章.md（未来相关紧凑增量）
- 追踪/伏笔.md
- 追踪/时间线/作者真相.md + 读者已知.md（派生视图）
- 追踪/角色状态/{角色名}.md
- 追踪/上下文.md（续写状态卡，固定 7 栏）
- 对标/{对标书名}/拆文报告.md
- 对标/{对标书名}/原文/第XXX章_{章名}.md

**层级关系（全书 › 卷 › 剧情单元 › 章 › 情节点；故事线横向贯穿多个剧情单元）：**
- 大纲.md = 全书鸟瞰（每卷一两句话定位）
- 卷纲_第X卷.md = 单卷规划（剧情单元+情绪+人物+伏笔+反转）
- 细纲_第XXX章.md = 单章蓝图（单元ID/位置 + 读者期待与主角目标、阻碍、选择、后果、兑现、章尾问题 + 内容概括 + 多线情节安排 + 人物关系/出场顺序 + 情节细化 + 结尾设定/钩子）

**概念对照（统一叫法，减少混淆）：**
- **剧情单元** = 一段完整剧情（1.5-3 万字/数章，一个矛盾从起到收）。拆书侧就是 `剧情/{剧情单元名}.md`，本书侧就是卷纲里的**剧情单元卡**；理论叫法是「一级结构」。同一粒度，统一叫剧情单元。
- **故事线**（`剧情/故事线.md`）= 贯穿多个剧情单元的线（主线/感情线/成长线/夺宝线…），比剧情单元大一层。
- 「循环」一词只在**节奏义**保留（爽点循环、升级循环、小/中/大循环等），不再指代规划单元。

---

## 设定文件别名

`设定/` 下的 Markdown 可以声明别名，供 `project lookup` 和 `project context` 识别称谓、地名和功法。没有声明的旧文件仍然按文件名和一级标题匹配。只索引 `.md`；`写作检查.json` 不参与检索。

两种写法可以同时使用，别名会合并：

1. 文件开头的 YAML front matter。键用 `aliases` 或 `别名`，值是字符串或列表。
2. 一级标题之后、第一个二级标题之前，并且位于文件前 40 行内的 `别名：` 行。多个别名用顿号、逗号或空格分开，也可以写多行。

```markdown
---
aliases:
  - 林师兄
---
# 林动

别名：废物、账房学徒
```

每个文件最多采用 12 个别名，每个 2–40 字。更靠后的正文里出现「别名：」不当作声明。两个字的栏目标题（如单独的「关系」「文风」）不会当成精确实体。

---

## 写作检查配置

`设定/写作检查.json` 可以只写新键。`punctuation` 缺省时按 `preserve` 处理，写出时取 `preserve` 或 `normalize-narration`。文件不存在时同样按保留处理。还可以写 `rule_sources`、`forbidden`、`era`、`void_terms`、`rule_audit`、`facts_diff`、`rhythm`、`style`、`book_audit`、`cast_body_names`。未知键会报错，指出那个键，并列出这些支持的键。`rule_audit` 和 `facts_diff` 各取 `off` 或 `required`，缺省都是 `required`。旧书用 `project migrate-gates --legacy-off` 把缺着的键写成 `off`。取值非法的 `punctuation` 仍拒绝。只有 `punctuation` 的旧文件不改变既有检查：规则提取用下面的默认来源，`forbidden`、年代词和作废词都不扫描。`tests/reference/normalize-punctuation.js` 仍要求文件里有 `punctuation`，并且不接受其他键；那份对照不覆盖缺省标点或带新键的文件。

`chapter rules --workspace {工作区} --book {作品名} --chapter {N} --json` 在正文出现之前提取本章规则。结果模式是 `story-chapter-rules/v1`，含 `rules`、`scan`、`warnings`、`rules_sha256`、`omitted`，以及 `chapter` 和 `state_revision`。每条规则有 `id`、`text` 和 `source.path`、`source.line`。含末尾换行的一次结果不超过 16 KiB；放不下时从末尾依次丢掉规则、扫描行和 warning，丢掉的条数记入 `omitted`。`rules_sha256` 覆盖截断前的完整规则列表。同一输入的规则 ID 不变。来源文件或标题缺失时写入 `warnings`，命令仍成功。正文还不存在时只做提取，以及追踪里的作废词扫描。

`rule_sources` 是数组，每项为 `{ "file", "heading", "prefix" }`。`heading` 可以是字符串或字符串数组。写了这一键就整份替换默认来源，空数组不提取规则。键缺失时按默认来源。字段行去掉 `**` 后再认 `标题：内容`。占位、`无`、`没有`、`[待补充]`、整格 `{...}`，以及以「没有就写」开头的文字，都不单独生成规则。`OUT-P` 同一行只有一侧是占位时，保留另一侧。一条字段只拆出一段时 ID 不带序号；拆成多段时从 `-1` 编号。

| prefix | 默认 file | 默认 heading | ID |
|---|---|---|---|
| `OUT-P` | `大纲/细纲_第{chapter}章.md` | `执行边界` | 表头含「情节点」的列与该列合成 `情节点｜边界：执行边界`。情节点空则只写边界原文；边界为占位则只留情节点；两侧皆占位则跳过。`OUT-NNN-Pk` 的 k 用表内 `#` 列，`source.line` 是该行 |
| `OUT-NR` | 同上 | `本章禁止提前释放` | 按顿号、分号拆。`OUT-NNN-NR` 或 `OUT-NNN-NR-n` |
| `OUT-CAST` | 同上 | `出场顺序` | 整份名单一条，`OUT-NNN-CAST`。显式「无」不产生规则 |
| `OUT-GOAL` | 同上 | `主角目标` | 单字段一条，不拆句，`OUT-NNN-GOAL`。占位不产生规则 |
| `VOL-NR` | `大纲/卷纲_第X卷.md` | `禁止提前释放` | 当前剧情单元内，`VOL-<单元ID>-NR` |
| `VOL-BAN` | 同上 | `终局底牌边界` | 当前剧情单元内，`VOL-<单元ID>-BAN` |
| `VOL-BAN` | 同上 | `本卷禁碰的终局底牌` | 标题以「本卷」开头时搜整份卷纲，ID 为 `VOL-BAN` |
| `VOL-OLD` | 同上 | `必须删掉或后置的旧设计` | 节内表格行用分号接单元格，否则用列表。`VOL-OLD-n` |
| `CORE` | `设定/核心设定.md` | `本次必须修掉的旧稿病根` | 编号列表用原文编号，`CORE-n` |
| `CARD` | `设定/题材正文提示卡.md` | `禁止漂移`、`问种边界` | 节内正文按句号、分号拆句。`CARD-<节名>-n` |
| `STYLE` | `设定/文风.md` | `禁止` | 列表序号，`STYLE-n` |
| `STATE` | `追踪/_tracking-state.json` | `long_term_constraints` | 条目原文，`STATE-n`。其他标题 warning 后跳过 |

`{chapter}` 定位本章细纲。`第X卷` 选择剧情单元 `章节范围` 盖住本章、且范围最窄的那份卷纲。单元 ID 取自 `单元ID`。通用模板里没有「问种边界」「本次必须修掉的旧稿病根」或卷纲旧设计表时，对应来源给出 warning。

`forbidden` 是数组，每项 `{ "id", "pattern", "severity", "rule"? }`。`severity` 为 `blocking` 或 `hint`。`pattern` 是最长 200 字的正则，按 `u` 标志编译。非法、空白或超长的模式写入 warning 并跳过。`blocking` 只用于没有第二种读法的固定句子。`hint` 只报告。

`era` 是 `{ "deny": [], "allow": [] }`。`deny` 是纯子串匹配，命中为 blocking，例如「枪伤」会命中「持枪伤人」；误伤用 `allow` 列表缓解，这段文字落在某条 `allow` 里时跳过。`void_terms` 是字符串数组，命中 `long_term_constraints` 或 `continuity_risks` 时给 hint，表示作废条目仍在追踪里。ID 带上从 0 起的数组下标，第二条风险写作 `void:continuity_risks[1]:省港`，提示含该条目开头的一段原文。

同一句话出现在多个来源时，按去掉空白和句末标点后的文本合并。保留先出现的 ID。`text` 保持该句原文，其余 ID 放在可选字段 `also`（字符串数组）。编号不重排，两次运行结果一致。交给写手的一行在格式化时写成 `id: text`；`also` 非空时再接 ` also: ` 和这些 ID。`rules_sha256` 仍按原文接上 ` also: ID, ID` 之后的文本计算，同一输入的摘要不变。`OUT-P` 的 `text` 是合成句，合并按整句比较，不把 `｜` 两侧拆开。

`chapter check` 把上述 `blocking` 命中并入 blocking quality，`hint` 进入 advisories，不单独使检查失败。出场 hint 比较 `设定/角色/` 的文件名、文件头已声明的别名，以及追踪里的角色名。名字在名单原文里出现就算已列，分词仍作补充；分隔符包括顿号、分号、`→`、`->`、`与` 和 `和`。中文引号「」“”『』里的名字不算出场。未列的提示是「正文提到但细纲出场名单未列」。`chapter rules` 只用已经提取出来的 `OUT-NNN-CAST`。`chapter check` 直接读细纲字段；`rule_sources` 去掉 `OUT-CAST` 时，检查仍找「出场顺序」，除非另一条 `OUT-CAST` 来源改了标题。账本里 `kind` 为「能力」的条目，若本章早于 `since` 且正文含该条的名称或 ID 末段，扫描给 hint，ID 为 `skill:<账本 id>`。细纲「爽点」非空时另有 `OUT-NNN-PAY`。卷纲「原著事实校正与改编边界」「第一卷写作口径」（没有这一节时用「写作口径」）的编号条，只在正文或细纲提到其中的章号或两到四字专名时进入清单，ID 为 `CANON-n`、`OWN-n`。当前单元的「兑现方式与归属」生成 `OWN-<单元ID>`。这些标题缺失不产生 warning。

## 规则审稿

`chapter audit-verify` 校验一份 `story-rule-audit/v1`。默认读 `草稿/审稿/第NNN章.rules.json`。`--input` 可改成书内相对路径。路径离开本书时命令以 2 退出。

```text
node {CLI} chapter audit-verify --workspace {工作区} --book {作品名} --chapter {N} --json
node {CLI} chapter audit-verify --workspace {工作区} --book {作品名} --chapter {N} --input {书内相对路径} --json
```

JSON 含 `schema`、`body_sha256`、`rules_sha256` 和 `verdicts`。`verdicts` 每一项有 `rule_id` 和 `verdict`（`pass`、`violate`、`not_applicable`、`unclear`）。`violate` 必须带 `evidence`。每处证据是正文里从 1 起的 `line`，以及该行上的 `quote`。`reason` 和 `fix` 可选。结论只覆盖 `chapter rules` 返回的 `rules`，每条恰好一次。`also` 里的 ID 不另给结论。被 16 KiB 截掉的规则不审。审稿者不自创规则 ID。

`body_sha256` 是当前正文原始字节的 SHA-256。`rules_sha256` 必须等于当前 `chapter rules` 的同名字段。引文先去掉 `**`、空白和句末标点，再在对应行的同样归一化文本里查找。句中标点必须保留。对不上的引文会使校验失败。

校验通过时退出码为 0，结果模式是 `story-rule-audit-verify/v1`，含 `verified: true`、两个哈希，以及 `violate` 和 `unclear` 的 ID 列表。失败时退出码为 1，`verified: false`，`reasons` 列出全部原因。缺文件也是失败。写作检查文件非法时以 2 退出。

`rule_audit` 为 `off` 时，`chapter commit` 和 `chapter finish` 不要求这份文件。为 `required` 时，提交要求默认路径上的文件通过上述校验，并且每条 `violate` 的 `rule_id` 都出现在事务的 `accepted_findings` 里。`unclear` 和扫描 hint 只进入修改意见，不拦提交。门禁默认关闭。缺这个键等于 `off`。达标前不要写成 `required`。

### 标定

试点在第 001–012 章标定之后，才考虑把这本书的 `rule_audit` 写成 `required`。标定记录放在 `草稿/审稿/_calibration.md`。它不进事实账本，也不进追踪。`violate` 和 `unclear` 分开计数。`unclear` 不计入误报上限，也不拦提交。R1–R3 必须命中。已知干净章的误报 `violate` 不超过 1 条。改了规则来源或重写审稿之后，旧标定作废，重新走 R1–R3。本仓库不改试点书正文。

```markdown
# 规则审稿标定

- 书：
- 范围：第001–012章

## R1
- 章：
- 期望：violate
- 实际 verdict：
- violate 条数：
- unclear 条数：

## R2
- 章：
- 期望：violate
- 实际 verdict：
- violate 条数：
- unclear 条数：

## R3
- 章：
- 期望：violate
- 实际 verdict：
- violate 条数：
- unclear 条数：

## 干净章
- 章：
- 误报 violate 条数：
- unclear 条数：

## 结论
- 通过：是 / 否
- 通过前 rule_audit 保持 off
```

`accepted_findings` 是事务的可选数组，每项为 `{ "rule_id", "reason" }`，最多 12 条，`rule_id` 不重复。工具把它写进该章逐章记录的 `## 接受的规则例外`，不写入 `_tracking-state.json`。不写这个键或写成空数组时，逐章记录与没有该字段的事务相同。追踪 schema 写入版本 6，并读取版本 4 和 5。版本 6 增加 `facts` 摘要，条目仍在旁路账本。`project migrate --to 5` 去掉这个键且不删账本，也不改 `state_revision`。

---

## 全书体检

`book audit` 对一段连续章号做体检，返回 `story-book-audit/v1`。不加 `--write` 时不写文件、不改追踪。`--write` 只写一份 Markdown；省略路径时写 `草稿/体检_第A-B章.md`。路径必须是书目录内、`追踪/` 之外的 `.md`，拒绝绝对路径、`..`、`.` 和软链接。跨度最多 2000 章。

```text
node {CLI} book audit --workspace {工作区} --book {作品名} --from {A} --to {B} --json
node {CLI} book audit --workspace {工作区} --book {作品名} --from {A} --to {B} --write {书内相对路径} --json
```

退出码：没有 blocking 为 0，有 blocking 为 1，参数或配置错误为 2。`warn` 不使命令失败。同一输入的 JSON 和排序稳定。检查按注册顺序运行。`--issues` 另写一份 `story-issues/v1`，省略路径时是 `草稿/问题单.json`，必须是书内、`追踪/` 之外的 `.json`。默认体检不加 `--issues` 时不写这份文件。

JSON 含 `schema`、`range`（`from`、`to`）、`state_revision`（没有追踪文件时为 null）、`checks`、`findings` 和 `counts`。`--write` 成功后另有 `report_path`，值为书内相对路径。`checks` 每项是 `id`、`status` 和 `summary`。`status` 为 `fail`（有 blocking）、`warn`（只有 hint）、`pass`（跑过且没有发现）或 `skip`（这项不能跑）。一条 finding 含 `check`、`severity`（`blocking` 或 `hint`）、可选 `chapter`、`category`、`message`、可选 `evidence`、可选 `source`（`path`，以及有行号时的 `line`）。`counts` 是 `pass`、`fail`、`skip`、`warn`、`blocking`、`hint`。排序依次为 severity（blocking 在前）、检查注册顺序、章号（没有章号的在后）、`source.path`、`source.line` 的数值（没有行号的在后）、类别、说明。

| id | 做什么 | 状态 |
|---|---|---|
| `chapter` | 范围内每章复用 `chapter check` 的质量与规则扫描。正文缺失记 hint，不中断。没有细纲时跳过照搬比对。本章扫描里的作废词不在这里重复。 | 有 blocking 时 `fail`。只有 hint 时 `warn`。范围内没有任何正文时 `skip`。 |
| `health` | 复用健康查询，截止章是 `--to`，阈值用默认 30、20、40。伏笔和人物风险转成 hint。 | 没有追踪时 `skip`。有风险时 `warn`，不使命令失败。 |
| `cast-cards` | 追踪里的角色快照，在 `设定/角色/` 没有同名文件，也没有文件头已声明的别名。 | 有缺卡时 `warn`。没有追踪时 `skip`。没有快照时 `pass`。 |
| `reader-value-stale` | `reader_value_records` 里范围内、带 64 位十六进制 `body_sha256` 的记录，与当前正文或 `wordcount_records` 的哈希不一致。同一章合成一条，`message` 写明是当前正文、字数记录或两边。`summary` 按记录数计。哈希是正文原始字节的 SHA-256，完整值留在 `evidence`。字段不是对象时 `skip`。没有该字段时通过。正文和字数记录都不存在时不报。 | 有不一致记录时 `warn`。 |
| `void-entries` | `long_term_constraints` 和 `continuity_risks` 命中 `设定/写作检查.json` 的 `void_terms`，或条目含「作废」。ID 为 `void:<字段>[下标]:词`。伏笔状态已是「放弃」或「作废」但仍留在 state 里，ID 为 `void:foreshadow[<id>]:<状态>`。 | 有条目时 `warn`。没有追踪时 `skip`。写作检查文件非法时命令以 2 退出。 |
| `facts-stale` | 范围内来源章正文或字数记录的哈希与账本 `source.body_sha256` 不一致，或字数记录里的章不在 `covered_chapters`。没有账本文件时 `skip`。 | 有过期或缺章时 `warn`。 |
| `rhythm` | 卖点提醒间隔、爽点连续为「无」、情绪高峰间隔、同一章节定位连续超限。没有这些材料时 `skip`。 | 有提示时 `warn`。 |
| `plan` | 卷纲章节范围不连续；离卷末不超过 10 章时下一卷卷纲不存在，或创作参考登记里下一卷主对标状态仍含「扩卷前核实」。顶部缺少可解析的「章节范围：」，或某个剧情单元块缺少该行时，另给 hint，不因此改为 blocking。没有卷纲时 `skip`。 | 有 blocking 时 `fail`。只有 hint 时 `warn`。 |
| `cast-limits` | 力量体系超上限、禁用手段、关系阶段越过卡片上限，范围内至少三章出场仍无卡的已知名字，以及细纲「出场顺序：」里有、角色卡（含别名）没有的名字（`outline-cast`）。快照缺卡仍只由 `cast-cards` 报告。正文里两到三字的启发式称呼若不在卡、别名或出场名单上，是 `body-name`。单字名和单独的「道」不抽。没有其余发现时 `skip`。 | 力量问题为 blocking，其余为 hint。 |
| `style` | `写作检查.json` 的 `style`。段长、破折号、顶针、固定比喻超限先是 hint，同一指标连续 `streak` 章（默认 3）后为 blocking。`forbid_blank_lines` 的空行当场 blocking。没有 `style` 时 `skip`。 | 有 blocking 时 `fail`。 |

Markdown 报告以 `# 全书体检 第A-B章` 开头，列出 schema、修订号、范围，以及写出文件时的 `report_path`。`blocking` 逐条列出。同一章、同一 category、同一 message 的 hint 合成一行，写成「第N章 category M 处：第 2、27…行：说明」。行号按数值升序，超过 12 个时截断，总数仍写在「M 处」。64 位哈希在报告里只印前 8 位。JSON 的 findings 仍逐条保留。

新提交成功且章号能被 `book_audit.interval` 整除时，`chapter finish` 对这段章运行 `book audit`，结果放在 `book_audit`。间隔缺省为 10，可用 `book_audit.enabled` 关掉。模板只抄回该字段。已提交章只做验证时 `ran` 为 false。

## 事实账本与规划检查

事实账本是 `追踪/事实账本.json`，模式 `story-facts/v1`，不写入追踪 state，schema 仍是第 5 版。`kind` 为场地、伤情、账目、物件、能力、年代、指令。每条有 `source.body_sha256`。修改追加 `changes`，不覆盖原 `attrs`。写入持有 `追踪/.tracking-commit.lock/`。

```text
node {CLI} facts extract --workspace {工作区} --book {作品名} --chapter {N} --from {outline|body|both} --json
node {CLI} facts extract --workspace {工作区} --book {作品名} --chapter {N} --dry-run --json
node {CLI} facts record --workspace {工作区} --book {作品名} --chapter {N} --input {主张JSON} --json
node {CLI} facts query --workspace {工作区} --book {作品名} --kind {场地|伤情|账目|物件|能力|年代|指令} --subject {主体} --json
node {CLI} facts diff --workspace {工作区} --book {作品名} --chapter {N} --input {claims.json} --json
node {CLI} facts stale --workspace {工作区} --book {作品名} --json
node {CLI} chapter finish --workspace {工作区} --book {作品名} --chapter {N} --input {逐章事务.json} --json
node {CLI} project gates --workspace {工作区} --book {作品名} --json
```

`extract` 只扫描行首是七类 `kind`、后接冒号的行。`--from` 默认 `both`：细纲、本章规则原文，以及正文。后半段用 `|` 分开。`主体`、`对象`、`人物`、`角色` 写入 `subject`，不进 `attrs`。整数字段写成数字。`无`、`暂无`、`待补充` 跳过。稳定 id 前缀是场地 `VENUE-`、伤情 `INJ-`、账目 `ACCT-`、物件 `OBJ-`、能力 `SKILL-`、年代 `ERA-`、指令 `ORD-`。手写 id 可以不同；回归夹具里的账目 id 仍是 `ACC-`。同一 id 保留先出现的一行。默认写入 `草稿/事实/第NNN章.claims.json`，模式 `story-facts-claims/v1`，同时有 `claims` 和 `entries`。空数组仍是一份有效主张，表示该章已覆盖。`--dry-run` 不写文件。不把 `project lookup --reference` 的命中写进主张。再跑一次会覆盖默认路径；写手只在文件还不存在时抽取，手改因此留得住。

`record` 要求该章已提交，且正文原始字节的 SHA-256 与字数记录一致。空 `entries` 仍把该章记入 `covered_chapters`。`diff` 对同 id 同属性、值不同、且没有本章 `change` 的主张报冲突；未知 id 放进 `unmatched`，不算冲突。有冲突时退出码 1。`stale` 列出来源章正文已变的条目，以及有字数记录但不在 `covered_chapters` 里的章；有这类结果时退出码 1。没有账本文件时 `present` 为 false，`missing_chapters` 为空。缺章不由 `project check` 报告。`facts_diff` 为 `required` 时，提交要求 `草稿/事实/第NNN章.claims.json` 存在且 `diff` 通过。缺省或 `off` 不拦提交。

`chapter finish` 把一次收束收成 `story-chapter-finish/v1`。`rule_audit` 为 `required` 时先校验默认审稿；主张文件存在时做 `diff`；然后提交；提交成功且主张可读时 `record`；最后 `stale`。`chapter commit --with-facts` 走同一条路径。提交失败不写账本。记录失败不回滚正文：`committed` 为 true，`facts_recorded` 为 false，并带 `facts_error`。没有主张文件时 `facts_recorded` 为 false，`claims_present` 为 false。结果含 `phase`（`audit`、`diff`、`commit`、`record`、`done`）、`rules_sha256`、`claims_present` 和 `gates`。没有提供方字段。已提交且（无主张或已入账）时退出码为 0；未提交、主张在但未入账、或有 `facts_error` 时为 1。带外且用户接受自然长度时加 `--accept-current-length`。

`project gates` 只读，模式 `story-project-gates/v1`，退出码 0。它回显 `rule_audit`、`facts_diff`、`style`（`off` 或 `active`）、`streak`（没有 `style` 时为 null，有 `style` 且未写 `streak` 时为 3）、`facts_present`、`covered_chapters` 和 `stale`。缺了 `rule_audit` 或 `facts_diff` 等于 `required`。这条命令不改文件。工作台概览可以在确认后把这本书的门禁写成 `required` 或 `off`。`project migrate-gates` 把缺着的键写上，`--legacy-off` 写成 `off`。`project check` 另返回 `facts` 缺口。`project migrate` 把追踪升到 schema 6。`project status` 的形状不变。

`project context` 增加 `facts`（最多 2 KiB：年代、活跃角色未愈伤情、正文或细纲点到的主体）和 `volume`（最多 1.5 KiB：卷契约、当前单元、禁碰底牌；书旁 `拆文库/<主对标>/节奏卡/` 里盖住本章的卡片会附在同一段里）。省略顺序是设定摘录、事实、卷切片，然后才是健康摘要。`omitted.facts` 非零时用 `facts query` 补页。`--profile lite` 保留续写卡、事实上限、`rules_path`（`设定/写作检查.json`）和到期伏笔前 5 条，并附最多 4 条规划或节奏的 `signals`（blocking 在前）。角色、时间线、设定摘录和卷切片计入 `omitted`，不放进正文。`full` 的 `omitted` 仍是原来的七个计数；`lite` 另有 `omitted.signals`。缺省是 `full`。

```text
node {CLI} project rhythm --workspace {工作区} --book {作品名} --from {A} --to {B} --json
node {CLI} project plan check --workspace {工作区} --book {作品名} --chapter {N} --json
node {CLI} project cast check --workspace {工作区} --book {作品名} --from {A} --to {B} --json
node {CLI} project lookup --workspace {工作区} --book {作品名} --text {查询} --reference --json
node {CLI} analysis rhythm-card --workspace {工作区} --title {主对标} --chapters {A-B} --json
node {CLI} text style-baseline --workspace {工作区} --book {作品名} --chapters {A-B} --apply --json
node {CLI} project legacy archive --workspace {工作区} --book {作品名} --reader-value --json
node {CLI} project context retire --workspace {工作区} --book {作品名} --item {原文} --reason {原因} --json
```

`rhythm` 的缺省是 `max_no_payoff` 1、`min_peak_gap` 5、`max_peak_gap` 8、`peak_intensity` 8、`max_same_position` 2。书可以在 `rhythm` 里改这些整数。要改一本书的密度，先改细纲的爽点，或改这本书的 `rhythm`，不改包内缺省。有发现时退出码 1，发现都是 hint。`plan check` 在离卷末不超过 10 章时要求下一卷卷纲已在，且「创作参考登记」或「对标登记」里该卷主对标的状态不含「扩卷前核实」。约第 30 章之前备好下一卷。卷级「章节范围：」只写在「剧情单元」标题之前；单元范围只写在剧情单元块内。顶部已有可解析范围时跨度用它，否则用全文最小到最大章号。缺顶部范围或缺单元范围只是 hint，不把旧书改成 blocking。卷纲批准仍由人做。`cast check` 读 `设定/世界观/力量体系.md` 的境界表，以及角色卡头的 `关系阶段：` 和 `阶段序：`。境界和手段来自账本 `kind=能力`，不改追踪 schema。出场计数只看追踪快照名和已有角色卡文件名里至少两个字的名字。细纲「出场顺序：」按顿号、分号、箭头、「与」和「和」切开；名单有、卡无（含别名）是 hint `outline-cast`。正文启发式人名见 `body-name`，可用 `cast_body_names` 设为 `off`、`hint` 或 `blocking`，缺省 `hint`。`lookup --reference` 只读 `拆文库/<主对标>/角色/`、`设定/` 和 `剧情/剧情单元_*.md`，跳过 `原文/`、文件名含「章节摘要汇总」的文件，以及超过 512 KiB 的文件。命中带 `source: reference`，不是本书事实，不写入主张。只有再加 `--record` 才写入账本，`kind` 为对标，`origin` 为 reference，不计入 `covered_chapters`。对标过期看参考文件哈希，不看章节正文。不加 `--reference` 时结果与原来的设定检索相同。`rhythm-card` 把卡片写到 `拆文库/<书>/节奏卡/第A-B章.md`，不超过 2 KiB，并附节奏基准。默认三节按标题精确匹配：结构分布也认节奏分布、章节结构、结构段；桥段标签也认桥段、情节标签、套路框架位置；核心冲突也认核心矛盾、主要冲突。卡片标题用规范名。空节不写。`--sections` 用顿号或逗号列出标题，替换这三节，只做精确匹配。`style` 缺省不启用。启用后段长、破折号、顶针、固定比喻先是 hint，同一指标连续 `streak` 章（默认 3）后才 blocking。`forbid_blank_lines` 的空行当场 blocking。不要把每一章都设成 blocking。正文分布明显变化之后，再跑 `text style-baseline --apply` 重写这本书的 `style`。`legacy archive` 把 `reader_value_records` 移到 `追踪/_legacy/reader_value_records.json` 并删除 state 字段，`state_revision` 加 1。没有该字段时不改修订号。`context retire` 按原文从长期约束、连续性风险或下一章承诺里去掉一条，追加 `追踪/维护记录.md`，`state_revision` 加 1。修订事务本身仍不声明退役；要单独退役用这条命令。

每章用 `chapter finish` 收束。约每 10 章，finish 自己跑 `book audit` 并把结果放进返回值。事实冲突走修订，不留到下一章。

已提交章的改稿模板是 `workflows/revise.js`。阶段是 Locate、Plan、Rewrite、Audit、Submit。`approved` 为 false 且 Plan 返回 `needs_approval` 时停在 `needs_input`。改写后若默认主张文件不存在，运行 `facts extract`；失败是 warning，只有 `facts_diff` 为 `required` 才停下。Submit 使用 `mode=revision` 并运行 `chapter finish`。提交成功且主张文件存在时由 finish 入账，然后给出 `stale`。记录失败不回滚正文。

---

## 对标/{对标书名}/拆文报告.md

> **拆文库/对标关系**：`拆文库/` 是 analyze 的共享产出，多本长篇按 `设定/题材定位.md` 的登记直接阅读。`对标/` 里已有的副本仍可打开；新的引用不再复制进去。

此文件由 `story-analyze` 拆解管道输出（快速预览报告或完整拆文报告）。write skill 的职责是**读取**，不创建。

如需手动创建简版对标摘要（未使用 analyze skill 时）：

```markdown
# {对标书名} 对标摘要

## 基本信息
- 书名：{}
- 作者：{}
- 题材/类型：{}
- 目标平台：{}
- 成绩：{均订/在读/热度}

## 核心发现
- 开篇钩子：{类型 + 手法}
- 爽点密度：{约 N 字/次}
- 节奏模式：{描述}
- 可借鉴套路：
  1. {}
  2. {}
  3. {}

## 不建议模仿（禁止照搬）
- {}（只学结构，不抄桥段）
```

创建参考：`references/long/plot-special-topics.md` (对标书选择法则)

---

## 对标/{对标书名}/原文/第XXX章_{章名}.md

对标书章节原文，由用户手动放入或拆文管道导入。

```markdown
# 第{N}章 {章名}

{本章完整原文内容}

---
> 来源：{手动输入 / story-analyze 导入}
> 原始字数：{约N字}
```

---

## 设定/关系.md

```markdown
# 角色关系图

## 关系总览

| 角色 A | 角色 B | 关系类型{亲情/爱情/友情/敌对/师生/主从/利益} | 情感倾向{正面/负面/中性/复杂} | 当前状态 | 起始章节 | 变化节点 |
|--------|--------|---------------------------------------------|-----------------------------|---------|---------|---------|
| {名} | {名} | {类型} | {倾向} | {描述} | 第{N}章 | {事件} |

## 关系演变

{角色A}<->{角色B}：
- 起点：{初始关系}
- 转折：{章节·事件·变化}
- 当前：{现状}

## 核心冲突关系

{列出推动剧情的2-3对核心对立/合作关系}
```

创建参考：`references/methods/character-relations.md` (人物关系类型 + 关系图绘制)

---

## 设定/题材定位.md

```markdown
# 题材定位

## 基本信息
- 题材类型：{玄幻/都市/系统/...}
- 目标平台：{起点/番茄/晋江/其他；story-review 据此选平台 rubric}
- 核心梗：{一句话卖点}
- 微创新点：{与同类题材的差异}

## 读者契约（参 `references/long/reader-contract-and-progression.md`）
- 核心读者承诺：{读者来追什么爽感/情绪/关系/事业}
- 主角代理权承诺：{主角不可替代的判断、关键选择或贡献}
- 利益安全线：{核心资产/卖点不得被没收、转赠、无交换暴露的边界}
- 期待债：{开篇/本卷已承诺，何时以什么形式偿还}
- 题材边界：{个人逆袭/群像/导师/制度合作等；高层级机构出现时先核对}

## 终局底牌与升级台阶（防写无可写；开书填一次，日更只查。参 `references/long/reader-contract-and-progression.md`「终局储备与推进节奏」）
- 终局底牌（一次性资源，标最早解锁卷）：头号宿敌={}·第{X}卷；终极真相/身世={}·第{X}卷；金手指上限={}·第{X}卷；身份/地位终点={}·第{X}卷；核心情感确定={无感情主线可删}·第{X}卷
- 升级台阶：主体系{境界/等级/地图/势力层级}共{N}档 × 每档约{W}万字 应 ≥ 全书目标字数（不足则拉长体系/加地图层）；敌人/目标成梯队逐级解锁，禁止越级秒顶级
- 透支红线：① 未到解锁卷就动用终局底牌 ② 某条升级线逼近天花板、后面没台阶接

## 核心梗三分法
- 表层卖点：{读者一眼看到的吸引力}
- 深层爽点：{持续追读的情绪驱动力}
- 长线钩子：{支撑全书的悬念/目标}

## 对标分析（概要）
> 完整对标数据见 `对标/` 目录。此表仅做快速概览。

| 对标书 | 相似点 | 差异点 | 可借鉴 |
|--------|-------|-------|-------|
| {书名} | {点} | {点} | {点} |

## 对标登记（多对标时必填；cross-book-recall 跨书召回按此排序与预算）
- 主对标书：{书名；单对标可省，多对标必填}
- 对标书列表：

| 书名 | 题材类型 | 引用强度{辅/参考} | 用途 |
|------|---------|-----------------|------|
| {书名} | {类型} | {辅/参考} | {文风主对标/结构参考/…} |

## 题材框架
- 八节点位置：{当前处于哪个节点}
- 关键转折节点：{列出}
```

创建参考：`references/methods/long-genre-mechanics.md` (核心梗解析与运用 + 微创新与差异化设计)

---

## 大纲/大纲.md

全书鸟瞰。顶部为「全书体量与阶段总览」（总章节数/目标字数/全书情绪曲线/阶段划分/各阶段节奏公式/关键节点与钩子链，结构见 [Phase 3：大纲搭建](workflow-setup.md#phase-3大纲搭建)），其后接卷级大纲一段式汇总：

```markdown
# 大纲

## 全书体量与阶段总览
{按 Phase 3「全书体量与阶段总览」结构填写}

## 卷级大纲
### 第一卷：{卷名}（约 {X} 万字，{Y} 章）
- 功能 / 所属阶段 / 卷契约 / 终局储备 / 阶段边界 / 核心事件 / 起始状态 → 结束状态
（一段式汇总；展开见各卷 卷纲_第X卷.md）
```

---

## 大纲/卷纲_第X卷.md

卷纲是大纲的展开——大纲决定方向，卷纲决定节奏。包含本卷全部创作规划。卷级「章节范围：」只写在下面「核心信息」这一段，也就是「剧情单元」标题之前。单元范围只写在剧情单元块里。键名用「章节范围：」。

```markdown
# {卷名} 卷纲

## 核心信息
- 章节范围：第{X}-{Y}章
- 字数目标：{W}万字
- 本卷定位：{铺垫/发展/高潮/转折/收尾}

## 卷契约与终局储备（参 `references/long/reader-contract-and-progression.md`）

> 单章放开密度、宏观管住终局储备。主推线之外的线按剧情自然给战果，一战多得允许；真正要守的是本卷别动用还不该解锁的终局底牌。
- 卷契约：{本卷读者期待、主角高光、主要期待债}
- 本卷主推线：{1条承担本卷最大高潮的升级线：战力线/资源线/身份线/关系线/信息线/地图线/制度线/势力线/事业线/情感确定性}
- 本卷战果：{其余顺带兑现的线，轻触到大涨皆可；一战多得是好设计}
- 本卷解锁的终局里程碑：{参 `设定/题材定位.md`「终局底牌与升级台阶」小节，本卷推进或解锁哪一个大里程碑}
- 本卷禁碰的终局底牌：{尚未到解锁卷、本卷不得动用的宿敌/真相/身份/金手指上限}
- 契约风险：{契约安全 / 需补强 / 契约破坏；需补强时写清补强方式}

## 剧情单元卡（1–3 万字为可调经验值；存于卷纲内；不另建单独文件）

> 剧情单元 = 卷纲里的一级结构单元（见 outline-structure-theory.md「对标节奏迁移」），与下方「对标结构坐标」是同一单元的不同视角，不重复编排。单元长度按本书题材、既有兑现节奏与对标调整，不是硬门槛。规划各关键节点时消费权威文件的“关键节点四问”和期待所有权；无需主角亲自执行每个动作。高潮/兑现后可留短暂低压，以小而可见的收益/奖励承接下一轮压力。引入新地图/机构/能力/敌人/谜团时先检查换书债，不得借新鲜感逃避旧承诺。

### 剧情单元 {L卷号-序号}
- 单元ID：{L卷号-序号}
- 章节范围：{第A-B章}
- 对标剧情参照：{{书名}《剧情标题》（类型/桥段标签；借什么：结构分布/情节点索引/兑现方式）；可列 2-3 条，无对标写「无」}
- 单元节拍/章功能分配：{建立期待→尝试→加压/转向→决定性行动→兑现→余波；标对应章范围，可按题材删改；建卡时可按「对标剧情参照」剧情单元提炼的共性节拍填写，见 outline-structure-theory.md「按剧情批出细纲」}
- 单元承诺：{本单元向读者建立的情绪命题/期待，以及要偿还的期待债}
- 单元情绪引擎：{核心情绪命题→承载对象/情绪缺口→受阻或缺口维持原因→本轮触发→主角不可替代的点火/转化动作→意义变化或可见兑现→题材/契约兑现；承载对象可为人物/关系/目标/规则/场景；不适用环节可写无/即时，但须保持因果闭合；机制按题材选，不强制误解/物件/反转}
- 卷级贡献：{它如何服务本卷契约、阶段节奏或卷级目标}
- 主角局部目标与核心利益：{主角本单元要保住/拿到/证明什么}
- 因果入口：{由上一单元或既有事件自然引出的入口}
- 核心阻碍：{主要敌意、限制、误判或资源缺口}
- 关键选择与决定性行动：{主角不可替代的判断、选择和行动}
- 兑现方式与归属：{核心兑现如何发生，收益归谁、如何可见}
- 本单元主推线/战果：{沿用卷契约划分——主推线1条承担高潮，其余线给战果，一战多得允许}
- 终局底牌边界：{本单元不得动用的未解锁宿敌/真相/身份/金手指上限；碰到就按权威文件透支两问改纲}
- 禁止提前释放：{本单元不能提前解决/揭露/升级的内容}
- 下一单元因果钩子：{自然推入下一单元的问题、代价、线索或新目标}
- 风险等级：{契约安全 / 需补强 / 契约破坏；需补强时写清补强方式}

## 核心矛盾
{一句话：本卷要解决什么问题或达到什么目标}

## 对标结构坐标
{有对标书时填；无则写"无对标，按本书因果与阶段目标安排"。迁移步骤见 outline-structure-theory.md「对标节奏迁移」；对标关键情节优先取自被参照剧情单元的「情节点索引」}
- 主对标卷段：{对标书}第{A}-{B}章（核心矛盾对应：{一句话}）

| 归一化位置 | 本卷章区间 | 对标关键情节 | 本卷对应（换素材） | 类型{逆转/转折/激励} |
|-----------|-----------|-------------|-------------------|---------------------|
| 1/4 | 第{N}章 | {对标事件} | {本卷事件} | {类型} |
| 中点 | 第{N}章 | {对标事件} | {本卷事件} | {类型} |
| 3/4 | 第{N}章 | {对标事件} | {本卷事件} | {类型} |

## 情绪弧线
- 模板：{V形/倒V形/W形/渐进形/延迟满足形/急转弯形}
- 选择理由：{结合题材和本卷定位}

| 章节 | 章节定位{可留空} | 情绪基调{紧张/轻松/悲伤/热血/温馨/震惊} | 情绪强度{1-10} | 触发事件 |
|------|------------|-----------------------------------------|--------------|---------|
| 第{N}章 | {高压/推进/修炼试错/关系回收/低压生活/信息整理} | {基调} | {N} | {事件} |

> 章节定位可留空，留空按普通推进章处理（即退化为现状）。情绪强度是情感烈度，和章节定位的爆发压力是两回事——关系/泪目章可低压力但高情绪强度。一卷要有高低层次，低压与过场按题材需要安排，避免全程同一力度；相邻章情绪重复时检查是否仍有新的变化。章节定位与底线见 outline-structure-theory.md「章节定位与张弛」。

## 人物弧线
| 角色 | 本卷起点 | 本卷终点 | 关键转变 |
|------|---------|---------|---------|
| {名} | {状态} | {状态} | {事件} |

## 本卷反转（如有）
| 类型{身份/动机/阵营/信息/命运} | 涉及角色 | 误导路径 | 揭示章节 | 影响范围 |
|------|---------|---------|---------|---------|
| {类型} | {名} | {如何误导读者} | 第{N}章 | {影响哪些线} |

## 本卷伏笔
| 伏笔 | 埋设章节 | 预计回收 | 类型{短期/中期/长期} |
|------|---------|---------|---------------------|
```

创建参考：`references/methods/outline-methods.md` (大纲三层结构法) + `references/methods/outline-rhythm.md` (升级感三步设计法) + `references/methods/emotional-arc-design.md` (六种弧线速查) + `references/methods/long-reversal.md` (反转类型与长线层级)

---

## 大纲/细纲_第XXX章.md

细纲是正文写作的章节蓝图，而不是只列事件和钩子的清单。**模板唯一权威副本**见 [Phase 3：大纲搭建](workflow-setup.md#phase-3大纲搭建) 的「细纲（全书每章）」模板（含单元ID/位置、读者期待与主角目标、阻碍、选择、后果、兑现、章尾问题、任务卡点、结构公式、契约风险行，以及不含逐点字数的情节点表格）；本文件不再保留模板副本。新建、补建、回填都按权威模板补齐，未知字段写 `[待补充]`，不为补齐字段杜撰副线或人物关系。

读者价值和场景执行字段必须写具体行动、取舍与变化，不能留占位符；字段定义以工作流模板为准。脚本只判结构和占位符，主会话须另行核对是否只有抽象标签。

落盘后运行 `node {CLI} outline check --json --workspace {工作区} --book {作品名} --chapter {N}` 做结构验收：它只判字段、四个小节、五段式、四列情节点表和字数目标口径是否在场，不判内容好坏。exit 1 时只按 `repair_scope` 补报告点名的字段并复验，最多两轮；仍失败就报告检查 ID 停下，不改其他章。exit 2、脚本缺失或 Python 不可用时如实报告验收未完成，不得声称细纲已合规。正式章节写作前也必须通过细纲就绪检查；旧细纲缺少必需语义时先补齐再写正文。

---

## 追踪体系

追踪产物由 `chapter commit` 统一生成。完整 schema 和事务字段见 [tracking-transaction.md](tracking-transaction.md)。以下文件不得由模型各自追加或局部 Edit：

### `追踪/_tracking-state.json`

唯一结构化权威状态。记录 schema、最后提交章、导入截止章、`state_revision`、续写上下文结构，以及全部角色、伏笔和时间线当前状态。日更通过 `node {CLI} project check --workspace {工作区} --book {作品名} --json` 的紧凑输出取章号和修订号，不把完整 state 加入正文 prompt。所有 Markdown 都从本文件确定性派生，程序不反向解析 Markdown。

### `追踪/逐章记录/第NNN章.md`

本章未来相关连续性记录，目标 ≤1536 字节、硬上限 3072 字节，只含：实际结果、角色变化、伏笔变化、时间/揭示、连续性约束、下一章承诺。过程日志、质检统计、参照章和提示词记录不进入。它不承诺单独无损重建全部当前状态；完整当前语义以 `_tracking-state.json` 为准。

### `追踪/伏笔.md`

每个 ID 只保留一行当前状态：内容、埋设章、计划回收章、状态、重要度、最近变更章。变化历史由对应逐章增量承担。尚未实际埋设的未来伏笔规划留在大纲；当前表只接受 `已埋 / 已回收 / 已过期 / 放弃`。

### `追踪/角色状态/{角色名}.md`

只为核心、会复用角色建立动态快照，含截至章节、身份、位置、当前目标、身心状态、能力资源、关键关系、已知信息和未结事项。目标 ≤4096 字节、硬上限 8192 字节；超过目标先合并失效能力、旧关系和已结事项，不把角色履历塞进当前快照。静态原始人设仍在 `设定/角色/{角色名}.md`；路人、一次性角色不建动态文件。

### `追踪/时间线/`

- `_tracking-state.json.timeline`：同一事件登记故事时间、客观事实、读者当前认知、实际揭示状态/章节。
- `作者真相.md`：从 `_tracking-state.json.timeline` 派生，作者侧可见全部客观事实和认知差。
- `读者已知.md`：从 `_tracking-state.json.timeline` 派生，只显示读者已经知道/相信的内容，不泄露客观真相。

未来揭示计划写卷纲/细纲，不写进既成事实登记；`未揭示` 事件的 `reveal_chapter` 必须为空。

### `追踪/上下文.md`

续写状态卡不超过 12288 字节，固定 7 栏：`当前位置 / 长期约束 / 核心角色状态 / 活跃伏笔 / 近三章速记 / 下一章承诺 / 连贯性风险`。它是当前语义检查点之一；不放文风、质量计数、普通待办、索引统计和长期概要。
