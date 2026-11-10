---
description: "Locate and operate the existing Instabox DSH preview, configure its HTTPS proxy, and find Linux acceptance evidence."
---

# Cloud DSH preview reference

English | [中文](cloud-dsh-preview.zh.md)

## Summary

Use the existing Instabox machine to inspect the five plugins, edit synthetic writing files and repeat Linux acceptance. DSH runs independently of the Mac terminal, with an isolated profile and workspace. The private HTTPS entry requires both the Instabox port credential and DSH authentication. Follow the [Linux acceptance tutorial](../developer/linux-acceptance.md) for the ordered checks.

## Table of Contents

- [Environment](#environment)
- [Operations and authenticated entry](#operations)
- [HTTPS proxy and trusted hosts](#proxy)
- [Evidence locations](#evidence)
- [Model and browser limits](#limits)
- [Dev Note](#dev-note)

-----

<a id="environment"></a>
## Environment

The preview uses the following independent cloud installation. Its plugin links point into the cloud checkout, while daily Mac profiles continue to use their remote packages.

| Item | Value |
|---|---|
| Machine | `dsh-creative-preview` |
| OS and capacity | Debian 13 x86_64, 4 vCPU, 8 GiB RAM |
| Toolchain | Node 24.22.2, pnpm 11.7.0, Python 3.13.5 |
| DSH and plugins | DSH `0.2.2-rc.1`, five plugin bundles at `0.1.8` |
| Source checkout | `/data/workspace/dsh-creative` |
| DSH runtime | `/data/workspace/dsh-runtime` |
| DSH home and profile | `/data/home/.dsh-preview`, `cloud-preview` |
| Synthetic workspace | `/data/workspace/preview-documents/deepseek-harness/default-workspace` |
| DSH service | `winter` user systemd, `dsh-preview.service` |
| Proxy | System Nginx, `127.0.0.1:3080` → DSH `127.0.0.1:3081` |

The machine was created with `--no-vault`. No Mac provider keys, browser logins or daily documents were imported. Plugin source and installation directories remain owned by the [HANDOFF source map](../../HANDOFF.md#开发目录与源码归属).

<a id="operations"></a>
## Operations and authenticated entry

On the Mac, enter the cloud shell. The default idle pause is 30 minutes; an automatically paused machine wakes on access. A manually suspended machine requires `instabox resume dsh-creative-preview`. Continuous operation remains subject to the account lifecycle limits.

```sh
instabox ssh dsh-creative-preview
```

In the cloud, use user systemd to inspect or control DSH. Lingering and service enablement allow it to run without an active SSH session. Restart after building linked plugins, then hard-refresh the browser.

```sh
systemctl --user status dsh-preview.service
systemctl --user restart dsh-preview.service
systemctl --user stop dsh-preview.service
systemctl --user start dsh-preview.service
```

After the server log contains the new `dsh web:` readiness line, obtain the authenticated entry with the installed helper. It combines the private port URL with the current DSH launch token.

```sh
/data/home/.local/bin/dsh-preview-url
```

The helper reads the latest startup URL in an append-only log; do not use it before the new process is ready. The DSH launch token changes on restart. Suspend/resume preserves the process; stop/start boots services again and requires a fresh entry. Keep authenticated links and the server log private. The [DSH public-deployment guide](../../upstream/docs/user/guide/public-deployments.md) owns the authentication and proxy requirements.

<a id="proxy"></a>
## HTTPS proxy and trusted hosts

The private Instabox HTTPS port forwards to Nginx on loopback. Nginx restores the browser-visible `Host`, preserves `Origin`, forwards WebSocket upgrades and adds `Secure` to backend cookies. Without the Host correction, the forwarded loopback Host and public browser Origin cause DSH to return `403`.

The installed configuration is `/etc/nginx/sites-available/dsh-preview`. The equivalent configuration below uses `preview.example` as a placeholder: replace it with the hostname of the published HTTPS URL, without a scheme or path. Keep both listeners on loopback.

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

DSH startup advertises the HTTPS root and trusts that same hostname. `--public-url` alone does not grant trust. The installed unit is `/data/home/.config/systemd/user/dsh-preview.service`; its launch arguments include:

```text
--profile cloud-preview --host 127.0.0.1 --port 3081
--public-url https://preview.example/ --trusted-host preview.example --no-open
```

Writer has a separate hostname check for file saves. Its trusted hostname and the isolated Documents directory are configured in `/data/home/.dsh-preview/profiles/cloud-preview/cordis.patch.yml`. Merge these rows into the existing patch and preserve unrelated entries:

```yaml
- id: workspace-controller
  config:
    documentsDirectory: /data/workspace/preview-documents
- id: writer
  config:
    trustedHosts:
      - preview.example
```

If pages load but reconnecting continues, check the forwarded Host, Origin, DSH trusted hostname and WebSocket headers. If reads work but Writer reports an untrusted source when saving, check `writer.trustedHosts`. Do not disable either Origin check to make the preview pass.

Inspect the proxy and validate its configuration in the cloud.

```sh
sudo systemctl status nginx
sudo nginx -t
```

<a id="evidence"></a>
## Evidence locations

The installed runner and initial evidence are kept outside the repository. Archive these files before repeating acceptance, and record the new checkout and result explicitly.

| Location | Content |
|---|---|
| `/data/workspace/acceptance/run.sh` | Checks the fixed cloud checkout and stops on failure. |
| `/data/workspace/acceptance/results.tsv` | Stage exit codes and completion times. |
| `/data/workspace/acceptance/*.log` | Installation, build, test and documentation logs. |
| `/data/workspace/acceptance/report.md` and `commits.txt` | Initial result and recorded submodule commits; the runner does not refresh them. |
| `/data/workspace/dsh-preview/README.md` | Machine-local operation commands. |
| `/data/workspace/dsh-preview/server.log` | DSH startup and diagnostics, including launch credentials; do not share raw. |
| `/data/home/.dsh-preview/access-port.json` and `access.json` | Private entry credentials; keep outside Git and shared reports. |
| `/Users/winter/.dsh/backups/instabox-dsh-preview-20261108/` | Mac copy of initial logs, browser results and screenshot. |

<a id="limits"></a>
## Model and browser limits

The recorded acceptance covers synthetic files and real browser operations. Model calls and live ranking collection were not performed. Add a provider API key through Settings → Models when verifying model behavior, following the [provider guide](../../upstream/docs/user/guide/providers.md). The [account UI reference](../../upstream/packages/client/ui-settings-account/README.md#known-limitations-and-deferred-work) documents the loopback-only OAuth callback limitation; this remote HTTPS preview uses API keys.

Configured model requests and file/tool operations originate in the cloud DSH process; model inference remains on the provider's servers. An installed Chromium browser does not supply ranking-site logins or wire a browser backend into Writer. Follow Writer's [browser-cdp skill](../../plugins/dsh-writer/packages/winterhuan/writer/skills/browser-cdp/SKILL.md) before live collection.

-----

<a id="dev-note"></a>
## Dev Note

None.
