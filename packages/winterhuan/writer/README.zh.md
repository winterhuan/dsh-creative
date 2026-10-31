---
description: "为 DSH 增加写作模式：挂载 oh-story 技能，并在侧栏按 Dashboard 导航编辑拆文库与写作项目。"
kind: "package-bundle"
---

# @winterhuan/dsh-writer

[English](README.md) | 中文

## 概要

本 bundle 给 DSH 增加写作模式。新会话可以使用 oh-story 的长篇、短篇和去 AI 味技能，右侧栏按 Dashboard 模型浏览拆文库与写作项目并编辑允许的文本文件。默认把技能拷进工作区 `.agents/skills`，已经存在的目录不覆盖。把 `skillMount` 改成 `bundled` 并重启后，改为直接读插件包里的 `skills` 目录。侧栏不嵌入、也不启动 oh-story Dashboard。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 安装到 profile

先构建本仓库，再把本地 bundle 装进 DSH `0.2.1-rc.5` 的 profile。把 `web` 换成你的 profile 名。

```sh
pnpm --filter @winterhuan/dsh-writer build
dsh plugin --profile web add packages/winterhuan/writer
```

安装或重新构建后重启 profile。补丁增加 `writer` Host 行和 `preset-writer` 行。模式 id 是 `writer`，菜单名是写作模式。

### 选择技能挂载

`skillMount` 只能是 `workspace` 或 `bundled`，默认 `workspace`。两种模式不会同时生效。

`workspace` 不设置 `bundledSkillDir`。会话第一次进入写作模式时，Host 把包内每个技能目录拷到 `<项目>/.agents/skills/<name>/`。项目是含 `.git` 的最近祖先；没有时用会话目录。目标目录已存在则不覆盖。技能靠项目根的 `.agents/skills` 被发现。在该会话执行 `/writer-sync-skills` 会用包内副本替换这些目录。

`bundled` 不拷贝技能。预设里的 skill-filesystem 行把 `bundledSkillDir` 设为包内 `skills` 的绝对路径，用 `createRequire(baseUrl).resolve('@winterhuan/dsh-writer/package.json')` 定位。skill-filesystem 把这个根当作可信宿主目录。另一行 skill-filesystem 被禁用，因此两行不会一起加载。修改 `skillMount` 后要重启，预设在挂载时读取这个值。

```yaml
- id: writer
  name: '@winterhuan/dsh-writer'
  config:
    skillMount: bundled
```

`makersApiKeyEnv` 是明确要求朱雀检测时使用的环境变量名，默认 `MAKERS_API_KEY`。`gptImageApiKeyEnv` 是封面生图用的环境变量名，默认 `GPT_IMAGE_API_KEY`。Host 只保存名字，并分别镜像到 `WRITER_ZHUQUE_KEY_ENV` / `WRITER_COVER_KEY_ENV`。安装本 Host 行后，插件页会出现「写作」入口，密钥经 DSH 凭据服务绑定（不写入设置文件）。`story-zhuque` 与 `story-cover`（API 通路）读取对应变量；作者没有明确要求时不运行。

### 扫榜、拆文与封面技能

这些随包技能由作者主动触发，不挡写章。

| 技能 | 触发 | 说明 |
|:-----|:-----|:-----|
| `story-long-scan` | `/story-long-scan` | 长篇扫榜。实时榜单可能需要 `agent-browser` / `browser-cdp`。 |
| `story-short-scan` | `/story-short-scan` | 短篇扫榜。浏览器依赖同上。 |
| `story-long-analyze` | `/story-long-analyze` | 长篇拆文。脚本需要 Python 3。 |
| `story-short-analyze` | `/story-short-analyze` | 短篇拆文。需要 Python 3。 |
| `story-cover` | `/story-cover` | 仅提示词不需要 Key。在 DSH 上要出图时用上面的 GPT Image 凭据。Codex 宿主仍可用 `$imagegen`。 |
| `browser-cdp` | `/browser-cdp` | 扫榜需要实时浏览器会话时的可选助手。 |

### 使用侧栏

先打开写作模式，再从右侧栏打开写作。左栏信息架构对齐 oh-story Dashboard（等分 Tab → 文件名搜索 → 树 → 脚注），皮肤仍跟 DSH。拆文库 / 写作项目双 Tab（带数量）、懒加载真实目录树（约 200 条分页，根默认展开）、换文件脏确认、可编扩展名为 `.md` / `.txt` / `.json` / `.yaml` / `.yml` / `.toml`。文件名搜索（防抖、限当前 Tab、对齐 Dashboard 结果/节点/深度上限），Esc 清空；侧栏可见且焦点不在对话输入时 ⌘/Ctrl+K 聚焦搜索，⌘/Ctrl+S 保存。编辑 ↔ Markdown 预览、脏态（待保存/已保存/保存中）、底栏（行·列、字数、EOL），保存时保留原换行。保存带上一次读取得到的版本；磁盘已变则先载入磁盘版本再存。列表、读取与搜索遍历走会话的 `workspaceFiles`，**不**启动本机 dashboard-server。删文件与行号 gutter 尚未接入。

在 DSH 里，`story-setup` 把宿主认成 `dsh`，不部署 Claude Code 的 `.claude/hooks`，也不部署 Codex 的 `.codex/hooks.json`。作者明确要求其他宿主时，那些宿主仍走自己的部署文件。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

[cordis.patch.yml](cordis.patch.yml) 插入 Host 和预设。预设包含 persona、说明、时间、shell、文件系统、搜索、jobs、技能、压缩、委派、提问、待办和网页。它不加载 `agent` 入口，也不注册 skill provider。[src/index.ts](src/index.ts) 负责拷贝技能、登记 `/writer-sync-skills`，并挂上 `PUT /writer/file`。[src/client/sidebar.tsx](src/client/sidebar.tsx) 登记侧栏类型和正文 slot，只在会话预设为 `writer` 时显示。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [写作子系统](../../../docs/subsystems/writer.zh.md)
- [右侧栏](../../../upstream/docs/subsystems/sidebar-right.zh.md)
- [文件系统技能](../../../upstream/packages/skill/skill-filesystem/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### 写作预设

#### 模型看到的内容

预设为 `writer` 的会话会看到该预设的 persona，以及 oh-story 技能目录，其中包括 `story`、`story-long-write`、`story-short-write`、`story-deslop`、`story-zhuque`、扫榜/拆文/封面技能和 `browser-cdp`。persona 要求按任务加载对应技能，在 DSH 上跑 `story-setup` 时跳过 Claude Code 与 Codex 的 hooks，并且不要启动 oh-story Dashboard。`story-zhuque` 只用于作者明确提出的朱雀检测。侧栏保存不是模型工具。

#### Token 影响

写作会话的每一轮都会带上 persona 前缀。加载某个技能时，那一轮会加上该技能的说明。其他预设的会话不会带上这段 persona，也不会因此强制拷贝技能。

#### KV Cache 影响

persona 在该预设修订的生命周期内保持稳定。第一次进入写作模式时把技能拷进 `.agents/skills`，可能让后面某一轮的技能目录发生变化。`/writer-sync-skills` 同样会改变技能正文。切换 `skillMount` 只在重启后生效，不会改写正在进行的提示。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- 侧栏对标 Dashboard 的拆文库/写作项目发现、可编扩展、文件名搜索、预览与编辑器壳基础能力，但不启本机 dashboard-server，也不换 zs 主题。删文件与行号 gutter 尚未做。它不创建书、不做章节守卫，也不自建读取接口。`workspace` 在执行 `/writer-sync-skills` 之前不会替换已有技能目录。若以前拷过一份，项目里的副本仍然优先于 bundled 技能。朱雀只在调用 `story-zhuque` 且对应环境变量已设置时运行。封面生图只在作者要求出图且已配置 `GPT_IMAGE_API_KEY`（或配置的名字）时走 API；仅提示词不需要密钥。本环境没有把 bundle 装进正在运行的 DSH profile。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>给维护者的工作记录——点击展开</summary>

包内技能来自纳入时的 `zenstory-ai/oh-story-claudecode` 最新树，另加本包的 `story-zhuque`。oh-story 许可证在 `skills/LICENSE.oh-story`。

</details>
