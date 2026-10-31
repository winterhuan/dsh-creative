# DeepSeek Harness 部署

`target_cli` 含 `dsh` 时，由 SKILL.md Phase 2 完整读取并依次执行本文件。其他宿主的部署文件不要读，除非作者当次明确把那个宿主加进 `target_cli`。

## 不部署的内容

DSH 没有 Claude Code / Codex 的 hook 运行时。本文件**禁止**写入或合并：

- `.claude/hooks/`
- `.claude/settings.local.json` 里的 story hook 注册
- `.codex/hooks.json`
- `.codex/hooks/`

作者明确要求同时部署 Claude Code 或 Codex 时，才另读那一份部署文件并执行其中的 hook 步骤。只部署 DSH 时跳过上述路径，已有文件保持不动。

## 要做的事

1. 确认写作技能已经可见：workspace 挂载时在项目 `.agents/skills/<name>/SKILL.md`，bundled 挂载时在插件包的 `skills/`。不要再把同一批技能复制到项目根 `skills/`，也不要启动 oh-story Dashboard。
2. 没有 `.story-deployed` 时创建它；已有则只更新下面字段，保留作者另加的键。
   ```
   deployed_at: <date -u +"%Y-%m-%dT%H:%M:%SZ">
   agents_version: 38
   setup_skill_version: 1.3.6
   target_cli: dsh
   resolver_strategy: dsh-skill-filesystem
   references_dir: .agents/skills/story-setup/references/agent-references
   ```
   bundled 且工作区没有 `.agents/skills/story-setup` 时，`references_dir` 写插件包内 `skills/story-setup/references/agent-references` 的绝对路径。
3. 不改 `CLAUDE.md`。不把 Codex / Claude Code 的管理块写进 `AGENTS.md`。

## 验证

- `.claude/hooks` 与 `.codex/hooks.json` 相对部署前没有新增 story hook 文件或注册。
- `.story-deployed` 的 `target_cli` 含 `dsh`。
- `story`、`story-long-write`、`story-short-write`、`story-deslop` 能在当前会话的技能目录里打开。

## 安装报告必须提示

用白话说明：写作技能已经在 DSH 里，侧栏可以改设定、大纲和章节；这次没有安装 Claude Code 或 Codex 的自动钩子。正文是否改写仍由作者当次的要求决定。
