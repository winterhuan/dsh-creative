# Agent Note: OpenMAIC lessons stay outside the learning record

Status: implemented

[English](2026-10-28-student-openmaic-lessons.md) | 中文

## Problem

本机生成一节 OpenMAIC 课要几分钟，而且它的匿名 cookie 经不起学习工作台的浏览器再去请求 3000 端口。学习用的 web fetch 也不能访问 localhost。若把这件事放进 `study_update`，每次轮询都会抬高学习修订号，并把外部服务日志混进学生证据。

## Decision

study 技能的 `references/openmaic.md` 是操作步骤：助手的 shell 发起生成，用同一个 cookie jar 大约每分钟轮询一次，失败时对 run 调用 retry 且不重交 requirement，课后读取 `/api/stages/{classroomId}`。记录追加到 `.study/openmaic-lessons.json`。工作区路由只读这个文件，学习修订号没变的轮询也读；工作台列出记录，在浏览器打开裸的 http(s) URL，并排队请助手生成、重试或出 2 到 5 道巩固题。家长可以保存 OpenMAIC 原点；留空时先用 `OPENMAIC_BASE`，再退到 `http://localhost:3000`。`OPENMAIC_ACCESS_CODE` 从环境读取，不入库。

## Alternatives considered

**把每节课做成 `study_update` 动作。** 工作台能靠现有修订号看到记录，但长时间生成会和作答写入抢修订，助手仍然得用 curl 访问服务。

**由工作区路由代理 OpenMAIC。** 浏览器可以避开跨站 cookie，但路由会替每个标签持有匿名会话和访问码。助手的 shell 已经有 cookie jar。

**把课堂嵌进侧栏。** 框架带不上 OpenMAIC 的 cookie，静态导出播放器又是另一个产品。播放留在系统浏览器里。

## Consequences

生成仍然依赖本包不启动的 OpenMAIC 进程。课表不随学期归档导出，一直留到有人删除。对话里的课堂 URL 必须是单独一行裸地址；工作台用文本再加一个打开按钮重复这个地址。这次改动没有真实的 OpenMAIC 调用，也没有真实的 DSH 浏览器验证。
