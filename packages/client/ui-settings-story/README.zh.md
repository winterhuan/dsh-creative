---
description: "dsh Web 客户端插件页的小说设置页：朱雀检测密钥。"
kind: "package-reference"
---

# @winterhuan/dsh-client-ui-settings-story

[English](README.md) | 中文

## 概述

在侧边栏打开**插件**并选择**小说**，即可设置朱雀检测密钥。页面暂存所输入的内容，只在保存时写入；密钥经凭据域写入而非设置文档，因此密钥字面量不会出现在响应中。页面在 Host 提供 `story` 命名空间期间存在。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

**API Key** 控件每次加载都是空的，只报告是否已配置密钥；留空保存等于保留现有密钥。**批量管理密钥**打开一个对话框，把整个密钥池作为一次写入存储，每行一个密钥。点击**保存**之前不会写入任何内容；离开页面即丢弃草稿。启动环境中的 `MAKERS_API_KEY` 优先于凭据文件，并使输入框和批量管理只读；页面会说明原因。取消启动环境中的该变量并重启后，可在页面保存密钥。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

宿主半侧是一个空的 `apply`，只为让本包占一条 Loader 行，客户端模块系统据此送出浏览器半侧。浏览器半侧通过 `ctx.configForms.get` 绑定 `story` 命名空间，在 `StorySettingsCardController` 里维护暂存表单。密钥写入走 `remote.credentials.set`，引用名取自 `makersApiKeyEnv`（未指定时为 `MAKERS_API_KEY`）。页面通过 `ctx.configForms.whileServed` 把 `StorySettingsCard` 注册进插件页的 `plugins.item` slot。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-plugin-manager](../../../upstream/packages/client/ui-plugin-manager/README.md) — 插件页与页面注册进的 `plugins.item` slot。
- [ui-settings](../../../upstream/packages/client/ui-settings/README.md) — 页面搭乘的设置 scope 与被提供命名空间监视。
- [story](../../creative/story/README.zh.md) — 提供 `story` 命名空间并运行 `story_zhuque` 的插件。

-----

<a id="model-experience"></a>
## 模型体验

无，本包是浏览器侧设置界面，不注册模型界面。

#### KV Cache 效应

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **命名空间覆盖范围** — 页面编辑小说插件上的朱雀凭据引用。该命名空间里的文件大小和受信任主机字段不在此显示。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
