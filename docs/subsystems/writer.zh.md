---
description: "写作子系统：写作模式预设、互斥的技能挂载，以及侧栏保存的边界。"
---

# 写作

[English](writer.md) | 中文

## 概要

写作模式是可选的小说会话预设。Host 把 oh-story 技能拷进工作区，或让技能发现直接读插件目录；侧栏浏览拆文库、写作项目和按日期保存的扫榜记录，并编辑允许的文本文件。会话、模型和文件读取仍由 DSH 负责。

## 目录

- [包](#ownership)
- [挂载与保存边界](#boundary)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包

[@winterhuan/dsh-writer](../../plugins/dsh-writer/packages/winterhuan/writer/README.zh.md) 独立安装。Host 行拥有技能挂载、来源诊断、带备份的同步与恢复命令，以及带版本的文件保存。预设行拥有工具列表和 persona。浏览器半边是同一个包的 client 入口：写作侧栏，以及插件页上的「写作」卡片；后者通过 `makersApiKeyEnv` 绑定朱雀凭据（Host 只存环境变量名，密钥走凭据服务）。

<a id="boundary"></a>
## 挂载与保存边界

`skillMount` 是 `workspace` 或 `bundled`。workspace 拷贝技能且不设置 `bundledSkillDir`。bundled 把该目录指到包内 `skills`，且不拷贝。默认是 bundled，已有项目同名副本仍优先。显式同步或撤销同步先保留备份；恢复命令同样保留被替换的当前副本。

侧栏的列表和读取走 `workspaceFiles`。「扫榜」Tab 按日期倒序发现 `扫榜/YYYYMMDD/` 记录，展开时预览结论，缺少结论则打开聚合表或可读取的 Markdown 榜单；原始榜单仍在同一目录树中。Host 路由接受会话工作区内允许的文本文件的带版本保存，包括扫榜报告。它不提供 oh-story Dashboard。在这个宿主上，`story-setup` 跳过 Claude Code 和 Codex 的 hook 部署。

侧栏按工作区和路径保存浏览器恢复草稿；读取与保存回包只更新所属文稿。章节面板按需读取书内追踪、机械检查与语义审稿记录，正文或细纲指纹变化使相应报告过期。审稿记录由技能脚本校验原文引用与版本；侧栏不以审稿意见代替作者决策，也不增加章节提交门禁。

<a id="related"></a>
## 相关契约

安装、切换挂载和限制见[包说明](../../plugins/dsh-writer/packages/winterhuan/writer/README.zh.md)。技能发现归 [skill-filesystem](../../upstream/packages/skill/skill-filesystem/README.zh.md)。侧栏登记遵循[右侧栏](../../upstream/docs/subsystems/sidebar-right.zh.md)。

<a id="dev-note"></a>
## 开发备注

无。
