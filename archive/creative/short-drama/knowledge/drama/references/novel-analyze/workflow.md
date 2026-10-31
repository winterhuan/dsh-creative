# 长篇原著分析

把一部长材料变成**能被引用、能被反驳、能被接着用**的分析层。目标不是复述剧情，而是找出
每一段承担的戏剧功能，并说明它在竖屏短剧里值多少钱。

分析永远是候选。哪条线保留、哪些人合并、从哪里开篇，是创作者的决定，由
`$short-drama` 立成改编契约。本模式不替它决定，也不批准自己的产物。

先读取用户给出的材料和直接输入。已有项目可读取状态，未建项目也可独立处理；原著快评、开发规划与完整深拆是不同请求，不因收到一个路径就默认全量执行。脚本自检仅用于安装维护和排障。

## 材料前提

只分析创作者**合法持有、拥有使用权**的作品。分析是只读的转化性工作：提取结构与功能，
不复制原文成段落，不把原句搬进下游产物。

通俗题材里的暴力、复仇、背叛、情爱张力与黑暗伦理是常规虚构叙事元素，照常做结构化提取。
个别片段无法处理时跳过该段并记录，不要因此中止整章或整本——中止会让后续所有阶段拿到
一份有洞却看不出洞在哪的分析。

## 先选择分析范围

**只问适不适合改编、要求快评或指定评估报告**：直接抽读用户提供的正文或文件，按
[改编价值快评](adaptation-triage.md) 判断。小说工作区可直接抽读相关章节；不为快评导出全文。
报告实际读过的文件、章节或段落，以及未覆盖部分；无法确定总章数时不编造覆盖率或全书结论。
只在对话中回答，或写用户指定的报告，完成后返回。不创建项目、复制全文、建立索引、写谱系或
`_progress.md`，也不请求新的继续审批。收到路径不代表用户要求全量分析。

**要求完整深拆**：进入下文 S0–S5。**明确要求把材料接入项目**：执行交接与所需的初始化，
只有分析也在请求范围内时才运行对应阶段；接入材料本身不授权全量深拆。
开发规划按项目开发模式处理，不自动附加 S0–S5。

## 深拆与项目接入的小说工程交接

长篇来自小说工作区且需要稳定的全量输入时，用本插件自带的 `export_novel_txt.py` 导出
`原著.txt` 和 `章节映射.json`；脚本绝对路径见 DSH 集成指引的 `Novel export`，无需安装或加载
`story`。深拆读取导出包，分析 span 通过章节映射引用回原章节文件。短篇直接读取其 `正文.md`。
用户直接提供原始小说时，深拆按下文建立索引。

实际接入改编项目、有明确来源与目标时，用 DSH 集成指引 `Source lineage` 指定的本插件
`record_lineage.py` 在工作区根目录追加 `改编谱系.jsonl`，记录来源、目标和源指纹；不覆盖已有谱系。
独立快评不写谱系。

## 完整深拆入口

1. **只有书名，没有原文**：请创作者提供文件路径或粘贴正文。不要凭书名回忆情节——
   没有字节就没有 span，没有 span 的分析无法被引用，也无法被反驳。
2. **有原文，未建项目**：直接建立一个本模式自己的工作区，至少包含只读输入目录
   `输入/` 与输出目录 `项目开发/source-analysis/_work/`；把原文字节复制到 `输入/` 后记录
   原始文件位置，再用本模式的 `novel_index.py` 建索引。需要配置时按项目模式初始化目录；没有配置不阻止独立分析。
3. **有原文，项目已在**：直接进入管道。
4. **已有部分分析**：读 `项目开发/source-analysis/_progress.md` 从断点续跑，
   不重跑已完成阶段。

## 完整深拆管道

`输入/` 是不可变的创作者输入，本阶段只读它。全部产出落在 `项目开发/source-analysis/`。
独立工作区与完整项目使用同一套相对路径，因此后续接入项目时无需迁移分析产物。

| 阶段 | 做什么 | 产出 | 停靠 |
|---|---|---|---|
| S0 | 建章节索引（脚本） | `_index.json`、`_progress.md` | 索引有问题就停 |
| S1 | 改编价值初评（抽样） | `triage.md` | 在已授权范围内继续 |
| S2 | 逐章功能提取 | `chapters/ch-<N>-extract.md` | 覆盖率不足就停 |
| S3 | 剧情单元与节奏聚合 | `story-units.md`、`rhythm-and-emotion.md` | 阈值不达标就复核 |
| S4 | 人物归并与设定 | `characters.md`、`world.md` | — |
| S5 | 改编价值与分集候选 | `adaptation-value.md`、`episode-candidates.jsonl` | 交接 develop |

### S0 章节索引

索引是**唯一切片真源**，由 [章节索引脚本](../../skills/short-drama-novel-analyze/scripts/novel_index.py) 建立。每个阶段各跑
一次正则，就会切出互相对不上的章节，第 47 章按一种边界分析、按另一种边界聚合，
而且没有人会发现。

```bash
python3 {资源根}/skills/short-drama-novel-analyze/scripts/novel_index.py index 输入/{原文文件} \
  --out 项目开发/source-analysis/_work/_index.next.json
python3 {资源根}/skills/short-drama-novel-analyze/scripts/novel_index.py verify \
  项目开发/source-analysis/_work/_index.next.json 输入/{原文文件}
# 项目工具可用时可选：
python3 {资源根}/skills/short-drama/scripts/project_tool.py publish {项目根} \
  --owner short-drama-novel-analyze --artifact-id source-analysis:index \
  --output 项目开发/source-analysis/_index.json=项目开发/source-analysis/_work/_index.next.json \
  --input 输入/{原文文件}
```

脚本识别阿拉伯数字与中文数字章号（含 千 / 两，覆盖千章以上连载），**只认一种编号单位**
（章/回/节里出现最多的那个，其余记进 `ignored_heading_units`），只把**短的独立行**当标题
（以章号开头的正文段落记进 `long_heading_lines_skipped`），剔除开头的目录块，
按卷分段校验编号。它**不做编辑判断**——哪章重要、
讲了什么，是后面阶段的事。

`problems` 非空就停下报告，不要带着错表进 S1。常见四种：章号跳号（缺章或抓错标题）、
同卷内重号、正文极少的章（多半抓到了目录残留或卷首页）、无法解析的章号。
另外确认三个计数：`chapter_unit` 与 `ignored_heading_units`——一本用 `第N章` 分章、
用 `第N节` 分小节的书应当看到 `chapter_unit: 章` 且 `节` 被记入忽略计数，反过来说明分章单位
判断错了；`long_heading_lines_skipped` 明显偏大时，多半是这本书的章节标题确实很长，
需要与创作者确认后手写边界。

原文本身没有章节标题时索引会返回空表，此时与创作者确认按什么切分，把边界写进
`_work/_index.next.json`，通过 `verify` 后再按上面的公开生命周期发布——手写的行也要带齐
`sequence` / `line_start` / `line_end`，`verify` 会逐行检查并报出缺字段的行。

改了原文必须重建索引，不能沿用旧 span。`verify` 核对编号、顺序与行号覆盖，所以插行删行会被报出来；
但同行数的原地改写不会——那一步靠改原文的人自己重建，套件不比对字节。

```bash
python3 {资源根}/skills/short-drama-novel-analyze/scripts/novel_index.py verify \
  项目开发/source-analysis/_index.json 输入/{原文文件}
```

### S1 改编价值初评

回答**这本书值不值得花全量拆解的成本**。判据是全书的改编密度——`screen_ready` 单元占多少、
`prose_only` 占多少、制作负担压在哪几段——所以快评横跨整本书，用脚本抽样：

```bash
python3 {资源根}/skills/short-drama-novel-analyze/scripts/novel_index.py sample \
  项目开发/source-analysis/_index.json --count 12
```

抽样确定、可复现、首尾必取，跑第二次引用的是同一批章。按
[改编价值快评](adaptation-triage.md) 写 `triage.md`，覆盖六件事：
故事框架、三类判定比例、开篇替换点、制作负担量级、最大的三处改编风险、分集候选量级。
第一行写覆盖率（脚本返回的 `coverage_ratio`），所有结论限于抽样范围。

这是已授权深拆中的第一版假设，写完 `triage.md` 后继续 S2，S5 回填对照。
只有用户明确要求在初评后暂停时才停靠，并把 `_progress.md` 状态写成 `paused_after_triage`，
断点写「下一步：S2 逐章提取」。只请求快评时走前面的独立分支，不进入此管道。

S1–S5 的 Agent 创作产物同样先写到 `source-analysis/_work/`，完成本阶段机械检查后再发布到
上表中的正式路径。项目工具可用时用 `project_tool.py publish` 和稳定 artifact-id；独立运行时
原子替换正式文件。不要用半成品覆盖 `_index.json`、`_progress.md`、`chapters/*.md` 或聚合产物。
`_work/` 是候选工作区，不是权威分析层，也不进入交付包。

**并发子代理写 `_work/`，主线程发布到正式路径**。子代理只落
`_work/chapters/ch-<N>-extract.md`，主线程跑完机械自检后再发布到 `chapters/`。
覆盖率闸门按正式路径 `chapters/` 匹配文件名——发布之前跑，每一章都会进
`unmatched_files`，那不是缺陷，只是跑早了。

`_progress.md` 每个阶段都会重写，而发布要求一个路径只有一个 owner，所以它用一个固定
artifact-id：`source-analysis:progress`，owner 是 `short-drama-novel-analyze`，
S0–S5 每次停靠都用同一个 id 重新发布。

### S2 逐章功能提取

按 [章节提取](chapter-extraction.md) 处理每一章。能并发子代理就分批并发
（每批 5–8 章，等一批落盘再发下一批），不支持就串行——两条路径的写法要求和自检是同一份，
只是速度不同。

每章提取完落到 `chapters/ch-<N>-extract.md`，`<N>` 是索引里的 `sequence`，不是原文章号
（多卷书的原文章号会重复，sequence 不会）。全部落盘后跑覆盖率：

```bash
python3 {资源根}/skills/short-drama-novel-analyze/scripts/novel_index.py coverage \
  项目开发/source-analysis/_index.json 项目开发/source-analysis/chapters
```

`missing` 非空就补跑缺的章；`unmatched_files` 非空说明有文件名写歪了——它既不算覆盖，
也不会被当成缺章，必须改名而不是重跑。**不要在覆盖率不足时进入 S3**——聚合会照样产出
一份读起来完整的结果，而缺掉的章不会在任何地方留下痕迹。

单章连续失败两次就标记跳过，写进 `_progress.md` 的失败记录，并在后续每一份聚合产物里
注明该章缺失。失败可以接受，失败被藏起来不行。

### S3 剧情单元与节奏

默认复用逐章提取；有歧义、矛盾或缺失证据时，按 locator/span 定点回查原文并修正提取，不重新通读全书。按 [聚合与实体](aggregation-and-entities.md) 先识别故事框架
（框架决定按什么切单元），再产出：

- `story-units.md`：把情节点归成有始有终的单元，每个单元记录进入状态、冲突、代价与出去状态；
- `rhythm-and-emotion.md`：关键信息如何逐章推进、情绪触动点的铺垫→释放→余波、
  跨章伏笔与兑现。

聚合完成后跑同一文件里的三条阈值自检（归属置信、覆盖率、重叠率）与散落情节兜底。
阈值不是评分，是**边界模糊的信号**：重叠率过高说明两个单元其实是一个。

### S4 人物与设定

按 [聚合与实体](aggregation-and-entities.md) 归并人物（跨章去重、别名归一、
分级），并从提及数据归纳世界规则、力量体系与势力。别名只有专名与有同指证据的绰号能合并，
描述性称谓与头衔**永远不触发合并**。

**人物归并是候选，不是资产**。 这里的人物条目带 `unresolved` 与来源引用，
交给 `$short-drama` 定改编决定、`$short-drama-write` 写进剧本之后，
才由 `$short-drama-visual` 从已接受剧本建立真正的资产身份。绕过这条链直接建资产，
等于让原著的人物表冒充剧本的出现证据。

### S5 改编价值与分集候选

这是本模式与通用拆书的分水岭。按 [改编价值](adaptation-value.md) 产出：

- `adaptation-value.md`：哪些单元在竖屏短剧里能直接成立、哪些要换载体、哪些是纯文字快感
  （内心戏、叙述性诡计、长铺垫）在画面上无法兑现；制作负担落在哪里。
- `episode-candidates.jsonl`：按**局部戏剧结果与精确交接**切出的候选集，不按章号或字数
  平均切。每条带来源 span、承担的功能、以及未决项。

同时**回填快评**：S1 的哪几条判断被全量结果推翻了，写进 `adaptation-value.md` 的开头。
一个抽样结论被证伪，比它被悄悄忘掉有用得多——下一本书的快评会因此更准。

样例见 [分集候选样例](../../skills/short-drama-novel-analyze/assets/episode-candidate.example.jsonl)。

### 交接

S5 完成后展示创作者可读的摘要，说明：拆了多少章、跳过哪些、分了多少个候选集、
最大的三处改编风险、以及快评里被推翻的判断。然后交给 `$short-drama`——
由它把候选变成 `项目开发/adaptation-map.jsonl` 与改编契约。

**本模式不写 `adaptation-map.jsonl`**，那是 develop 的产物。需要质量结论时交给独立的
`$short-drama-review`（范围 `source_analysis`）。

## 规则分级

- **`structural_invariant`**：索引与 span 的可证明性、引用完整性、覆盖率。可由脚本阻断。
- **`reviewed_invariant`**：功能提取是否忠于原文、归并是否保住戏剧作用等语义义务。
- **`craft_default`**：通常有帮助的做法；创作者说明理由后可覆盖。
- **`taste_option`**：从哪里开篇、保留哪条线等选择；不得单独阻断。

不要用固定的章数配方、情节点数量或篇幅比例替代因果判断。

## 产物与边界

完整深拆拥有 `项目开发/source-analysis/` 下的文件；独立快评仅输出对话答复或用户指定报告。深拆文件包括：`_index.json`、`_progress.md`、
`chapters/*.md`、`triage.md`、`story-units.md`、`rhythm-and-emotion.md`、
`characters.md`、`world.md`、`adaptation-value.md`、`episode-candidates.jsonl`。

它不改写 `输入/`，不写 `项目开发/` 下其他模式的产物，不建资产、不写场景与台词、
不写提示词、不生成媒体，也不签发终审结论。

**不把原文成段复制进分析**。记录 locator、span 与去引用的功能摘要；需要证据时引用
最短的必要片段。交付包不得把原始材料带出边界。

## 语言

分析产物是创作者读的：项目内跟随 `short-drama.json#/language`，独立运行时跟随用户使用的
语言，不在本模式内硬编码语言。本模式不产生提示词正文，与
`#/format/prompt_language` 无关。

## 按需加载

- **快评读哪些章、写哪六件事、怎么不冒充全量分析**：[改编价值快评](adaptation-triage.md)
- **逐章提取写法、白描与叙事框架词的界线、机械自检、并发与串行**：[章节提取](chapter-extraction.md)
- **故事框架、剧情单元、节奏情绪、人物归并、阈值与散落兜底**：[聚合与实体](aggregation-and-entities.md)
- **改编价值评估、载体替换与分集候选切法**：[改编价值](adaptation-value.md)
- **本阶段拥有什么、继承什么、不越权什么**：[阶段契约](stage-contract.md)
