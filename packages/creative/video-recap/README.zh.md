---
description: "视频解说工作台，可独立安装技能、工具与浏览器界面。"
kind: "package-bundle"
---

# @winterhuan/dsh-video-recap

[English](README.md) | 中文

## 摘要

通过六个 Skill、原片预览和产物查看制作视频解说。流程支持带标记的本地草稿与交付度量证据。此 bundle 可以独立安装，也可以通过 Creative 安装。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发笔记](#dev-note)

<a id="use-this-package"></a>
## 使用本包

构建仓库后，将本地 bundle 安装到 web profile：

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/video-recap
```

从右侧栏打开**视频解说工作台**。插件使用当前 DSH Session、文件系统、模型和权限。生产设置仍位于已有的 Creative 生产设置页；密钥保留在 DSH 凭据库。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[补丁](cordis.patch.yml)挂载领域行、`creative-produce` 配置行和已有设置页。重复配置行 ID 通过 DSH Loader 组合解析。`editorMaxBytes` 默认为 2097152；`trustedHosts` 扩展默认回环地址列表。`/video-recap` API 将文档与媒体访问限定在本领域项目路径中。

此包拥有视频脚本与 video-recaps/ 下的预览。语音生产只读取 MiMo 和 Fish 凭据引用；无密钥本地草稿仍然可用。

此包不依赖 Creative 聚合包或其他领域插件。必需辅助脚本作为包资源分发。[聚合包](../creative/README.zh.md)保留兼容工具名和路由，自身没有聚合页面。

</details>

<a id="model-experience"></a>
## 模型体验

### 领域技能与执行

#### 模型看到什么

领域目录只展示自己的 Skill 描述。加载 Skill 时提供完整指令和随包辅助脚本路径。`video_produce_run` 执行固定领域脚本；后台执行返回 DSH 作业 ID，供 `job_output` 与 `job_kill` 使用。加载后的技能要求前置阶段采用前台委派，并在进入下一阶段前核对子 Agent 的最终结果和产物。委派失败时报告具体诊断并保留已有产物；DSH 模型服务的认证和地址错误需修复提供商配置。

#### Token 影响

Skill 正文按需加载。执行添加普通工具结果，不加载无关领域目录。

#### KV Cache 影响

插件使用 DSH 工具和 Skill 历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Python 脚本需要 Python 3.9+；媒体操作还需要 ffmpeg 与 ffprobe。付费服务需要创作者授权和已配置凭据。独立侧边栏各自保存状态；旧聚合草稿不迁移。

<a id="dev-note"></a>
### 开发笔记

未引入独立公共运行时包。
