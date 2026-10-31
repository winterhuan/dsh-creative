---
name: story-zhuque
description: "作者明确要求时，用腾讯 EdgeOne Makers 的朱雀文本接口检查一章正文。分数只作诊断，不改稿、不作为完成条件。普通写作、审稿和去 AI 味不要加载本技能。"
metadata: {"openclaw":{"source":"https://github.com/winterhuan/dsh-creative","credential":"MAKERS_API_KEY"}}
---

# story-zhuque：明确要求时的朱雀检测

只有作者明确说要朱雀检测、过朱雀或同义请求时才执行。普通写作、审稿、去 AI 味和润色不发送正文，也不要为了降低分数改剧情、人设、伏笔或字数。

## 凭据

写作插件的 `makersApiKeyEnv` 指出环境变量名，默认 `MAKERS_API_KEY`。变量未设置时说明未配置并停止。不要从设置文件、历史命令或其他文件里查找密钥，也不要把密钥写进参数、日志或正文。

## 怎么检测

在本技能目录执行，一次只查一个正文文件：

```text
node scripts/detect.mjs --file {正文文件} --out {书目录}/.story-zhuque/{章节}.json
```

脚本只从环境变量读密钥，向 `https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify` 发送段落模式请求。正文少于 350 个计数单位或超过默认 20000 字时脚本拒绝，不要拆开发送去绕过上限。

退出码：`0` 低于作者目标（默认 AI 比例 `0.5`），`1` 已检出但未低于目标，`2` 输入不合适，`3` 没有可用凭据，`4` 服务或网络失败。`1` 不是任务失败。空结果、超时和认证错误不是零分。

## 怎么报告

按 [结果解释](references/detect.md) 说明覆盖范围、`ai_percent`、`verdict_text` 和失败原因。报告只放在该书 `.story-zhuque/`，不写入 `追踪/`。正文变了之后，旧报告只对旧稿有效。

作者同时要求改稿时，改动交给 `story-deslop` 或对应写作技能，按原文问题处理；不要循环检测直到变绿。
