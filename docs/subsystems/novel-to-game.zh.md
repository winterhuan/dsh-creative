---
description: "小说转游戏子系统：项目资源、隔离浏览器预览与经过认证的 Chrome QA 证据。"
---

# 小说转游戏

[English](novel-to-game.md) | 中文

## 概要

`novel-to-game` Agent preset 通过作用域内的 `/agent` 入口拥有模型能力。Host 路由和设置保持全局注册。侧栏入口跟随所选会话的投影；隐藏工作台保留原有存储。模式选择不迁移历史，也不授予文件系统权限。

将小说改编为可试玩的浏览器游戏，并在游戏工作台中检查。QA 操作真实候选，记录启动、渲染、输入、核心循环、结果与重开的证据。机械检查通过不等于主观可玩性成立。

## 目录

- [包与项目边界](#ownership)
- [QA 与证据归属](#evidence)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与项目边界

[小说转游戏包](../../packages/creative/novel-to-game/README.zh.md)拥有四个 Skill、原著辅助脚本、`game_qa`、路由与仅含游戏状态的 Session store。它独立于小说、短剧和视频插件安装。原著改编通过文件与谱系交换数据，不访问另一个插件的私有状态。DSH 拥有 Session 授权、shell 执行与作业。

项目使用 `game-adaptations/<project>/`，浏览器入口为 `build/app/index.html`。`/novel-to-game` 提供只读项目 API，`/novel-to-game/preview/` 提供预览资源。可信导航、允许路径、解析后路径包含关系和字节上限保护这些读取。预览与 QA 执行器共用内容安全策略，将资源限定为预览资源前缀与允许的本地数据。

<a id="evidence"></a>
## QA 与证据归属

`game_qa` 使用 Chrome 操作候选，捕获操作和画面并记录证据哈希。Host 在展示当前有效结果前，认证记录并核对当前构建与证据字节。手写 PASS 记录不能作为经过认证的证据，Host 重启会使此前的进程签名失效。

QA 使用 DSH shell 和可选后台作业，不使用生产凭据。浏览器检查不认证原生可执行程序、媒体权利、平衡性或主观趣味。工作台在机械结果旁保留这些限制。

<a id="related"></a>
## 相关契约

[游戏证据决策](../../.agents/notes/implemented/feature/2026-09-27-novel-to-game-playability-evidence.zh.md)拥有认证与时效性规则。[包 README](../../packages/creative/novel-to-game/README.zh.md)说明安装、运行环境要求与任务入口。

<a id="dev-note"></a>
## 开发备注

无。
