---
name: game-qa
description: "验证浏览器游戏：真实启动、渲染、输入、核心循环、结果与重开，并通过 game_qa 生成 Studio 可认证的证据。用于试玩验证、构建回归和检查游戏是否走通；不代替主观趣味判断。"
---
# 游戏质量验证

验证当前候选能否完成最小可玩闭环，不把自动化结果包装成趣味、平衡、权利或发布质量结论。

用原生 `read` 读取资源基目录下的 `references/qa-contract.md` 定判据，按
`references/test-design-method.md` 设计最少但有区分力的检查。非 Web 目标不受当前 Chrome 驱动覆盖，应报告限制，不制造替代平台 PASS。

产物语言由 `PRODUCT_BRIEF.md` 锁定；未锁定时跟随对话语言，不默认产出中文。

## 唯一必需合同

每个候选都必须用真实运行证据覆盖：`launch`、`render`、`input`、`coreLoop`、`outcome`、`restart`。
`targetFinish` 描述成色，不改变这组六项。`checks` 恰好只含六键；项目回归与诊断只能映射回其中
一项、写入 `suites` / evidence，或作为 limitation，不得生成第七道门。

这是一条自动化或代理可执行的运行验证，不要求真人试玩、主观评分或逐项人工批准。需要真人研究时
另立产品研究任务，不得把它变成当前候选 PASS 的隐藏前置条件。

## 执行

1. 从批准的 GAME_DESIGN 写 `qa/plan.json`；以 [qa-contract.md](references/qa-contract.md) 的固定字段和状态 hook 为准。
2. 调用 `game_qa`，project 为游戏项目目录（如 `game-adaptations/my-game`），使用当前 Session 工作目录。驱动负责 Chrome、预览 CSP、实际点击、截图、重启和签名记录，模型不得手写 PASS。
3. 读取 `qa/verification.json` 及其列出的 trace、截图和 strategy evidence。失败回到对应的产品、设计、美术或构建环节修复，再重跑；不放宽预期来消除失败。
4. 将生成的 `qa/blind-play-request.md` 交给独立子代理，不提供设计文档、代码、测试计划或策略结果。子代理在五分钟内只看实际界面试玩，保存提示、操作 transcript、截图和 `qa/blind-play.json`。先检查当前 Preset 是否提供所需子代理与浏览器；缺少时保留明确未运行的限制。
5. 向创作者展示策略差异与盲玩观察。机械六项通过不能代替趣味、平衡、身份沉浸或发布判断。
