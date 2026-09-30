---
name: story
description: "小说创作入口：新建工程、接入已有小说、选题扫榜和管理作者习惯。用于准备写书、导入或继续已有作品、记住我的写作习惯；明确的写作、拆解、审稿、润色和封面任务直接使用对应技能。"
---

# story — 小说入口与工程准备

先检查当前工作目录和用户已给的材料，复用已完成的工作。信息足够时直接处理；只询问会改变目标作品、输出位置或任务范围的缺项。

| 用户目标 | 处理方式 |
|---|---|
| 开书、准备或修复工程 | 按下方工程准备执行，再进入 `story-write` |
| 导入 TXT/Markdown、接续已有小说 | 读取 `references/intake/workflow.md`，无需先拆全书 |
| 选题、扫榜、了解市场 | 读取 `references/research/workflow.md` |
| 设定、大纲、写正文或续写 | 加载 `story-write`，按作品形态选择长篇或短篇 |
| 分析、拆解作品或参考书 | 加载 `story-analyze` |
| 审稿、验收 | 加载 `story-review`；审稿不改文 |
| 去 AI 腔、润色、朱雀检测 | 加载 `story-polish`；普通润色只在本地进行 |
| 小说封面 | 加载 `story-cover` |
| 记住、查看、确认或忘掉写作偏好 | 读取 `references/project/author-memory.md`，使用 `scripts/author_memory_commit.py` |

所有 `references/` 和 `scripts/` 路径以 DSH 给出的资源根目录为基准，使用原生 `read` 按需读取。无需先遍历或通读资料目录。作者习惯只有收到 Author Memory Receipt 后才可宣称已保存。

## 工程准备

只初始化或校验当前 DSH workspace 中的小说数据，保留已有正文、设定、大纲和追踪文件。

- 已有标准工程直接继续，不重新导入、不重建追踪。工作台识别项目根目录；新书若位于子目录，提示切换到具体小说目录。
- 长篇按当前任务创建 `正文/`、`设定/`、`大纲/`；进入正式章节流程时按 `references/writing/long/tracking-transaction.md` 初始化追踪。第一章正文落盘前准备对应细纲。
- 短篇按需使用 `设定.md`、`小节大纲.md`、`正文.md`，不强加长篇追踪。
- 不为填满模板编造事实，不用空文件冒充完成。未决方向与已确认设定分开。
- 专业角色可通过 `creative_role` 辅助；简单任务直接完成。模型、权限和会话由 DSH 管理，项目里不需要平台配置或部署标记。

完成后说明实际创建、保留的文件和仍缺的信息。小说文件通过“小说”工作台查看。

## 跨域改编

长篇需要单一原文时，用 `scripts/export_novel_txt.py --story-root <小说目录> --out-dir <导出目录>` 生成原著和章节映射；短篇可直接使用 `正文.md`。用 `scripts/record_lineage.py` 记录来源与目标，参数与交付边界见 `references/intake/workflow.md`。

改短剧加载 `short-drama-novel-analyze`，改游戏加载 `novel-game-analyze`；成片解说交给 `video-recap`。只在相应插件已安装、技能可见时调用。
