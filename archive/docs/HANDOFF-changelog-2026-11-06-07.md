# dsh-creative 本机环境变更记录：2026-11-06—07

本文件保留 2026 年 11 月 6—7 日的历史记录，当前环境见[本机环境变更记录](../../HANDOFF-changelog.md)。

2026-11-06 DSH 0.2.2-rc.1 升级：

- 全局 dsh 升到 `0.2.2-rc.1`（`npm install -g @deepseek-ai/dsh@0.2.2-rc.1 --prefix ~/.nvm/versions/node/v22.22.2`），`dsh web` 重启后页面 HTTP 200，5 个 `@winterhuan` 客户端 bundle（writer 113834、student 256989、project-default-mode 18546、skill-viewer 43810、settings-model-options 20353 字节）经 cookie 会话验证均返回 200。
- 升级前 `dsh` 自更新被中断，`bin/dsh` 指向临时名 `.dsh-We3xC8Eb` 导致命令不可用，已通过上述 npm 安装恢复。
- Node 版本：nvm 默认 v22.22.2，`/usr/local/bin/node` 软链接曾指向 v22.20.0 覆盖 nvm，已改指向 v24.22.2；全局 dsh 仍装在 v22.22.2 下。
- 5 个 `@winterhuan` 插件保持 link 到本仓库，未重新 link；`dsh web` 重启即加载 0.2.2-rc.1 构建。

2026-11-07 writer 预设菜单修复：

- 根因：0.2.2-rc.1 上游把 delegation 组的 `tool-subagent-list-agents`/`tool-subagent-list-models` 行收回 `tool-subagent-control` 与 `tool-subagent`（`modelSelectionSettings`→`modelSelection`，新增 `modelDiscovery`），`@deepseek-ai/dsh-tool-subagent-control` 不再导出 `/list-agents`；writer 的 `cordis.patch.yml` 仍带 rc.5 旧行，该行 `never started` 导致 preset-writer 标记 broken，被模式菜单过滤。
- 修复 `packages/winterhuan/writer/cordis.patch.yml`（链接包运行时直读，无需重编译）并 `dsh-webctl restart`；浏览器验证模式菜单恢复「写作模式」且可选，设置页 Agent 预设不再显示加载失败。本轮 profile 侧仅有此前调试留下的内容一致的备份文件，未改 profile 补丁。


2026-11-07 独立插件与市场发布：

- 6 个独立仓库位于 `/Users/winter/dsh-plugins/`，均已推送到 GitHub。writer、student、project-default-mode 发布 `0.1.1`；skill-viewer 与 ui-skill-viewer 发布 `0.1.5-rc.3`；ui-settings-model-options 发布 `0.1.7-rc.3`。每个 Release 附带由对应固定提交打包的编译产物，公开下载后的 SHA-256 与本地包一致。
- 市场索引为 `https://winterhuan.github.io/dsh-creative/index.json`，由本仓库 `gh-pages` 分支通过 GitHub Pages 提供。HTTP 200、无重定向，DSH 官方格式校验器通过；索引中的包名、版本、DSH 兼容声明、组合包声明与公开 Git 提交的 manifest 一致。5 个组合包均固定 Git 提交与包目录，兼容 DSH `0.2.2-rc.1`；第 6 个仓库是随技能查看器打包的客户端，不单列市场条目。
- 6 个仓库各自的 typecheck、build 和测试全部通过，共 557 项；12 对根及包 README 的双语结构、记录和本地链接通过。README 提供市场地址与固定提交安装命令，已提交并推送。
- 隔离 DSH profile 在真实浏览器成功添加索引，显示 5 个组合包及对应已安装版本。项目默认模式经「发现 → 安装 → 立即启用」重新安装后显示 1 个组件运行中；确认框中的仓库、提交和目录与索引一致。未调用真实模型，未修改用户日常使用的 profile。
- 发布结果、校验值、日志和浏览器截图位于 `/Users/winter/dsh-plugins/market-checks/`，汇总为 `final-publication-results.json`；市场安装证据为 `market-install-confirmation.txt`、`market-install-success.txt` 和 `market-install-enabled.txt`。本轮未提交本仓库先前的目录迁移和写作模式修复改动。


2026-11-07 插件版本统一：

- 6 个独立仓库、本仓库的现役插件清单、技能查看器随包客户端统一为 `0.1.8`。技能查看器的 Git 客户端依赖、客户端开发依赖的 Host 发布包及对应锁文件同步；DSH 兼容声明保持 `0.2.2-rc.1`。
- 6 个仓库均发布 `v0.1.8` 并设为最新 Release。市场的 5 个组合包均推荐 `0.1.8`，README 安装命令指向该版本的固定 Git 提交；旧标签和 Release 保留为历史版本。
- 6 个独立仓库及本仓库的 typecheck、build、557 项测试通过；12 对 README 结构、记录和链接通过。发布与校验材料在 `/Users/winter/dsh-plugins/version-0.1.8/`。
- 隔离 profile 的「发现」页显示 5 项均为 `0.1.8`，旧安装均标记「有新版本」。技能查看器从旧版升级后，Host 与随包客户端清单均为 `0.1.8`，浏览器显示 2 个组件运行中；未修改日常使用的 profile。线上索引 HTTP 200、无重定向，6 个最新 Release 的标签和附件校验值全部核对通过。

2026-11-07 本机插件切换为远程安装：

- 用官方 `dsh plugin --profile <name> add <固定 Git 地址>` 替换 `creative`、`headless`、`student`、`web` 中已有的 `@winterhuan/*` 本地链接。4 个 profile 的全部目标包均为 `0.1.8`，安装地址与市场索引一致，解析路径不再指向本仓库；`web` 的技能查看器随包客户端也为 `0.1.8`。
- 安装前的 profile 配置、锁文件和插件管理记录备份在 `/Users/winter/.dsh/backups/remote-plugins-20261107-202147`（不含 `node_modules`）。`creative`、`headless`、`student` 的配置补丁 SHA-256 保持一致；`web` 的补丁仅追加市场索引配置，原内容逐字节保留。历史备份 profile 保留。`headless` 旧的直接依赖 `@deepseek-ai/dsh-agent-preset-registry@0.2.1-rc.5` 被当前 DSH 拒绝加载，已对齐到 `0.2.2-rc.1`；其他非目标依赖保持原值。
- `headless` 的首次 pnpm 安装报告完成后进程未退出，终止该进程并重跑官方命令后正常退出。最终 4 个 profile 的配置合成通过；安装日志与验证结果在 `/Users/winter/dsh-plugins/local-remote-install-20261107-202147/`。
- `dsh-webctl restart` 后，在真实浏览器逐项确认 5 个组合包均显示远程 Git 来源、`v0.1.8` 且全部组件运行中（writer 2、student 2、project-default-mode 1、skill-viewer 2、model-options 1）。日常 `web` 的「发现」页已添加 `https://winterhuan.github.io/dsh-creative/index.json`。安装说明已改为日常使用远程版本、本地链接只用于开发 profile。

2026-11-07 插件市场详情连接修复：

- 浏览器复现「发现」页的「无法连接到详细介绍的来源」；已安装页读取随包 README 正常。市场详情访问 `raw.githubusercontent.com`，本机直连返回 `ECONNRESET`，经已有的 `http://127.0.0.1:10808` 代理读取同一 README 返回 HTTP 200。launchd 的 Web 服务仅设置 PATH 和 HOME，没有继承终端代理。
- 按 DSH 官方代理指南创建 `~/.dsh/.env`（权限 0600），设置 HTTP_PROXY、HTTPS_PROXY 及本机直连的 NO_PROXY；重启 Web 后，真实浏览器逐项确认写作、学生、技能查看器、项目默认模式、模型设置的市场详情正文均加载成功。插件发布内容与版本 `0.1.8` 保持不变。复现和验证材料位于 `/Users/winter/dsh-plugins/detail-fix-20261107/`。

2026-11-07 技能查看器仓库合并：

- 市场发布与本机安装迁移到合并后的 [dsh-skills-viewer](https://github.com/winterhuan/dsh-skills-viewer)，版本 `0.1.8`，保留原仓库历史及用户配置。
- 构建、147 项测试、单次远程安装及浏览器验收通过。备份与证据：`/Users/winter/dsh-plugins/merge-skills-viewer-20261107-204726/`。两个旧仓库已删除，GitHub 均返回 404；合并后的仓库保留。
