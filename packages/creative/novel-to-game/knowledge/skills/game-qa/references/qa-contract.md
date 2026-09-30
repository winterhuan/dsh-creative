# Chrome QA evidence

`game_qa`运行随 Skill 分发的 Chrome CDP 驱动，参数 `project: "game-adaptations/<project>"`，使用 Session 工作目录。需要 Node 22+ 和本地 Chrome；非默认安装通过 `CHROME_PATH` 指定。Lightpanda 不提供 Canvas/WebGL 验收证据。

`qa/plan.json` 从批准的 GAME_DESIGN 固定输入、seed、最低回合数和允许结局，不得根据失败输出修改预期：

```json
{"seed":1,"minTurns":3,"inputs":[{"selector":"[data-action=study]"},{"selector":"[data-action=study]"},{"selector":"[data-action=study]"}],"outcomes":["discovery","exhausted","missed"],"restartSelector":"[data-action=restart]"}
```

`outcomes[0]` 是策略比较的成功目标。每个点击必须命中可见、可用的控件。游戏提供 `window.__GAME_QA__`：`snapshot()` 返回可 JSON 序列化的 `{state:{seed,turn,phase,outcome,...},events:[...]}`；`reset(seed)` 恢复初态；`actions()` 返回 `{id,value}` 数组；`act(id)` 执行规则动作。界面输入与策略执行必须共用同一规则函数。

驱动在与 Studio 相同的 CSP 和 Session 前缀下服务实际 build，写入六项 `checks`：launch、render、input、coreLoop、outcome、restart。它保留前后截图、每次输入与状态、错误、命令和退出码，并为证据及构建文件记录 SHA-256。缺失控件、CSP 错误、不改变画面、未达设计结果或重启未复原均不能通过。

`qa/verification.json` 由脚本写入，包含 `schema:2`、`driver`、`status`、`checks`、`completeRun`、`suites`、`evidence`、`buildFiles`、`limitations` 和宿主签名。Host 检查签名、六项与总状态的一致性、工作区路径及文件哈希。手写记录、修改过的记录、缺失证据及改变后的构建不能显示通过；宿主重启后需重跑以获取新签名。直接用 shell 跑脚本可诊断，但不产生宿主认可的签名。

每次还产生五个 seed 下 default、greedy、random 的策略记录、胜率、分歧终态和未观察到的结局。样本不能证明一个结局不可达，也不能证明趣味。把 `qa/blind-play-request.md` 交给独立子代理，限制五分钟且不提供设计、代码或 QA 计划；保存实际提示、操作记录、截图和 `qa/blind-play.json`。若当前 Preset 无子代理或图形浏览器，明确记录未运行，不伪造试玩反馈。策略和盲玩都是创作者阅读的设计证据，不新增第七项机械门禁。
