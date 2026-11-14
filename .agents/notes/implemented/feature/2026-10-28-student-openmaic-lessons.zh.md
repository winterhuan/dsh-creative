# Agent Note: OpenMAIC lessons stay outside the learning record

Status: implemented

[English](2026-10-28-student-openmaic-lessons.md) | 中文

## Problem

本机 OpenMAIC 课堂生成需要几分钟及同一匿名 cookie 会话。原生 web fetch 无法访问 localhost。把生成和轮询放进学习状态写入方会与作答竞争，并把服务日志混入学习证据。

## Decision

study 技能的 `references/openmaic.md` 拥有 shell 流程：生成、同一 cookie jar 约每分钟轮询、重试已有 run，再读取阶段。agent 直接编写有界 `.study/openmaic-lessons.json` 并用随包 CLI 验证。应用查询独立验证完整日志，包括学习修订号不变的修改；工作台读取事实、打开裸 http(s) URL，并发送原生生成／重试／巩固意图。

保存的原点优先于 `OPENMAIC_BASE`，再退到 `http://localhost:3000`；`OPENMAIC_ACCESS_CODE` 留在环境中。就绪 URL 不能证明上课或理解。课后巩固使用相同已保存题目／作答／评分路径。[原生学习架构](../architecture/2026-11-12-student-learning-flow-architecture.zh.md)拥有编写、传输和证据验证。

## Alternatives considered

**将课程放进学习状态写入方。** 生成会与作答写入竞争，agent 仍需 curl 访问服务。

**由 Host 代理 OpenMAIC。** 浏览器可避开跨站 cookie，但 Host 会持有匿名会话与访问码。导师 shell 已有 cookie jar。

**把课堂嵌进侧栏。** 框架带不上 OpenMAIC 的 cookie，静态导出播放器又是另一个产品。播放留在系统浏览器里。

## Consequences

生成依赖本包不安装或启动的服务。独立课程日志不随学期归档，直到明确删除。聊天以单独一行显示裸课堂 URL；工作台重复它并提供打开按钮。确定性文件／消费测试不能证明真实 OpenMAIC 生成、课堂质量或上课；这些需要单独验收。
