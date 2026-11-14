---
description: "在独立 profile 中从 GitHub 安装和更新预构建 dsh-superagent fork，或链接本地开发构建。"
---

# Superagent 安装与更新

[English](superagent-installation.md) | 中文

## 概述

将预构建 [winterhuan fork](https://github.com/winterhuan/dsh-superagent-prototype) 通过[插件市场](https://winterhuan.github.io/dsh-creative/index.json)或固定 Git 发布包安装到独立 `superagent` profile。源码开发使用 `plugins/dsh-superagent-prototype` 子模块；`link:` 安装读取该检出目录的构建，不会自动拉取 GitHub 更新。账号、模型、策略及服务管理按 fork 的[设置指南](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/SETUP.md)配置。

## 目录

- [安装到独立 profile](#install)
- [更新本地安装](#update)
- [远程安装](#remote)
- [开发备注](#dev-note)

<a id="install"></a>
## 安装到独立 profile

使用 Node.js 24、pnpm 11.7.0 和与原型兼容的 DSH 宿主。Host 与面板可在 Creative 的 DSH `0.2.2-rc.1` 运行；真实模型执行需单独验证。Superagent 有自己的锁文件，仍是使用 `0.2.1-alpha.2` DSH 依赖的研究原型。本仓库中的源码目录为 `plugins/dsh-superagent-prototype`。

本地开发时，在父仓库根目录初始化子模块（如有需要）。链接安装前先构建，因为包会加载 `lib/index.js` 和 `lib/client.js`。仅在 `superagent` 尚不存在时运行创建 profile 的那行命令；它会替换现有 profile 补丁。独立 profile 将插件对进程环境的修改及重启与日常工作 profile 分开。

```sh
git submodule update --init plugins/dsh-superagent-prototype
cd plugins/dsh-superagent-prototype
pnpm install --frozen-lockfile
pnpm build
dsh --profile superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
dsh --profile superagent --dump-config | rg '^# == dsh-superagent'
```

最后一条命令应显示 Superagent 的配置层。本机的「插件 → 已安装」页应显示 `plugins/dsh-superagent-prototype` 检出目录的链接来源。按设置指南配置插件；安装成功本身不会配置账号或授权工作。

账号与本机配置使用 fork 的[部署指南](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#install)。已有 profile 不要重跑其中的 profile 创建命令：该命令会替换它的配置补丁。

<a id="update"></a>
## 更新本地安装

升级前，等待所有 Executor 结束当前轮次，并按 fork 的[升级指南](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#upgrade)要求备份配置的 `stateDir`，包括 `orchestrator.sqlite`。重启会结束运行中的 Assignment，服务恢复时会附带恢复说明。较新版本迁移过的数据库需要升级前的备份才能回滚。

在父仓库根目录更新子模块指针并重新构建：

```sh
git submodule update --remote -- plugins/dsh-superagent-prototype
pnpm --dir plugins/dsh-superagent-prototype install --frozen-lockfile
pnpm --dir plugins/dsh-superagent-prototype build
```

若 Git 报告本地改动或历史分叉，先保留改动并处理分支，再继续。若依赖安装或构建失败，先解决错误再重启。已有 `link:` 仍然有效，无需再次添加插件。

在子模块目录重启独立服务：

```sh
scripts/dsh-superagent --profile superagent restart
```

硬刷新浏览器，再在插件页检查 Superagent 的来源和组件状态。服务管理按[启动与停止](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#start-and-stop)操作；链接同一检出目录的每个运行中 profile 都需通过各自的服务重启加载构建。

<a id="remote"></a>
## 远程安装

fork 的 `v0.1.0` Git 发布包包含 Host 与 Client 构建。安装时直接从 GitHub 获取该包，无需构建本地检出目录。市场条目使用其固定提交。已有 `superagent` profile 时，运行：

```sh
dsh plugin --profile superagent add "github:winterhuan/dsh-superagent-prototype#v0.1.0"
dsh --profile superagent --dump-config | rg '^# == dsh-superagent'
```

此命令替换现有的本地链接或压缩包依赖，保留 profile 补丁与 `stateDir`。通过服务脚本重启独立服务，再硬刷新浏览器。「插件 → 已安装 → Superagent → 来源信息」显示 GitHub 仓库及固定提交。

更新 Git 安装时，安装新发布的固定引用并重启该 profile。重新构建本地检出目录不会更新它。重启前遵循与本地安装相同的[升级与备份流程](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#upgrade)。

<a id="dev-note"></a>
## 开发备注

无。
