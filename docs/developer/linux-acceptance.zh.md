---
description: "在 Linux 检查 dsh-creative，通过云端 DSH 验证插件，并记录待验收检出的证据。"
---

# Linux 验收

[English](linux-acceptance.md) | 中文

## 概述

先在 Linux 检查固定的 `dsh-creative` 检出，再通过真实 DSH 浏览器会话验证构建的插件。命令检查完成后才能验收预览。将检出版本、退出码、浏览器观察和磁盘结果一起记录；仅构建通过不足以证明客户端可用。本教程使用[现有 Instabox 预览](../user/cloud-dsh-preview.zh.md)。

## 目录

- [准备检出](#prepare)
- [运行 Linux 检查](#checks)
- [验证真实预览](#browser)
- [记录结果](#record)
- [开发备注](#dev-note)

-----

<a id="prepare"></a>
## 准备检出

准备可通过 SSH 访问的 Instabox 账号，以及[预览参考](../user/cloud-dsh-preview.zh.md#environment)中的工具链。除标明在 Mac 执行的命令外，以下命令均在云端 shell 运行。修改插件源码前先读 [HANDOFF.md](../../HANDOFF.md)。

在 Mac 进入现有机器。若它由人工暂停，先恢复机器。

```sh
instabox ssh dsh-creative-preview
```

在云端先核对检出和递归子模块指针，再开始检查。

```sh
cd /data/workspace/dsh-creative
node --version
pnpm --version
python3 --version
git status --short
git rev-parse HEAD
git submodule status --recursive
```

将父仓库和各子模块提交与待验收版本比较。子模块状态以 `-`、`+` 或 `U` 开头时，需要初始化或处理不一致。前次构建可能留下修改过的 `lib/` 文件；应检查具体路径，不能把所有改动视为可丢弃产物。保留源码改动和用户工作。

缺少子模块时通过 HTTPS 初始化；父仓库的 upstream 地址默认使用 SSH。命令级地址改写不会修改 `.gitmodules`。

```sh
git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init --recursive --depth 1 --filter=blob:none
```

现有验收脚本只检查 `/data/workspace/dsh-creative`，不会拉取或切换提交。验收其他检出时，在对应目录安装依赖并运行根命令，再按 [HANDOFF 第 5 节](../../HANDOFF.md#5-在-dsh-中安装调试和移除)将预览指向该检出构建的包。预览仍加载其他检出时，不能验收新版本。

<a id="checks"></a>
## 运行 Linux 检查

复用脚本前，先将前次证据归档到 `/data/workspace/acceptance` 之外：脚本会覆盖阶段日志和 `results.tsv`。完整检查通过 SSH 执行；已安装的 Instabox `exec` 有命令超时。

```sh
/data/workspace/acceptance/run.sh
cat /data/workspace/acceptance/results.tsv
```

脚本按以下顺序使用冻结锁文件运行，首个失败会终止执行。根命令调用该检出中注册的每个插件仓库，并检查父仓库工具；验收前需解决的集成失败见 [HANDOFF](../../HANDOFF.md#4-开发命令与构建流程)。

```sh
pnpm install --frozen-lockfile
pnpm run plugins:install
pnpm run typecheck
pnpm run build
pnpm test
pnpm run doc-sync
pnpm run hygiene
```

`results.tsv` 必须包含全部 7 个阶段，且退出码均为 `0`；脚本必须输出 `Linux acceptance passed`。未执行到的阶段属于未验证。处理失败后再继续；若打印的日志尾部没有原因，应读取完整失败日志。

从实际 Vitest 汇总记录测试与测试文件数。以当前检出的数量为准，不使用固定的历史通过阈值。脚本不会更新 `commits.txt`、`report.md` 或浏览器截图；本次验收需更新这些记录。

<a id="browser"></a>
## 验证真实预览

全部 Linux 检查通过后，确认 `cloud-preview` 链接待验收检出构建的包。按[预览操作](../user/cloud-dsh-preview.zh.md#operations)重启 DSH 并硬刷新浏览器。服务就绪后获取当前登录链接。

使用独立预览工作区中的合成数据。验收者在真实浏览器完成以下检查，并记录观察结果。

| 检查 | 通过标准 |
|---|---|
| 连接与插件 | 无持续重连状态；全部 5 个插件出现在列表中并启用。 |
| 模式 | 写作和智能学习预设出现且可选择。 |
| Writer 发现 | 拆文库、项目和扫榜标签发现对应的合成目录。 |
| 扫榜预览 | 展开 `扫榜/20261108` 后以 Markdown 预览打开 `选题决策.md`，树中保留聚合与原始文件。 |
| 文件保存 | 通过编辑器追加唯一标记，点击保存，确认已保存状态，并从云端磁盘读到同一标记。 |
| 技能查看器 | 打开技能，读取可用列表及一份完整 skill（技能）正文；不要求固定的列表数量。 |
| HTTPS 与访问 | 已认证的 WebSocket 升级成功；外站 Origin 和缺少私有端口凭据的请求被拒绝。 |

现有预览已验证：认证后的 WebSocket 返回 `101`，外站 Origin 返回 `403`，缺少私有端口凭据返回 `401`。静态页面加载成功不能证明 WebSocket 或保存接口可用。[代理参考](../user/cloud-dsh-preview.zh.md#proxy)说明 DSH 和 Writer 所需的两处域名配置。

模型调用与真实榜单采集需要分别使用已配置的提供商和采集登录态验证。缺少凭据时，记录为未执行，并注明后续验收者；不能将页面验收视为模型验收。

<a id="record"></a>
## 记录结果

每次验收在 Git 之外保留一份独立证据。报告验收完成前，记录以下内容。

- 日期、验收者、机器及工具链版本。
- 父仓库提交、递归子模块提交及开始时的工作区改动。
- 各命令退出码、日志及实际测试数量。
- 预览安装包来源、合成配置及浏览器截图。
- 编辑器的已保存状态与从云端文件读到的标记。
- HTTP/WebSocket 观察结果及所有未执行检查。

先检查 `git-status-after.txt` 和 `artifact-diff-after.txt`，再判断改动性质。构建产物可能随绝对检出路径变化；源码或锁文件改动需要说明。仓库文档和共享证据不包含登录链接、Cookie、提供商密钥及启动日志中的凭据。证据位置见[预览参考](../user/cloud-dsh-preview.zh.md#evidence)。

-----

<a id="dev-note"></a>
## 开发备注

无。
