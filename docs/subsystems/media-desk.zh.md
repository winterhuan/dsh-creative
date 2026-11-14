---
description: "自媒体工作台的原生创作 Session、已接受 Notes 内容、媒体尝试与导出归属。"
---

# 自媒体工作台

[English](media-desk.md) | 中文

## 概要

自媒体工作台收集来源材料、编辑已登记 Notes 作品，并通过持续的 DSH 原生 Session 生成脚本和媒体。成稿、排期与复盘在已接受作品旁保持可见。平台发布仍由用户手动完成。

## 目录

- [包与执行](#execution)
- [内容与接受](#acceptance)
- [相关文档](#related)
- [开发备注](#dev-note)

<a id="execution"></a>
## 包与执行

[@winterhuan/dsh-media-desk](../../plugins/dsh-media-desk/README.zh.md) 是独立安装的 Host 与 Client 组合包。DSH 管理每篇作品 Session、独立全局 Session、原生输入、模型选择、工具、问答与批准。Media Desk 保存其实际关联并提供创作 preset。Client 在自有 Session 作用域内渲染官方对话工厂；打开或关闭面板改变订阅，而不改变 Agent 归属。

Host 受理成稿尝试和经校验的业务操作。原生轮次提供文字候选；独立图片任务消费已接受策划及其冻结的服务设置。尝试与素材身份防止迟到结果替换不兼容的新编辑。导出从同一已接受快照写入新目录。

<a id="acceptance"></a>
## 内容与接受

已登记 Notes 文件保存当前作品文字、收藏来源、写作偏好和已接受媒体。Media Desk 管理引用、回执、成稿元数据及原始指标。来源材料与当前作品保持不同角色。Session 证据证明原生执行；持久业务回执证明接受。

Host 对本地数据目录和已保存 Notes 根目录持有协作写入所有权。非协作编辑器需要字节校验及保留的冲突版本。文件发布与 Store 接受通过恢复日志协调，仍是分别执行的操作。Wiki 知识维护遵循有效技能和工作区指令；已接受创作材料不会因目录位置而取得知识权威。

<a id="related"></a>
## 相关文档

[包说明](../../plugins/dsh-media-desk/README.zh.md)管理配置与限制；[使用指南](../../plugins/dsh-media-desk/GUIDE.zh.md)管理用户操作。[原生创作](../../.agents/notes/implemented/architecture/2026-11-11-media-desk-native-agents.zh.md)记录组合选择，[原生接受](../../.agents/notes/implemented/architecture/2026-11-12-media-desk-native-acceptance.zh.md)记录持久性与恢复选择。

<a id="dev-note"></a>
## 开发备注

无。
