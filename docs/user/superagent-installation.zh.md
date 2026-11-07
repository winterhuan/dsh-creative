---
description: "通过本地源码安装和更新 dsh-superagent，并核对远程包是否满足直接安装条件。"
---

# Superagent 安装与更新

[English](superagent-installation.md) | 中文

## 概述

从 [源码仓库](https://github.com/deepseek-ai/dsh-superagent-prototype) 安装 Superagent，更新时重新构建该检出目录。`link:` 安装读取本地构建，不会自动拉取 GitHub 更新。本指南面向本机已有的 Web profile；账号、模型、策略及独立 Superagent 服务按仓库的 [设置指南](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/SETUP.md) 配置。

## 目录

- [安装到 Web](#install)
- [更新本地安装](#update)
- [远程安装](#remote)
- [开发备注](#dev-note)

<a id="install"></a>
## 安装到 Web

使用 Node.js 24、pnpm 11.7.0 和已安装的 DSH `0.2.2-rc.1`。Superagent 有独立仓库和锁文件，父仓库的插件命令不会构建它。本机源码目录为 `/Users/winter/dsh-superagent`。

在存放仓库的目录执行以下命令。若 `dsh-superagent` 已存在，跳过克隆并进入已有检出目录。链接安装前先构建，因为包会加载 `lib/index.js` 和 `lib/client.js`。

```sh
git clone https://github.com/deepseek-ai/dsh-superagent-prototype.git dsh-superagent
cd dsh-superagent
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile web add "link:$PWD"
dsh --profile web --dump-config | rg '^# == dsh-superagent'
```

最后一条命令应显示 Superagent 的配置层。本机的「插件 → 已安装」页应显示来源 `link:/Users/winter/dsh-superagent`。按设置指南配置插件；安装成功本身不会配置账号或授权工作。

首次安装到独立的 `superagent` profile 时，使用 [部署指南](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md#install)。已有 profile 不要重跑其中的 profile 创建命令：该命令会替换它的配置补丁。

<a id="update"></a>
## 更新本地安装

升级前，等待所有 Executor 结束当前轮次，并按 [升级指南](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md#upgrade) 要求备份配置的 `stateDir`，包括 `orchestrator.sqlite`。重启会结束运行中的 Assignment，服务恢复时会附带恢复说明。较新版本迁移过的数据库需要升级前的备份才能回滚。

在源码目录拉取更新并重新构建：

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

若 Git 报告本地改动或历史分叉，先保留改动并处理分支，再继续。若依赖安装或构建失败，先解决错误再重启。已有 `link:` 仍然有效，无需再次添加插件。

重启本机托管的 Web 服务：

```sh
~/.dsh/bin/dsh-webctl restart
```

硬刷新浏览器，再在插件页检查 Superagent 的来源和组件状态。独立的 `superagent` 服务按 [启动与停止](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md#start-and-stop) 操作；链接同一检出目录的每个运行中 profile 都需通过各自的服务重启加载构建。

<a id="remote"></a>
## 远程安装

DSH 支持 Git 包，但该仓库当前提供的源码没有包含可安装的构建。[包清单](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/package.json) 指向 `lib/`，[.gitignore](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/.gitignore) 排除了该目录，清单也没有安装准备脚本。仓库还没有预构建的 [Release](https://github.com/deepseek-ai/dsh-superagent-prototype/releases)。因此，仅使用 Git 地址不能获得运行入口文件。

在仓库提供包含构建的包或安装时构建流程之前，继续使用本地链接。切换前核验包内容及其与已安装 DSH 的兼容性：Superagent 清单仍声明 `0.2.1-alpha.2` 系列依赖。远程来源需要替换每个目标 profile 中已有的 `dsh-superagent` 依赖。

<a id="dev-note"></a>
## 开发备注

无。
