# 2026 年 11 月 21 日本机环境变更记录

本文件保留 Story／Writer 拆分与 Oh Story 固定 Tag 安装记录；当前服务布局见 [HANDOFF](../../HANDOFF.md#independent-service-profiles)，后续变更见[本机环境变更记录](../../HANDOFF-changelog.md)。

2026-11-21：macOS 将 Oh Story 与旧版 Writer 分到独立 profile。Oh Story 0.1.31 使用 story profile 和端口 3081，旧版 Writer 0.2.8 使用 writer profile 和端口 3086；两个 profile 各保留一份原有会话与工作区登记，331 个数据文件逐字节复制，工作区表中的原会话登记保持不变。新增 dsh-story 控制器和 LaunchAgent；两个服务均通过真实 DSH 页面确认只加载各自插件。配置与迁移备份位于 ~/.dsh/backups/story-writer-split-20261121-113828/。

2026-11-21：Oh Story fork [v0.1.31](https://github.com/winterhuan/oh-story-dsh/tree/v0.1.31) 改为源码仓库固定 Tag 安装，版本为 `@winterhuan/oh-story-dsh@0.1.31`；主线提交与标签均为 `bdbc0406f3e92b6ddfab9c39afd2d236bbc4f351`，市场固定相同提交的 `packages/dsh-plugin`。隔离 `release-check` profile 远程安装、配置回读、真实 DSH Web 启动和认证后 HTML 返回通过。WSL 日常 `writer` profile 已更新并重启 3086，配置回读、服务就绪和 Web HTML 检查通过；macOS profile 未更新。安装前配置备份位于 `~/.dsh/backups/writer-release-0.1.31-20261121-0928/`。
