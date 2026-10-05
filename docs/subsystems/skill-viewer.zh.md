---
description: "Skill Viewer 子系统：按 Session 发现技能、只读参考访问与浏览器缓存归属。"
---

# Skill Viewer 技能查看器

[English](skill-viewer.md) | 中文

## 概要

查看 Session 可用的技能，搜索元数据并阅读指令或本地参考。查看行为仅供人使用，不调用 Skill、不恢复 Agent，也不增加模型上下文。目录跟随 Session 的技能组合。

## 目录

- [Host 与客户端](#ownership)
- [读取边界与失败](#references)
- [浏览器状态与生命周期](#cache)
- [开发备注](#dev-note)

<a id="ownership"></a>
## Host 与客户端

[skill-viewer bundle](../../packages/skill/skill-viewer/README.zh.md)安装 `skillViewer` Remote 服务与[查看器客户端](../../packages/client/ui-skill-viewer/README.zh.md)，不要求安装创作插件。DSH 拥有分层技能注册表、Session 查找与 preset 作用域；查看器解析该位置最终生效、允许用户调用的技能。

活跃 Agent 提供自身作用域中的注册表。未启动的 Session 使用已记录 preset 的常驻作用域，无法解析时回退到全局；不会构建或恢复 Agent。面向模型的目录与调用仍归 DSH 技能工具所有。查看器读取不进入 Session 日志。

<a id="references"></a>
## 读取边界与失败

本地参考访问从当前 provider 的绝对资源目录开始，该目录可以位于 Session 工作区之外。浏览器提供技能名称和参考相对路径，不能指定任意资源根。发现与读取拒绝路径穿越和符号链接，并限制列表扫描量与 UTF-8 预览字节数。

目录观察不完整或参考被截断时，界面明确展示该状态。注册表缺失、Session 不可用和参考不可读会报告错误，不会冒充完整的空目录。URL、不透明或相对资源基目录不提供本地参考预览；本地 `references/` 目录不存在时返回空列表。

<a id="cache"></a>
## 浏览器状态与生命周期

客户端按 Session 缓存目录，按 Session 与技能名称缓存正文。刷新读取当前内容，重开可以复用已完成的缓存。preset 变化使对应 Session 缓存失效，连接重置清空缓存。选择参考时重新读取，晚到响应不能替换当前 Session、技能或文件。

关闭或释放查看器会取消参考读取。插件释放会移除侧栏入口、词典与订阅。查看器不监听文件系统变化，刷新与展示行为归[客户端 README](../../packages/client/ui-skill-viewer/README.zh.md)所有。

<a id="dev-note"></a>
## 开发备注

无。
