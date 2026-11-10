# Issue tracker：GitHub

[English](issue-tracker.md) | 中文

## 摘要

父仓库任务与规格使用 `winterhuan/dsh-creative` 的 GitHub Issues。调用 `gh` 时显式指定 `--repo winterhuan/dsh-creative`，避免进入插件子模块后将父仓库任务发到其他仓库。插件专属工作遵循所属仓库的约定；发布前确认目标。

## 目录

- [Issue 操作](#issue-operations)
- [关联与任务导航](#relationships-and-wayfinding)
- [Pull requests](#pull-requests)

<a id="issue-operations"></a>

## Issue 操作

技能要求“发布到 issue tracker”时，在选定仓库创建 issue；要求“获取相关任务”时，读取该 issue 及评论。此配置只选择目标位置；发布消息仍需用户或明确调用的技能授权。

用 `gh repo view --json nameWithOwner` 检查当前仓库。多行正文先写入文件，再通过 `--body-file` 传入；编辑时保留已有内容。

| 操作 | 本父仓库使用的命令 |
| --- | --- |
| 读取 | `gh issue view <number> --repo winterhuan/dsh-creative --json number,title,body,labels,comments` |
| 列表 | `gh issue list --repo winterhuan/dsh-creative --state open --json number,title,labels` |
| 创建 | `gh issue create --repo winterhuan/dsh-creative --title "..." --body-file <file>` |
| 编辑正文 | `gh issue edit <number> --repo winterhuan/dsh-creative --body-file <file>` |
| 评论 | `gh issue comment <number> --repo winterhuan/dsh-creative --body-file <file>` |
| 添加或移除标签 | `gh issue edit <number> --repo winterhuan/dsh-creative --add-label "..."` 或 `--remove-label "..."` |
| 关闭 | `gh issue close <number> --repo winterhuan/dsh-creative` |

需要关闭说明时，先单独发评论，再关闭；issue 已关闭时也采用该顺序。状态标签采用[分类映射](triage-labels.zh.md)。编号可能指向 issue 或 PR 时，操作前先确定类型。

<a id="relationships-and-wayfinding"></a>

## 关联与任务导航

支持时优先使用 GitHub 原生子 issue 与 issue 依赖关系。使用关联参数前检查已安装 CLI（命令行界面）的帮助。已检查的 `gh 2.86.0` 不提供 `--parent` 或 `--blocked-by`；采用已验证的 GitHub API 操作，或使用下述文本回退方式。API 关联操作使用 issue 的数字数据库 ID，不使用 issue 编号或 node ID。

采用文本回退时，在子 issue 开头写 `Part of #<parent>`，并把其链接加入父 issue 的任务列表。在依赖其他任务的 issue 开头附近写 `Blocked by: #<number>, #<number>`。全部阻塞任务关闭后，该任务才可开始。

明确调用任务导航技能时，以一个标记 `wayfinder:map` 的 issue 作为任务地图；子 issue 使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。这些标签按需创建。按地图顺序选择第一个开放、未分配且无开放阻塞项的子任务；开始前将其分配给负责开发者。完成时发布回答评论、关闭任务，再将简短答案与链接加入地图的决策记录。列表不完整时继续获取后续页。

<a id="pull-requests"></a>

## Pull requests

**PRs as a request surface: no.** 外部 PR 不进入 issue 分类队列。采用该流程时再明确修改此标记。
