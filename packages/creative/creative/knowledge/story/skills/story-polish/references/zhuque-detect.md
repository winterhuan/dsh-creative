# 朱雀检测通道

story-polish 有两个检测通道：API 通道由 Agent 直接调用；网页通道由用户在自己的浏览器里检测，再把结果贴回来。两者用的是同一个朱雀文本模型，判定规则也相同。

## API 通道

### 接口

- 服务：腾讯云 EdgeOne Makers 内置模型 `@makers/zhuque-text`（腾讯云文档「使用朱雀模型」）。
- 请求：`POST https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify`，请求头 `Authorization: Bearer <MAKERS_API_KEY>`，请求体 `{"text": "...", "is_merge": false}`。
- `is_merge: false` 按段落独立打分，长文会切成每段约 250 到 500 字的片段；整体指标和 `is_merge: true` 相同。`scripts/zhuque_detect.py` 固定使用 `false`，方便定位要改的片段。
- 额度：每月免费 50 万 token。扣减量以响应里的 `makers_models_usage.total_tokens` 为准，实测约 1.67 token/字（807 字扣 1345 token，8904 字扣 14840 token）。用量可以在 EdgeOne 控制台的 Makers 概览里查看。
- 密钥在 EdgeOne 控制台「Makers > Models > API Key」创建。

### 响应字段

| 字段 | 含义 |
|---|---|
| `ratio_confidence` | AI 浓度，等于 `labels_ratio` 中 AI 与疑似 AI 两项之和；和网页"嗅探到AI浓度"是同一个值 |
| `labels_ratio` | 各类内容的字数占比：`"0"` 人工，`"1"` AI，`"2"` 疑似 AI |
| `segment_labels` | 片段列表：`text`、`label`（0/1/2）、`conf`（片段 AIGC 值）、`order`、`position` |
| `position` | `[起点, 长度]`，按字符计，不是 `[起点, 终点]` |
| `softmax_confidence` | 整体置信度，网页上不显示，只作参考 |
| `makers_models_usage.total_tokens` | 本次实际扣减的免费额度 |

朱雀按上下文判定片段：同一段文字单独检测和放在整章里检测，标签可能不同。所以每轮修改后都要整章复测，不要只测改过的段落。

### 脚本

只能通过 `creative_produce_run` 运行，`entry` 为 `story-zhuque`，`argv` 是脚本参数，`workdir` 是项目根目录：

```
zhuque_detect.py [--json] [--out 报告.json] [--target 0.5] [--max-chars 20000] <章节文件>
```

- 读取 UTF-8 文本（去掉 BOM，换行统一成 `\n`），整章提交，不修改章节文件。
- 按网页规则计字（空白分词，英文单词记 1，其余逐字计数），不足 350 字直接拒绝，不调用接口。
- 超过 `--max-chars` 的文件直接拒绝，避免误把整本书提交出去。
- `--out` 把 JSON 报告写到指定路径，并自动创建上级目录。

JSON 报告（`story-zhuque-detect/v1`）：

```json
{
  "schema": "story-zhuque-detect/v1",
  "ok": true,
  "file": "正文/第12章.md",
  "chars": 3120,
  "counted_chars": 3050,
  "request_id": "req_...",
  "ai_ratio": 0.7369,
  "ai_percent": 73.69,
  "verdict": "yellow",
  "verdict_text": "人工创作特征较弱",
  "target": 0.5,
  "pass": false,
  "labels_ratio": { "human": 0.2631, "ai": 0.4802, "suspected": 0.2567 },
  "softmax_confidence": 0.5552,
  "segments": [
    { "order": 1, "label": "ai", "conf": 0.9997, "start": 0, "length": 263, "lines": [1, 2], "excerpt": "开头 24 字……结尾 12 字" }
  ],
  "usage": { "model_tokens": 3120, "billed_tokens": 5200 }
}
```

- `verdict` 为 `green`、`yellow` 或 `red`，规则与网页一致：AI 浓度低于 50% 为绿，50% 到 100% 之间为黄，等于 100% 为红。
- `pass` 表示 `ai_ratio` 是否低于 `target`。
- 片段的 `lines` 是它在章节文件里的起止行号（1 起算，已跳过片段首尾的空行）。接口返回的位置和原文对不上时，脚本会按片段文字搜索；仍然找不到，`start`、`length`、`lines` 都是 null，只保留 `excerpt`。

失败时输出 `{"schema": "story-zhuque-detect/v1", "ok": false, "file": "...", "error": {"code": "...", "message": "..."}}`：

| 退出码 | `error.code` | 处理 |
|---|---|---|
| 2 | `file_not_found`、`file_unreadable`、`text_too_short`、`text_too_long`、`invalid_arguments`、`invalid_request`、`report_unwritable` | 修正输入或参数后再调用 |
| 3 | `missing_credential`、`auth_failed` | 请用户在「设置 > 插件 > 创意生产 > EdgeOne Makers」配置或更换密钥，或在启动 dsh 前 export `MAKERS_API_KEY`；不要重试，也不要在对话里索要密钥 |
| 4 | `rate_limited`、`service_error`、`network_error`、`invalid_response` | 稍等后最多重试一次；仍然失败就改用网页通道，并在报告里说明 |

退出码 0 表示达标，1 表示未达标，两者都是有效的检测结果。

## 网页通道（用户手动）

朱雀网页每次提交都会弹出腾讯验证码，需要真人完成。无头浏览器（包括 browser-cdp 使用的 Lightpanda）过不了这一步，而且 Lightpanda 连不上网页的检测服务。所以网页通道只能由用户在自己的浏览器里操作。不要尝试用 browser-cdp 自动提交，也不要绕过、屏蔽验证码或伪造验证结果。

请用户这样做：

1. 打开 https://matrix.tencent.com/ai-detect/ai_gen_txt ，选「文本」。
2. 点「清空」，粘贴整章正文（不少于 350 字），点「立即检测」，完成验证码。
3. 把以下内容发回来：
   - 「嗅探到AI浓度」的百分比，以及判定文字（例如"人工创作特征较弱"）；
   - 标红片段和标黄片段的文字（每段复制开头一两句即可）；
   - 页面底部的「模型更新时间」。

收到后按片段文字在章节里搜索定位，从 Phase 3 开始。每轮复测都要请用户重新提交整章。

网页额度：游客每天文本 3 次，登录后每天 20 次（在检测按钮上显示为「立即检测(今日剩余N次)」）。检测后点「准确」或「不准确」反馈可以获得额外次数，但反馈应当是用户自己的真实判断，不要为了多拿次数去建议用户随手点。次数用完时页面显示「今日次数已用完」，本轮就此停止，在报告里写明。
