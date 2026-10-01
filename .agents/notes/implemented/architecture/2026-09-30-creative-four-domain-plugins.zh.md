# Agent Note: 四个可独立启用的 Creative 领域插件

Status: implemented

[English](2026-09-30-creative-four-domain-plugins.md) | 中文

## Problem

单一 Creative 包让创作者必须同时安装四条工作流。合并状态和跨目录 Python 导入也使仅移动目录无法完成拆分：游戏输入需要小说与短剧辅助脚本，短剧合成需要视频脚本。

## Decision

`dsh-story`、`dsh-short-drama`、`dsh-novel-to-game` 和 `dsh-video-recap` 四个可独立安装的 bundle 分别拥有 Host 工具、技能、资源、路由、浏览器入口和 Session 状态，各有直接侧栏入口。DSH 继续拥有会话、文件系统授权、任务、凭据与模型配置。领域包不依赖 Creative 聚合包或其他业务插件。

Creative 组合四个包，并保留旧路由与生产别名。它没有聚合页面、浏览器入口或合并状态 store。领域 provider 只在所属包注册。Bundle 行使用稳定 ID，单独 bundle 与 Creative 同时安装不会重复注册。已有生产设置页和命名空间继续共用；拆分不新增公共运行时包。

小说拥有六个技能、七个角色、写作钩子和 `story_zhuque`。短剧拥有五个技能、`creative_production`、确认处理、投影和 `drama_produce_run`。游戏拥有四个技能、模板、经认证的 `game_qa` 和预览。视频拥有两个技能、交付度量、播放和 `video_produce_run`。聚合保留 `creative_produce_run` 与 `creative_produce_status`；独立技能桥接说明使用各领域工具名。

各路由保留 Session 查找、可信请求、解析后路径包含检查和文件预算；编辑器保留版本化写入。领域列表和读取拒绝其他领域文档。短剧回放同时接受自己的生产结果和旧聚合结果。跨领域改编通过项目文件和来源身份交换数据，不读取其他插件的私有状态。

所需原著导出与溯源辅助脚本随消费包分发。短剧带齐合成与复核所需媒体脚本。`scripts/sync-video-runtime.py` 维护视频运行时副本、短剧媒体副本和小说辅助脚本副本；测试也比较游戏来源辅助脚本。这些是受校验的分发副本，不是对兄弟目录的运行时依赖。

独立页面使用 `creative.story.v1`、`creative.drama.v1`、`creative.game.v1` 和 `creative.video.v1`。旧 `creative.workbench.v2` 状态不读取也不迁移；用户明确选择移除聚合页面而不处理旧草稿。已保存的项目文件、设置和凭据引用继续使用。

## Alternatives considered

**只拆组件或增加侧栏。** Host 注册和脚本查找仍然耦合，无法支持独立安装。

**让四个包装包依赖 Creative。** 这仍会带入无关工作流，且 Creative 成为聚合包时会产生依赖环。

**先提取公共运行时。** 具体复用来自已有 DSH 服务和有限的辅助脚本。新增服务层会带来缺乏实际需求的归属与发布负担。只有维护受检副本成本更高时才重新考虑库提取。

**保留聚合页面以兼容旧草稿。** 这会留下第五个页面、合并状态及重复界面代码。用户不需要旧草稿迁移，因此四个独立页面承担全部界面职责。

## Consequences

创作者可只安装一条工作流。维护者需要管理更多包清单和构建入口，共用脚本来源的变更必须通过同步检查。聚合只保留 Host 兼容代码；独立包不得导入它。旧聚合页面的未保存内容不再有界面入口。

独立注册与卸载测试、Loader 组合测试覆盖领域目录及聚合加领域的安装。路由测试拒绝无关文件。已有工作流测试覆盖章节检查、可解码的合成剧集交付、本地解说交付与经认证的游戏证据。真实 Chrome 检查覆盖独立小说编辑保存、短剧生产页、视频播放及聚合安装后的四个入口。付费提供方调用与艺术质量不在证据范围内。

### Related decisions

[Creative 工作台决策](../feature/2026-09-03-creative-workbench.zh.md) 继续拥有 DSH 归属、生产授权、会话投影与文件安全规则。本决策仅取代其单包理由。读者价值、游戏证据、成片剧集与视频交付决策继续拥有业务契约。归档笔记与归档清单不变。

[按任务划分技能](../simplification/2026-10-01-creative-task-skills.zh.md)拥有领域技能目录与按需工作流资源。
