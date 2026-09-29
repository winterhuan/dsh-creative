# Creative

[English](creative.md) | 中文

由 [`@winterhuan/dsh-creative`](../../packages/creative/creative/README.zh.md) 拥有的小说、短剧、小说改游戏和视频解说生产工作台。一个进程内插件打包了四棵 Skill 树、七个专家 Role、生产工具、Session 级工作台路由，以及位于 [右侧 Sidebar](../../upstream/docs/subsystems/sidebar-right.md) 的浏览器工作台；模型、Session、工具、权限和根目录仍由 DSH 负责。配置、工具和用法由包 README 负责。

源码：[`packages/creative/creative/src/index.ts`](../../packages/creative/creative/src/index.ts)

## 四个接缝

**Skill 与 Role 供给。** 四个 `SkillProvider` 提供内置的 `knowledge/` 目录，并在每份 Skill 正文前加上 DSH 桥接说明，因此任何工作流都不会另起创作界面、Agent 运行时或传输通道。`creative_role` 以 spawn 子 Agent 的方式运行七个 Role，每个 Role 使用宿主拥有的模型选项和各自的工具白名单；`creative_bundled_reference` 是读取打包参考文件的唯一途径。

**付费生产。** `creative_produce_run` 是模型接触内置 Python 生产脚本及其提供方密钥的唯一途径。密钥存放在凭据库；设置命名空间只保存引用和非敏感配置字段；工具在每次调用时解析引用，并作为显式的子进程环境变量转发，因为其他所有子进程都从清理过的环境启动。短剧运行会消耗一次性的创作者确认，契约结论驱动有界的密钥轮换。

**投影意图。** `creative_production` 是并发安全的工具，除 Session 日志外没有副作用；浏览器工作台回放其结果来驱动短剧生产视图。它从不编辑创作文档，也不授权付费生成。待处理输入属于 Session 的 `inbox` 投影，持久的生产结果属于 Conversation 投影，展示草稿属于工作台 store。

**工作台路由。** `/creative` 是 Session 级 HTTP API，只信任回环地址或 `trustedHosts`，提供扩展名白名单、解析后路径的包含检查、`FsVersion` compare-and-swap 写入、分段媒体流、视频预检、CSP 隔离的游戏预览，以及核对归属后的作业停止。浏览器工作台只通过普通审批流程发送对话提示词来发起生产。

## 交付证据

Host 将五份剧集文档作为同一受检版本读取，Python 创作文档检查器拥有结构诊断。带哈希的生产清单把已验证媒体关联到目标和请求。`episode-compose` adapter 复用视频语音、混音和字幕运行时。

游戏 QA 在共享预览策略下运行 Chrome，认证构建与证据哈希后才显示当前结果。视频本地草稿记录降级阶段；交付度量描述原片复用、旁白、授权声明与画幅。参见[游戏](../../.agents/notes/implemented/feature/2026-09-27-novel-to-game-playability-evidence.zh.md)、[短剧](../../.agents/notes/implemented/feature/2026-09-27-short-drama-finished-episode.zh.md)和[视频](../../.agents/notes/implemented/feature/2026-09-27-video-recap-delivery-and-compliance.zh.md)决策。

## 语言接缝

工作台界面文案通过 `creative` 命名空间按语言提供（中文为基准，`en` 键完全一致），包括生产视图按代码渲染的协议诊断。工作区协议标识符（`正文/`、`剧集/EP001`、`SHOT-*`）、面向 Agent 的提示词构造和运行错误文本保持简体中文：它们属于 Skill 与 Host 守卫共用的创作协议，而不是浏览器界面。
