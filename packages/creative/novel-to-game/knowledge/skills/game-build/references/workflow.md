# 游戏构建执行

保护已批准的体验边界；正式生产时再保护已批准的美术边界。驱动实现模型完成真实可玩的候选，不在
构建阶段重新做概念、关卡或美术方向。

读取 [build-brief-contract.md](build-brief-contract.md) 与
[playable-model-contract.md](playable-model-contract.md)。白盒需要已明确的设计问题与规则；
完整候选还需要适用的视觉方向，优先读取 `GAME_DESIGN.md` 和 `ART_DIRECTION.md`。缺必要决定时交 `game-design` 裁定，不为缺文件名停工或在 BUILD_BRIEF 就地发明。

产物语言由 `PRODUCT_BRIEF.md` 锁定；未锁定时跟随对话语言，不默认产出中文。

## 目标与自由

按 PRODUCT_BRIEF 锁定的平台、生产引擎、目标运行时、显示/输入、范围、分级和联网边界交付。
目标工具链不可用时不得自动改做网页；只有 brief 已批准替代运行时才可使用，并分开记录
`targetRuntime`、`testedRuntime` 与未覆盖项。

正式生产继承批准的 `ART_DIRECTION.md`，包括明度、时代与媒介、目标图及资产降级边界。生产状态与实际界面验证按 [构建说明契约](build-brief-contract.md) 记录；不在构建阶段重选方向。

BUILD_BRIEF 只压缩产品边界、必须保真的体验事实、运行方式与完成证据，实现细节交给实现模型。

先声明 `buildStage: whitebox|production` 与 `buildPath: template|custom`。已有交互语法只有在能保留原作
独有动作、代价和世界回应时才采用；实时手感、空间、视线、物理或模板覆盖不了的核心动词走 custom。
白盒也必须选择能验证最大风险的形态，不能把所有项目降成文游。

当前会话能编码时直接实现；外部模型不可用时只交付构建说明，不声称游戏已生成。不要发送与原型
无关的完整受版权保护原文。

## 按能力读取可选合同

- 语音策略不是 `none` 时读取 [tts-production-contract.md](tts-production-contract.md)。TTS
  优先构建期生成成本地资产；运行时远程合成须在 brief 批准，密钥只留受信服务端。
- 实际采用动态媒体时读取 [generative-media-pipeline.md](generative-media-pipeline.md)。已有批准
  参考图时以图约束；工具与模型按当前环境选择，不写成跨项目默认。

## 共同构建循环

1. 先实现一个最小但完整的核心循环：启动、真实输入、状态变化、结果和重开。范围不足时修范围，
   不先堆审计材料。
2. 先集中实现最小状态面与规则裁决器，再接表现层。模型可解释自由输入、提出候选动作或根据已提交结果
   写对白；只有规则器能提交资源、位置、知识、承诺、物件归属、胜负与事件日志。
   设计含 `signature_command` 时，先逐字继承 `id / label / intents / slots / validators / commit`，管线固定为
   “表述 → 有版本的候选结构 → schema/前置/知识/承诺验证
   → 执行阻力 → 确定性提交 → 叙述”；含混、冲突或越界候选返回澄清/拒绝且不提交，不能让关键词命中
   或模型 `effects` 直接改状态。
3. 固定内容/规则/存档版本、初态、seed 与输入序列；事件日志记录 action、观察者和前后状态摘要。专属
   命令还记录解析器版本、规范化候选、验证结果、执行轨迹和到期事项；回放消费已记录候选，不重新调用
   在线模型。试玩反馈定位到节点，局部 patch 后重放失败路径和相邻反例，不让未选分支进入历史。
4. 回写实际工具链、install/build/start 命令和版本；未知值写 `NOT_AVAILABLE: 原因`，不猜。

`whitebox` 到此只运行最窄的模型/回放检查与启动 smoke，输出结构化观察并交回 design owner；不调用
`game-qa`，不写或覆盖 `qa/verification.json`，也不把白盒通过冒充生产候选完成。设计修订后重放受影响
路径，直到最大风险已被实际暴露或当前方向被否决。

`production` 继续：

5. 提供一条权威验证命令和最小可观察状态，使 `game-qa` 能一次走完
   `clean start → 核心动作 → 设计结果 → restart`；构建阶段不预写 QA 结论或重复跑完整验收。
6. 运行最窄的开发检查与启动 smoke，修复构建失败、阻断日志、资源失败和崩溃；替代运行时未覆盖的
   目标平台输入、性能、打包或设备项写入 limitation。
7. 达到 brief 的 `targetFinish`；更高完成度只处理已批准的焦点资产和招牌时刻，不制造与可玩闭环
   无关的发布审计。
8. 浏览器候选交 `game-qa` 运行权威验证并写最终事实；非 Web 目标明确记录当前认证驱动未覆盖，不能用浏览器结果替代。时间、预算或生成调用用尽只会留下
   FAIL/NOT_RUN，不会生成 PASS。

连续 3D、语音、生成媒体、多语言与无障碍仅在实际采用时增加项目自己的回归检查。必需异步资产
加载或解码失败不得静默换灰盒仍宣称通过；可继续的 fallback 条件见 build-brief-contract.md。

## 输出

生成 `build/BUILD_BRIEF.md` 与实际候选；production 还生成权威验证入口。构建不生成最终 QA 结论。
截图、录制与 raw trace 只保留调试所需的最小集合；`game-qa` 是 production 完整路径与
`qa/verification.json` 的唯一 owner。

## 随包起步与 Studio 验证

Web 新项目只有交互语法适合时才运行资源根目录的 `templates/create_game.py <game-root> --template narrative|turn-based|canvas`；自定义或非 Web 项目不运行这个模板。三个无依赖起点共用可替换的 `rules.js`，已有状态机、事件日志、确定性 seed、保存/读取、重开和 `window.__GAME_QA__`，生成的 `qa/plan.json` 只是模板用例；改编后按批准设计更新预期。

Studio 从 Session 前缀下的 `build/app/index.html` 服务页面。资源必须用 `./` 相对路径；禁止外部脚本、字体和网络请求，不能依赖根目录 `/assets`、CDN 或 `file://`。本地检查后必须通过 game-qa 在同一预览策略下重跑。

没有已授权付费资产入口时，美术方案采用可交付的程序绘制标准：把美术方向中的主色、形状、人物/场景识别锚点落实到随包 SVG、CSS 或 Canvas；音效使用本地 Web Audio 合成并提供静音控件。只声明实际实现的素材与效果，不承诺不存在的图片或语音。无需外部媒体不等于可以省略场景、层次、交互反馈和视觉身份。
