# Creative

[English](creative.md) | 中文

小说、短剧、小说转游戏和视频解说分别由 `dsh-story`、`dsh-short-drama`、`dsh-novel-to-game` 和 `dsh-video-recap` 提供，各包拥有技能、工具、路由与独立侧栏。它们通过 [`@winterhuan/dsh-creative`](../../packages/creative/creative/README.zh.md) 聚合。DSH 继续拥有模型、会话、工具、权限和工作区；各包 README 说明配置与用法。

源码：[`packages/creative/creative/src/index.ts`](../../packages/creative/creative/src/index.ts)

## 四个接缝

**Skill 与 Role 供给。** 四个 `SkillProvider` 提供打包工作流及原生资源提示。专业 Agent 通过 DSH 委派或显式选择的 Team/workflow 工具工作，用原生 `read` 读取打包指令；Creative 不拥有专家执行器或独立模型、权限、协作系统。小说 workflow 模板在该原生执行中负责章节准备直至提交验证。

**付费生产。** `story_zhuque`、`drama_produce_run`、`video_produce_run` 及聚合兼容入口 `creative_produce_run` 是模型接触内置 Python 生产脚本及其提供方密钥的唯一途径。密钥存放在凭据库；设置命名空间只保存引用和非敏感配置字段；工具在每次调用时解析引用，并作为显式的子进程环境变量转发，因为其他所有子进程都从清理过的环境启动。短剧运行会消耗一次性的创作者确认，契约结论驱动有界的密钥轮换。

**投影意图。** `creative_production` 是并发安全的工具，除 Session 日志外没有副作用；浏览器工作台回放其结果来驱动短剧生产视图。它从不编辑创作文档，也不授权付费生成。待处理输入属于 Session 的 `inbox` 投影，持久的生产结果属于 Conversation 投影，展示草稿属于工作台 store。

**工作台路由。** `/creative` 是 Session 级 HTTP API，只信任回环地址或 `trustedHosts`，提供扩展名白名单、解析后路径的包含检查、`FsVersion` compare-and-swap 写入、分段媒体流、视频预检、CSP 隔离的游戏预览，以及核对归属后的作业停止。浏览器工作台只通过普通审批流程发送对话提示词来发起生产。

独立的 `creative-game` 侧边栏拥有仅含游戏状态的 Session store，读取 `/novel-to-game` API。游戏包提供四个任务技能、原著辅助脚本、`game_qa` 和隔离预览。Creative 没有浏览器页面，保留兼容 QA 与预览别名，不自行注册游戏 provider。

四个领域插件独立安装。Creative 只组合安装并保留 Host 工具和路由兼容，不再提供聚合页面或读取旧草稿。详见[拆分决策](../../.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.zh.md)。

## 交付证据

Host 将五份剧集文档作为同一受检版本读取，Python 创作文档检查器拥有结构诊断。带哈希的生产清单把已验证媒体关联到目标和请求。`episode-compose` adapter 复用视频语音、混音和字幕运行时。

游戏 QA 在共享预览策略下运行 Chrome，认证构建与证据哈希后才显示当前结果。视频本地草稿记录降级阶段；交付度量描述原片复用、旁白、授权声明与画幅。参见[游戏](../../.agents/notes/implemented/feature/2026-09-27-novel-to-game-playability-evidence.zh.md)、[短剧](../../.agents/notes/implemented/feature/2026-09-27-short-drama-finished-episode.zh.md)和[视频](../../.agents/notes/implemented/feature/2026-09-27-video-recap-delivery-and-compliance.zh.md)决策。

## 语言接缝

工作台界面文案通过各领域命名空间按语言提供（中文为基准，`en` 键完全一致），包括生产视图按代码渲染的协议诊断。工作区协议标识符（`正文/`、`剧集/EP001`、`SHOT-*`）、面向 Agent 的提示词构造和运行错误文本保持简体中文：它们属于 Skill 与 Host 守卫共用的创作协议，而不是浏览器界面。
