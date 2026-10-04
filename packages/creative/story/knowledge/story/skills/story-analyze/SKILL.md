---
name: story-analyze
description: "分析长篇或短篇小说的结构、人物、情绪、节奏与写作手法。用于拆文、研究参考作品、评估开头或全书结构；已有小说的接入和续写准备使用 story。"
---

# story-analyze — 小说拆解

根据用户问题确定原文范围与深度。缺少原文说明缺项，不凭书名或搜索摘要声称读过作品。

长篇和短篇都使用 `{工作区}/{作品名}/` 直接子目录。Session 工作区保持在其父级；工作区、`拆文库/` 和长短篇分类容器不是作品。无法从请求确定目标时先确认作品，不按修改时间跨书选择，也不自动迁移文件。

本 Skill 的参考路径相对 `SKILL.md`；只按当前问题读取 `references/`，不加载其他 Skill 的私有参考。跨任务用 `skill` 加载准确名称。`{CLI}` 是从本 Skill 目录向上四级解析的 `lib/cli.js` 绝对路径；运行 `node {CLI} <命令> --help` 查参数，实际结果以 `--json` 返回为准。作品命令显式传 `--workspace {工作区} --book {作品名}`；不依赖工作区 PATH，不直接运行包内私有脚本。

用户明确提供的外部 TXT/Markdown 可以直接分析，无需创建作品。分析命令使用 `--workspace {工作区} --title {来源书名}`，共享产物落在 `拆文库/{来源书名}/`；它不是创作作品，也不自动成为对标。

- 局部问题：读取相关原文，交付带位置与短引句的结论；需要保存时只写对应文件。
- 多章或全书：读 [长篇流程](references/long/workflow.md) 与 [批次 workflow](references/long/native-workflow.md)。父会话用 `analysis inspect` 核对至多四章及已有产物；本 Skill 的 `workflows/analyze-batch.js` 返回结构化卡片；父会话再用 `analysis write-cards` 校验原文身份并确定性落盘。
- 系统拆解短篇：读 [短篇流程](references/short/workflow.md)，不用长篇批次模板；需要方法与产物形状时分别查 [观察方法](references/short/material-decomposition.md)、[产物示例](references/short/output-templates.md)。

重要结论区分原文事实、解释和建议。节点、人物、反转、钩子按实际记录，允许零，不用最低配额补造内容。不改原文，不把猜测填成设定。

已有结果先复用。长篇批次只处理未完成或明确替换的章；返回卡片不是写入证明，只有 CLI 成功落盘且源身份仍一致才报告完成。失败保留原因为后续恢复提供缺章范围，不另写 workflow、后台摘要器或仅负责排版的模型任务。

批次完成后按至多 10 个卷段读原文与卡片，产出节奏、情绪模块、文风和报告；不再生成全章摘要汇总副本。单章需独立提取时委派加载 `story-analyze` 并读取 [章节提取员](references/roles/chapter-extractor.md)，传明确原文范围，不将成员创建成功当完成。

交付实际覆盖范围、核心发现、缺口与文件位置。仅分析不自动进入写作；应用分析创作时加载 `story-write`。
