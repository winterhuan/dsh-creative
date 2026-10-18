# Agent Note: Chapter rules before prose

Status: implemented

[English](2026-10-18-story-chapter-rules.md) | 中文

## 问题

长篇正文可以违背本章细纲和核心设定，而 `chapter check` 仍然通过。该检查测量长度、细纲就绪、退化、标点和照搬。它不在草稿出现之前，把本章的执行边界、禁止提前释放、出场顺序、卷级限制和文风禁令交给写手，作为一份 ID 稳定的清单。后一步独立审稿要复用这份清单，清单和 ID 必须已经存在。

## 决策

`chapter rules` 提取这份清单，返回 `story-chapter-rules/v1`。每条规则有 ID、原文，以及来源路径和行号。同一输入下 ID 不变。含末尾换行的结果不超过 16 KiB。放不下时从末尾依次丢掉规则、扫描行和 warning，丢掉的条数记入 `omitted`。`rules_sha256` 覆盖截断前的完整规则列表。缺文件或缺标题变成 warning。命令以 0 退出。

`OUT-P` 的 `text` 是同一行的 `情节点｜边界：执行边界`。情节点为空或占位时只保留边界原文。边界为占位时只保留情节点。两侧都是占位则不生成这条规则。`主角目标` 是一条 `OUT-NNN-GOAL`。缺这个字段时写入 warning。`rule_sources` 仍可整份替换，未知前缀跳过。`also`、`rules_sha256` 和 16 KiB 截断的算法不变。

默认来源和 `设定/写作检查.json` 的可选键写在[产物协议](../../../../packages/creative/story/knowledge/story/skills/story-write/references/long/artifact-protocols.md)。写出 `rule_sources` 就整份替换默认来源。键缺失时保留默认。文件只设置 `punctuation`，且细纲没有 `出场顺序：` 字段时，章节检查保持原先的结果。缺省 `punctuation` 时按保留处理，其余键可以单独使用。同一句规范化文本保留最先出现的规则 ID。`text` 保持该句原文，其余 ID 放进可选的 `also` 数组。交给写手的一行在 `also` 非空时再接 ` also: `。`rules_sha256` 仍按接上之后的文本计算，同一输入的摘要不变。出场命中认名单原文里的名字，跳过中文引号里的名字，提示写明正文提到了名单未列的人。作废词 ID 带上该条目从 0 起的数组下标。

`blocking` 只用于只有一种读法的配置模式和年代词。`hint` 报告正文里出现、但出场名单没有的人名，仍留在约束或风险里的作废词，以及其他配置的 hint。hint 不使 `chapter check` 失败。`chapter rules` 的出场扫描使用已经提取的出场规则。`chapter check` 直接读细纲字段；`rule_sources` 去掉 `OUT-CAST` 时，检查仍找「出场顺序」，除非另一条 `OUT-CAST` 来源改了标题。能力是否早于获得章不在这次变更里。那需要以后的事实账本，追踪 schema 仍是第 5 版。[全书体检](2026-10-18-story-book-audit.zh.md) 在一段章号上复用这次章节扫描和作废词 ID。它不取代这条命令。[规则审稿](2026-10-18-story-rule-audit.zh.md) 逐条判断返回的 `rules`，并可以拦住 `chapter commit`。它也不取代这条命令。

原生单章模板在 Prepare 运行该命令，把最多 12000 字的 `id: text` 放进写手任务，并要求写手逐条遵守、在说明里引用 ID。欠长的草稿仍然禁止补字。

[读者价值决策](2026-09-22-novel-reader-value-generation.zh.md) 仍负责模式和标点的建议级行为。[原生 workflow 决策](2026-10-03-story-native-workflow.zh.md) 仍负责规则审稿子会话以外的阶段顺序。两份记录都没有被整份取代。

## 考虑过的替代方案

**把某一本书的标题写死在提取器里。** 另一本书就要改代码。默认来源跟随当前模板，每本书用 `rule_sources` 替换。

**只抽取执行边界一列。** 审稿看不到情节点有没有发生。合成句把情节点和硬约束放在同一条 ID 上。

**边界为占位就整行跳过。** 情节点不再进入清单，缺了这一拍也不会被审到。占位边界仍留下情节点。

**标题缺失就让命令失败。** 通用模板本来就没有部分默认标题。warning 让 Prepare 继续，写手也能看见缺口。

**把新增命中全部放进 blocking quality。** 出场重叠和留下的作废词有歧义。只有固定句子或年代词会使检查失败。

**只在 `chapter rules` 里做出场扫描。** 写手已经在跑的门禁是 chapter check。检查自己读细纲字段，所以覆盖配置拿掉出场规则之后，正文仍可被扫描。

**在这次变更里用事实账本扩展追踪 schema。** 能力时序需要那份账本。这次变更保持 schema 第 5 版。

## 影响

写手在正文之前拿到可核对的清单，章节检查可以因配置过的无歧义命中而失败。只把 `quality.status` 当门禁的写手可以留下未处理的 hint。以后的独立审稿可以直接读 `rules`、`rules_sha256` 和 `scan`，不必再写一套解析器。只按通用模板建书的作品，会对模板里没有的标题看到 warning。`rule_sources` 去掉 `OUT-CAST` 之后，`chapter check` 仍可能报出场 hint。Python 标点对照只接受 `punctuation`。

## 验证

`packages/creative/story/tests/fixtures/regression/chapter-rules/` 的合成夹具覆盖每个默认前缀、缺失标题、来源覆盖、16 KiB 截断、blocking 与 hint、出场 hint、叙述式名单、引号中的提及、作废词序号、重复句子、缺省标点键，以及只有标点配置时章节检查保持不变。workflow 测试要求 ready 路径带上 `chapter_rules`，并保留禁止给欠长草稿补字的那一句。设置 `SHENJI_BOOK` 时只读冒烟，未设置则跳过。夹具不含小说原文。仓库 typecheck、build、全量测试和文档检查覆盖这个包。没有真实 DSH 浏览器会话，也没有真实模型调用跑过这条命令。
