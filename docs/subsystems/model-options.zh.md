---
description: "模型设置子系统：思考能力映射、提供方重试策略与修订保护编辑。"
---

# 模型设置增强

[English](model-options.md) | 中文

## 概要

在已有模型设置页编辑模型思考能力与提供方重试选项。批量操作将模型变更放入草稿，统一保存。这些控件配置 DSH adapter 与重试执行，不实现另一套模型运行时。

## 目录

- [包与集成](#ownership)
- [草稿与保存边界](#edits)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与集成

[模型设置增强 bundle](../../packages/client/ui-settings-model-options/README.zh.md)独立安装，为 `llm-pi-ai` 与 `llm-deepseek` 注册提供方卡片控件；模型思考元数据面向 pi-ai 系列提供。它使用现有设置镜像和模型目录，Host 入口不新增设置命名空间、模型工具或请求执行器。

adapter 将对话中选择的思考级别映射为提供方请求值。DSH 重试插件执行配置的策略并负责取消。能力声明不能探测端点支持，也不能让不受支持的参数变得有效；重试会重新发送请求，不会修复请求。

<a id="edits"></a>
## 草稿与保存边界

思考能力声明归单个模型，重试模式、次数与可选错误类别归提供方。自定义模型条目与目录模型覆盖保留已有设置身份。批量复制限定在同一提供方内，保存前只改变草稿。

保存携带已捕获的设置修订，只编辑选定字段，保留凭据与无关重试配置。外部修订变化会阻止过期保存，被拒绝的保存保留草稿。只读设置禁用编辑。控件不增加提示词或工具，但思考级别变化与重复尝试可能影响提供方用量。

<a id="related"></a>
## 相关契约

[包 README](../../packages/client/ui-settings-model-options/README.zh.md)说明支持的控件与恢复操作。上游拥有 [pi-ai adapter](../../upstream/packages/llm/llm-pi-ai/README.md)与[重试执行器](../../upstream/packages/llm/llm-retry/README.md)。

<a id="dev-note"></a>
## 开发备注

无。
