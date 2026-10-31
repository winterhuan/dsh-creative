---
name: game-build
description: "实现已批准的游戏设计，或构建用于验证具体风险的白盒。交付目标运行时可运行的候选及验证入口；最终认证 QA 由 game-qa 独立执行。"
---
# 游戏构建

先核对用户要求、产品运行时与已有代码。按 `references/workflow.md` 实现本次范围；仅解决一个设计风险时采用白盒，正式候选实现已批准玩法和必要视觉方向。没有明确风险无需先重复做一套白盒。

读取 `references/build-brief-contract.md` 与 `references/playable-model-contract.md` 中适用部分，压缩成 `build/BUILD_BRIEF.md`。参考路径相对 DSH 资源基目录，用原生 `read` 按需读取。

## 执行边界

- 缺少影响实现的设计决定时交 `game-design` 裁定；不为缺文件名停工，也不在实现中静默重选玩法或美术。
- 按已批准平台与运行时构建，区分 `targetRuntime`、`testedRuntime` 和未覆盖项；工具链缺失时报告，不自行换成网页。
- Web 新项目只有交互语法适配时才运行 `templates/create_game.py <game-root> --template narrative|turn-based|canvas`；已有项目复用代码，自定义或非 Web 项目使用合适工具链。
- 首先实现真实输入、规则提交、状态反馈、结果与重开。生成模型只能提出候选动作或表达；规则器拥有状态和事件，固定版本、seed 与输入能复现相关结果。
- whitebox 仅做当前风险的开发检查与 smoke，不生成或覆盖 `qa/verification.json`。production 准备实际候选与验证入口，开发检查不替代最终 QA。
- Web 入口是 `build/app/index.html`，资源使用 `./` 相对路径。Studio 禁止外部脚本、字体和网络；不能依赖 CDN、根 `/assets` 或 `file://`。

只在采用语音或动态媒体时分别读取 `references/tts-production-contract.md`、`references/generative-media-pipeline.md`，遵守实际工具和外发、费用权限。无外部媒体时可用本地 SVG、CSS、Canvas 与合成音效实现批准方向，不把占位物冒充已交付资产。

交付真实运行方式、候选和限制。Web production 交 `game-qa` 验证六项玩家效果并写认证记录；构建者不预写 PASS。当前认证驱动只支持 Chrome，非 Web 交付保留目标验证缺口，不制造浏览器认证结果。
