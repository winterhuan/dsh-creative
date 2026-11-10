---
description: "查找和操作现有 Instabox DSH 预览，核对 HTTPS 代理配置，并定位 Linux 验收证据。"
---

# 云端 DSH 预览参考

[English](cloud-dsh-preview.md) | 中文

## 概述

使用现有 Instabox 机器查看 5 个插件、编辑合成文稿，并重复 Linux 验收。DSH 使用独立 profile 和工作区运行，不依赖 Mac 终端。私有 HTTPS 入口同时需要 Instabox 端口凭据和 DSH 认证。按 [Linux 验收教程](../developer/linux-acceptance.zh.md)完成顺序检查。

## 目录

- [环境](#environment)
- [操作与登录入口](#operations)
- [HTTPS 代理与可信域名](#proxy)
- [证据位置](#evidence)
- [模型与浏览器限制](#limits)
- [开发备注](#dev-note)

-----

<a id="environment"></a>
## 环境

预览使用以下独立云端安装。插件链接指向云端检出，Mac 日常 profile 继续使用各自的远程包。

| 项目 | 值 |
|---|---|
| 机器 | `dsh-creative-preview` |
| 系统与容量 | Debian 13 x86_64，4 vCPU，8 GiB RAM |
| 工具链 | Node 24.22.2，pnpm 11.7.0，Python 3.13.5 |
| DSH 与插件 | DSH `0.2.2-rc.1`，5 个插件组合包版本为 `0.1.8` |
| 源码检出 | `/data/workspace/dsh-creative` |
| DSH runtime | `/data/workspace/dsh-runtime` |
| DSH home 与 profile | `/data/home/.dsh-preview`，`cloud-preview` |
| 合成工作区 | `/data/workspace/preview-documents/deepseek-harness/default-workspace` |
| DSH 服务 | `winter` 的用户 systemd，`dsh-preview.service` |
| 代理 | 系统 Nginx，`127.0.0.1:3080` → DSH `127.0.0.1:3081` |

机器创建时使用了 `--no-vault`，未导入 Mac 的提供商密钥、浏览器登录态或日常文稿。插件源码与安装目录以 [HANDOFF 源码映射](../../HANDOFF.md#开发目录与源码归属)为准。

<a id="operations"></a>
## 操作与登录入口

在 Mac 进入云端 shell。默认闲置 30 分钟后自动暂停，访问可唤醒自动暂停的机器。人工暂停的机器需要执行 `instabox resume dsh-creative-preview`。连续运行仍受账号生命周期限制。

```sh
instabox ssh dsh-creative-preview
```

在云端使用用户 systemd 检查或控制 DSH。已启用 lingering 与服务自启动，因此无需保持 SSH 会话。链接插件构建后需重启服务，再硬刷新浏览器。

```sh
systemctl --user status dsh-preview.service
systemctl --user restart dsh-preview.service
systemctl --user stop dsh-preview.service
systemctl --user start dsh-preview.service
```

服务日志出现新的 `dsh web:` 就绪行后，使用已安装的辅助命令获取登录入口。它将私有端口地址与当前 DSH 启动 token 合并。

```sh
/data/home/.local/bin/dsh-preview-url
```

辅助命令读取追加日志中的最后一条启动 URL；新进程尚未就绪时不要使用。DSH 启动 token 会在重启时变化。暂停/恢复保留进程；停止/启动会重新启动服务，需要重新获取入口。登录链接与服务日志应保持私有。[DSH 公网部署指南](../../upstream/docs/user/guide/public-deployments.md)定义认证和代理要求。

<a id="proxy"></a>
## HTTPS 代理与可信域名

Instabox 私有 HTTPS 端口转发到回环地址上的 Nginx。Nginx 恢复浏览器使用的 `Host`、保留 `Origin`、转发 WebSocket 升级，并为后端 Cookie 添加 `Secure`。缺少 Host 修正时，转发的回环 Host 与浏览器公网 Origin 不一致，DSH 会返回 `403`。

已安装配置位于 `/etc/nginx/sites-available/dsh-preview`。下面的等价配置以 `preview.example` 为占位符：将它替换为已发布 HTTPS URL 的域名，不带协议或路径。两个监听器均保持在回环地址。

```nginx
map $http_upgrade $dsh_connection_upgrade {
    default upgrade;
    '' close;
}
server {
    listen 127.0.0.1:3080;
    server_name preview.example;
    access_log off;
    client_max_body_size 64m;
    location / {
        proxy_pass http://127.0.0.1:3081;
        proxy_http_version 1.1;
        proxy_set_header Host preview.example;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $dsh_connection_upgrade;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cookie_flags ~ secure;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

DSH 启动时公告 HTTPS 根地址，并信任同一域名。仅设置 `--public-url` 不会授权该域名。已安装单元位于 `/data/home/.config/systemd/user/dsh-preview.service`，启动参数包含：

```text
--profile cloud-preview --host 127.0.0.1 --port 3081
--public-url https://preview.example/ --trusted-host preview.example --no-open
```

Writer 对文件保存使用独立的域名检查。可信域名与隔离 Documents 目录配置在 `/data/home/.dsh-preview/profiles/cloud-preview/cordis.patch.yml`。将以下条目合并到现有补丁，保留其他配置：

```yaml
- id: workspace-controller
  config:
    documentsDirectory: /data/workspace/preview-documents
- id: writer
  config:
    trustedHosts:
      - preview.example
```

页面加载后仍持续重连时，检查转发的 Host、Origin、DSH 可信域名和 WebSocket 头。读取正常但 Writer 保存提示来源不受信任时，检查 `writer.trustedHosts`。不能为通过验收而关闭任何一处 Origin 检查。

在云端检查代理并验证配置。

```sh
sudo systemctl status nginx
sudo nginx -t
```

<a id="evidence"></a>
## 证据位置

已安装的检查脚本和初次证据保留在仓库之外。重复验收前先归档，并明确记录新检出与结果。

| 位置 | 内容 |
|---|---|
| `/data/workspace/acceptance/run.sh` | 检查固定云端检出，失败时终止。 |
| `/data/workspace/acceptance/results.tsv` | 各阶段退出码与完成时间。 |
| `/data/workspace/acceptance/*.log` | 安装、构建、测试及文档检查日志。 |
| `/data/workspace/acceptance/report.md` 与 `commits.txt` | 初次结果与记录的子模块提交；脚本不会更新它们。 |
| `/data/workspace/dsh-preview/README.md` | 机器内的操作命令。 |
| `/data/workspace/dsh-preview/server.log` | DSH 启动和诊断，含启动凭据；不共享原始内容。 |
| `/data/home/.dsh-preview/access-port.json` 与 `access.json` | 私有入口凭据；保持在 Git 和共享报告之外。 |
| `/Users/winter/.dsh/backups/instabox-dsh-preview-20261108/` | Mac 上的初次日志、浏览器结果和截图副本。 |

<a id="limits"></a>
## 模型与浏览器限制

已记录验收覆盖合成文件和真实浏览器操作，未执行模型调用或真实榜单采集。验证模型行为时，按[提供商指南](../../upstream/docs/user/guide/providers.md)在「设置 → 模型」添加 API key。[账号界面参考](../../upstream/packages/client/ui-settings-account/README.md#known-limitations-and-deferred-work)说明仅支持回环地址的 OAuth 回调限制；此远程 HTTPS 预览使用 API key。

配置后，模型请求及文件、工具操作由云端 DSH 进程发起；模型推理仍在提供商服务器执行。安装 Chromium 不会提供榜单网站登录态，也不会自动为 Writer 接入浏览器后端。真实采集前按 Writer 的 [browser-cdp skill（技能）](../../plugins/dsh-writer/packages/winterhuan/writer/skills/browser-cdp/SKILL.md)准备。

-----

<a id="dev-note"></a>
## 开发备注

无。
