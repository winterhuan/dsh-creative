---
name: browser-cdp
description: "Use this skill when a writing task needs a real browser with the author's login state: ranking scans (Qidian PC pages, Fanqie, Qimao, JJWXC, Ciweimao, Dianzhong), the Heiyan author backend, or research that must read a live logged-in page. The backend is Ego Lite (ego-browser): the user logs in inside Ego Lite, collectors run through the shared ego-session transport, and login/CAPTCHA pauses hand the browser to the user. Trigger phrases: browser automation, 浏览器操作, 操作浏览器, 复用登录态, 扫榜需要浏览器, ego-browser."
metadata: {"openclaw":{"requires":{"bins":["ego-browser"]},"source":"https://github.com/zenstory-ai/oh-story-claudecode"}}
---
# Browser（Ego Lite）操作入口

写作任务需要真实浏览器时，统一使用 **Ego Lite**（`ego-browser`）：用户在 Ego Lite 里登录目标网站，采集脚本通过共享传输模块复用登录态；普通 Chrome 不会被启动、复制或关闭。

> 通用浏览操作（打开网页、点击、填表、截图）请直接加载官方 `ego-browser` skill（Ego Lite 安装时写入 `~/.agents/skills/ego-browser`）。本 skill 只负责写作采集场景的入口、前置检查与交接约定，不重复厂商文档。

## 前置条件

- 已安装 Ego Lite 并完成引导（macOS / Windows；Linux 尚不支持）。未安装时告知用户按官方 `ego-browser` skill 的安装指引操作，不要尝试启动 Chrome 或安装其他浏览器后端。
- 目标网站需要登录的（黑岩后台等）：请用户先在 Ego Lite 里登录一次。登录态保存在 Ego Lite 自己的 Profile 中，由用户控制。
- 验证命令（无副作用）：`ego-browser --version`。

## 采集脚本如何使用浏览器

七个扫榜采集器（起点 PC/书库、番茄、七猫榜单、晋江、刺猬猫、点众、黑岩）都通过共享传输模块
`{SKILL_DIR}/browser-cdp/scripts/ego-session.cjs` 调用 Ego Lite：

- 每次运行创建一个 TaskSpace（一个采集目标一个 Space），页面用固定标签 `p1`；
- 每个操作是一次独立的 `ego-browser nodejs` 调用，Space 与页面跨调用保持；
- 结果用带标记的 JSON 信封返回，外层校验后才使用；
- 运行结束调用 `finish` 关闭 Space；失败或交接时保留 Space 供恢复。

调用采集脚本不需要任何浏览器参数（没有 `--port`）：

```bash
node {SKILL_DIR}/story-long-scan/scripts/ciweimao-rank-scraper.js --type all --outdir <目录>
```

脚本报「浏览器无响应 / 请确认已安装 Ego Lite」时，先跑 `ego-browser --version` 与 `ego-browser skill` 诊断，再重跑；不要退回 Chrome CDP 流程。

## 登录与验证码：交接 / 续接

需要人工操作时，脚本会把浏览器交接给用户（`handOff`），Space 和页面保留：

1. 脚本输出 `Space <id>` 与续接命令后退出（黑岩未登录、起点验证码自动重试失败）。
2. 用户在 Ego Lite 对应 Space 里完成登录或验证。
3. 用户确认后，按脚本打印的命令带 `--space <id>` 重跑（其余参数不变）：

```bash
# 黑岩：登录后续接
node {SKILL_DIR}/story-short-scan/scripts/heiyan-booklist-scraper.js --pages 5 --space <spaceId>
# 起点：人工验证后续接
node {SKILL_DIR}/story-long-scan/scripts/qidian-rank-scraper.js --type library --space <spaceId>
```

约定：

- 交接后的 Space 归用户所有；脚本续接时会先 `takeOverTaskSpace` 收回并核对页面，不会静默新建 Space。
- 采集中断（超时、结果不明）时脚本**不**关闭 Space，并打印保留原因；用同一个 `--space <id>` 检查后续接，不要直接重跑覆盖。
- 数据批次检查点在 `.writer/browser-runs/<runId>/`：脚本启动时打印运行 ID，中断后加 `--resume <runId>` 跳过已提交批次；参数或解析器版本不一致会被拒绝。
- 不要在脚本等待人工验证时另开浏览器窗口重试；同一 Space 里完成验证再续接。
- 凭据红线：登录态只在页面内使用。采集脚本与助手都不得把 Token/Cookie 打印到输出、写入文件或带入模型上下文（黑岩的 Admin-Token 由页面内脚本读取并请求，本机进程只见业务数据）。

## 停止 / 清理

- 正常结束：脚本自动 `finish` 关闭自己的 Space；用户标签页不受影响。
- 需要手动清理：在 Ego Lite 的 Space 面板中关闭对应 Space；不要按进程名结束 Ego Lite。
- 采集卡在页面：先让用户在 Space 面板查看/接管，确认状态后重跑或 `--resume`；不要反复重启浏览器。

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| `failed to launch ego-browser` / 命令不存在 | 安装 Ego Lite 并重启会话；确认 `ego-browser --version` 可用 |
| `EGO_TASK_SPACE_NAME_IN_USE` | 同名 Space 归用户所有：让用户关闭它，或脚本换新名字重跑（每次运行自带唯一后缀，正常不会出现） |
| 页面跳到登录页 | 按上方「交接 / 续接」流程：用户在 Space 里登录，然后 `--space <id>` 重跑 |
| 采集结果为空 / 结构变动 | 让用户在 Ego Lite 里人工打开对应榜单页确认；页面正常则多为解析器需更新，报告数据质量标记 |
| 需要通用浏览操作 | 加载官方 `ego-browser` skill，按其指引操作；本 skill 不覆盖厂商 API 细节 |
