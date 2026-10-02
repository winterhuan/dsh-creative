---
description: "在 DSH 模型页配置自定义模型的思考级别和提供方重试次数。"
kind: "package-bundle"
---

# @winterhuan/dsh-client-ui-settings-model-options

[English](README.md) | 中文

## Summary

配置自定义模型支持的思考级别，以及请求失败后的重试次数。此可选组合包在模型设置页的每个已保存提供方中增加控件。会话的思考级别仍在聊天模型选择器中选择。重试次数适用于同一提供方下的所有模型。

## Table of Contents

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 安装

构建本仓库后，将本地组合包安装到已有的 DSH web profile。将 `model-options` 替换为你的 profile 名称。DSH 依赖固定为 `0.2.0-rc.2`；本包可独立安装，Creative 不包含本包。

```sh
dsh plugin --profile model-options add /Users/winter/dsh-creative/packages/client/ui-settings-model-options
```

安装后重启 DSH 并刷新浏览器。打开“设置 → 模型 → 已保存的提供方 → 思考与重试”。新建的自定义提供方需要先保存，才能显示这些控件。

### 思考能力

选择模型后，可以继承配置或模型目录、声明不支持思考，或选择支持的级别。可选级别为关闭、最低、低、中、高、超高和最高。自定义声明至少需要一个“关闭”以外的级别；这不表示所有提供方都接受所有级别。

模型列表显示各模型的配置摘要，并标记尚未保存的修改。需要复用配置时，点击“应用到其他模型”，搜索并勾选同一提供方下的目标模型，核对级别和请求参数值。“全选搜索结果”仅作用于当前搜索结果，并保留筛选范围外的选择。应用会将完整配置复制到所选模型的草稿，点击“保存”后统一生效。取消选择会保留之前的草稿。复制继承设置时，各目标模型分别恢复自己的继承配置或模型目录设置。

展开参数映射可编辑请求参数值。“关闭”留空表示省略参数；填写 `none` 则发送该值。其他已选级别均需填写提供方 API 接受的非空值。能力声明不会检测接口支持情况，也不会更改接口协议。在原生聊天模型选择器中选择当前会话的思考级别。

### 重试次数

填写首次请求失败后额外重试的次数：`0` 表示不重试，`3` 表示此策略下最多尝试四次。默认重试五次。已有的不限次数策略会保留，直到输入次数或恢复继承的次数。恢复操作会还原继承的策略模式和次数，并保留重试错误分类及退避设置。

提供方策略由 DSH 的 `llm-retry` 插件执行，web profile 已包含它。它重试符合策略的失败模型步骤，并支持取消；直接调用 LLM 流接口不会因这些控件获得重试。执行规则见[重试执行器](../../../upstream/packages/llm/llm-retry/README.md)。

### 保存与恢复

点击“保存”前，修改仅为草稿。切换模型会保留各自的草稿；离开或折叠编辑器会丢弃草稿。保存被拒绝时保留草稿并报告失败。若设置已在其他位置更改，请放弃草稿，并基于刷新后的值重新编辑保存。只读设置会禁用编辑。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[组合补丁](cordis.patch.yml)安装一个浏览器插件。它为 `llm-pi-ai` 和 `llm-deepseek` 注册已有的 `settings.models.provider-card` 插槽；仅 pi-ai 提供模型思考元数据。[浏览器入口](src/client/index.ts)绑定共享设置镜像、原生模型目录和应用级保存提示。Host 入口不注册设置命名空间或请求执行器。

[草稿操作](src/client/options.ts)通过现有数组元素寻址自定义模型，通过 `modelOverrides` 寻址内置模型。每次保存携带首次编辑或打开批量预览时的版本号，仅修改所选字段。更改内置模型不会复制整个目录，也不会重写凭据、重试退避或错误分类列表。适配器验证保存的设置，并向已有聊天选择器发布实时能力。

本包不拥有独立可观测的 Host 状态，因此不提供运行时不变量安装器。测试覆盖字段编辑、运行时能力报告、只读控件、草稿保留、版本冲突和插槽释放。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [仓库构建与浏览器验证](../../../HANDOFF.md)
- [pi-ai 适配器配置](../../../upstream/packages/llm/llm-pi-ai/README.md)
- [模型页扩展插槽](../../../upstream/packages/client/ui-settings-models/src/client/slot-contract.ts)

-----

<a id="model-experience"></a>
## Model Experience

### 请求设置

#### What the model sees

界面不增加提示词或工具。提供方适配器按 `reasoningEfforts` 映射发送聊天中选择的思考级别；重试执行器重新执行符合策略的失败步骤。

#### Token effect

控件不增加提示词 token。思考可能消耗推理 token，每次重试也可能按提供方规则重复计算输入 token 费用。

#### KV Cache effect

控件不修改会话历史。切换思考级别和重复请求能否复用缓存取决于提供方。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- 固定版本的运行时不提供按模型配置的默认思考级别或重试策略。扩展不能编辑尚未保存的提供方，也不能通过模型发现推断思考能力。第三方适配器需要自行注册提供方卡片。协议兼容设置仍在提供方配置中维护。

<a id="dev-note"></a>
### Dev Note

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
