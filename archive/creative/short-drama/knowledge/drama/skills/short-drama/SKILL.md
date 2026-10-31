---
name: short-drama
description: 短剧项目与改编：初始化、续接、开发点子和分集规划，按需做原著快评或深度分析，导出当前成果。写剧本用 short-drama-write，视觉制作方案用 short-drama-visual。
---

# 短剧项目与改编

先确认用户给出的目录、素材与本次产物。已有材料可直接进入相应任务；收到小说路径不等于要求全书分析，已有剧本不强制补开发文件。裸调用只展示当前进度与可做的下一步。

按 DSH 给出的资源基目录，用原生 `read` 读取本次相关参考；下表路径相对于资源根。脚本在 `skills/<资源组>/scripts/`，这些目录名是运行资源位置，不都是可调用技能。

| 用户任务 | 按需资料与结果 |
|---|---|
| 初始化、项目配置、打开工作台、导出 | `references/project/workflow.md`；需要配置时使用 project_tool |
| 点子、改编方案、故事引擎、分集规划 | `references/develop/workflow.md`；只产出请求需要的规划 |
| 小说改编价值快评、明确要求深拆 | `references/novel-analyze/workflow.md`；区分快评与完整分析 |
| 已有多集整稿划分、接续索引 | `references/develop/multi-episode-intake.md`；保留原文边界和来源 |
| 写或改剧本 | 加载 `short-drama-write` |
| 视觉设定、图片提示词、分镜、视频提示词 | 加载 `short-drama-visual` |
| 实际生成媒体、配音、音乐或成片 | 加载 `short-drama-produce`，须本次预览后的明确确认 |
| 审查当前材料或媒体 | 用户要求时加载 `short-drama-review` |

每集最多按需维护 `剧集/<EP>/` 的剧本、视觉设定、分镜、图片提示词和视频提示词五份 Markdown；不预建空文件、不补造名义阶段，不建立第二套创作索引或接受记录。字段格式见 `references/project/creator-documents.md`；长材料分析的机器索引与付费运行账本有独立用途，可以保留。

在用户授权范围内连续完成，批次仅控制上下文；普通可修错误直接处理。改变主角、结局、视觉方向等真实分叉才澄清；项目级已确认选择及时写入配置。原著分析是候选，不能冒充已确定改编方案、剧本出现事实或资产身份。

源材料来自小说工程时使用集成指引中的 `Novel export` 和 `Source lineage` 辅助脚本，无需安装 story 插件。保留来源与缺口，不将原文成段复制进分析或交付包。

需要制作形态、Look Development、项目级导演阐述时分别读取 `references/project/production-form-profiles.md`、`references/project/look-development.md`、`references/develop/director-brief-craft.md`。未请求时不加载或执行。

当前状态导出不声明审批；正式带审批交付使用项目工具的 package/verify。外部生产与付费分析均保留精确预览和本次确认，普通“继续”或上游接受不代替确认。安装自检仅用于维护。
