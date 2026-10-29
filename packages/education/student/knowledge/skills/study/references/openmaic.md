# 生成 OpenMAIC 互动课

本机 OpenMAIC 已经在运行。这份说明只覆盖：拼 requirement、用 curl 生成、轮询、把课记到工作区、在对话里给出裸 URL、失败重试，以及课后摘要和巩固题。

不要做这些事：clone OpenMAIC、启动或重启它的容器、配置模型密钥、Live Demo、openclaw，以及把 `skills/openmaic` 或 `agent-runtime` 整包拷进学习工作区。不要把课堂嵌进侧栏 iframe。不要做静态导出播放器。

## 地址、访问码和 cookie

先 `study_status`。使用返回的 `openmaic.baseUrl`。家长在工作台保存的地址优先，否则是运行 DSH 的环境变量 `OPENMAIC_BASE`，都没有时是 `http://localhost:3000`。不要自己再猜端口。

访问码只在环境变量 `OPENMAIC_ACCESS_CODE` 非空时使用。先对同一 cookie jar 执行 `POST {base}/api/access-code/verify`，JSON 正文只有 `code`。验证失败就停止，并说明访问码被拒绝。不要把访问码、cookie 文件或 Authorization 头写进档案、`.study/openmaic-lessons.json`、命令回显或对话。

`web_fetch` 访问不了 localhost。生成、轮询、retry 和拉 stage 都用当前 shell 的 curl。Linux 和 macOS 用 bash；Windows 上该模式提供的是 PowerShell，用 `curl.exe`。每一次请求都带上同一个 cookie jar：`openmaic.cookiePath`（`.study/openmaic-cookies.txt`）。先 `mkdir -p .study`。拼 JSON 用 node 读环境变量，不依赖 jq。

轮询 URL、retry 和 stage 只打 `baseUrl` 的主机。相对路径拼到 base 上。绝对 URL 的协议和主机必须与 base 相同，否则停止并记一条失败，避免 cookie 被送到别的主机。

## 拼 requirement

1. 读 `study_status` 的 `recommendation` 和 `timeNotice`。把 `timeNotice` 原样告诉孩子；时长只提醒，不因此取消生成。
2. 家长或孩子指定了学习目标就用那个 `objectiveId`，否则用今日建议里的目标。用 `kind=curriculum` 或 `kind=elements` 取标题、定义和可考事实，不要把整册地图或课页塞进 requirement。若建议带 `unitName`，或学校进度能对上单元名（例如欢乐购物街），把这个单元名写进场景。
3. 在工作区根目录和 `.study/` 查找 `openmaic-requirement-*.md`。有多份时用修改时间最新的一份，把正文并进去。没有简报就只用目标、事实、兴趣标签和单元名。
4. `requirement` 写成一段中文：年级、科目、目标、两三条可考事实、`interests` 里的一个标签（优先 `interestFocus`，下一节课可以换）、已知的校内单元名、希望孩子在课上做什么。场景壳子见 `interest-hooks.md`。事实仍只核知识地图，不把兴趣写成知识点。`materialIds` 只有用户已经给出 OpenMAIC 材料 id 时才附上，不要编造。

## 生成和轮询

正文只有 `{ "requirement": "...", "materialIds": ["..."] }`，没有材料 id 时不要带 `materialIds`。下面是 bash 示例；PowerShell 用 `curl.exe`，把 `$BASE` 写成 `$env:BASE`，cookie 参数不变。

```sh
BASE='http://localhost:3000'   # 换成 study_status 的 openmaic.baseUrl
JAR='.study/openmaic-cookies.txt'
mkdir -p .study
# 仅当 OPENMAIC_ACCESS_CODE 非空时。node 用 UTF-8 写临时正文，不要 echo，用完即删。
node -e 'require("node:fs").writeFileSync(".study/openmaic-access-body.json", JSON.stringify({ code: process.env.OPENMAIC_ACCESS_CODE }))'
curl -sS -c "$JAR" -b "$JAR" -H 'content-type: application/json' \
  -d @.study/openmaic-access-body.json \
  "$BASE/api/access-code/verify"
node -e 'require("node:fs").rmSync(".study/openmaic-access-body.json", { force: true })'
node -e 'require("node:fs").writeFileSync(".study/openmaic-generate-body.json", JSON.stringify({ requirement: process.env.REQ }))'
curl -sS -D - -c "$JAR" -b "$JAR" -H 'content-type: application/json' \
  -d @.study/openmaic-generate-body.json \
  "$BASE/api/generate-classroom"
node -e 'require("node:fs").rmSync(".study/openmaic-generate-body.json", { force: true })'
```

`POST /api/generate-classroom` 返回 202。从 JSON 记下 `jobId` 和 `pollUrl`。先把一条 `status: generating` 的记录写入课表，再开始轮询。

轮询大约 60 秒一次，不要更密。bash 用 `sleep 60`，PowerShell 用 `Start-Sleep -Seconds 60`。用同一个 cookie jar `GET` pollUrl。最多 20 次。

把每一次 JSON 看成三种结果：

- 有 `result.classroomId`：成功。同时读取 `result.url`。`result.warning` 若存在，原样写入记录并告诉家长。
- 没有 `result.classroomId`，但是 HTTP 不是 2xx，或者 JSON 里有 `retryable` 或明确的错误信息：失败。`retryable` 为 true 时记下 `runId`。
- 其他 2xx：仍在生成。满 60 秒再问一次。

20 次后仍未结束：把这条记为失败，`error` 写「仍在生成，可稍后用同一 pollUrl 继续查询」，不要立刻再 POST requirement。

## 记课

课表是 `.study/openmaic-lessons.json`，不是 `.study/state.json`。不要用文件工具改 state.json。用下面的脚本按 `id` 合并一条记录，最多保留 40 条。把要写入的对象放进环境变量 `OPENMAIC_LESSON_JSON`，不要把访问码放进这个对象。

```sh
OPENMAIC_LESSON_JSON="$PAYLOAD" node --input-type=module <<'EOF'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const path = '.study/openmaic-lessons.json'
const incoming = JSON.parse(process.env.OPENMAIC_LESSON_JSON ?? '{}')
await mkdir('.study', { recursive: true })
let file = { format: 1, lessons: [] }
try { file = JSON.parse(await readFile(path, 'utf8')) } catch { /* a missing log starts empty */ }
if (!file || file.format !== 1 || !Array.isArray(file.lessons)) file = { format: 1, lessons: [] }
const now = new Date().toISOString()
const index = file.lessons.findIndex(item => item.id === incoming.id || (incoming.jobId && item.jobId === incoming.jobId))
const prior = index >= 0 ? file.lessons[index] : undefined
const next = { ...prior, ...incoming, id: prior?.id ?? incoming.id, createdAt: prior?.createdAt ?? incoming.createdAt ?? now, updatedAt: now }
if (index >= 0) file.lessons[index] = next
else file.lessons.unshift(next)
file.lessons = file.lessons.slice(0, 40)
await writeFile(path, `${JSON.stringify(file, null, 2)}\n`)
EOF
```

一条记录的形状：

| 字段 | 何时写 |
|---|---|
| `format` | 文件顶层，固定为 `1` |
| `id` | 新建时自定，例如 `om-` 加时间戳，只含字母、数字、下划线和连字符 |
| `status` | `generating`、`ready` 或 `failed` |
| `createdAt` / `updatedAt` | ISO 时间，以 `Z` 结尾 |
| `title` | 短标题，用学习目标的名字 |
| `requirement` | 发给生成接口的正文 |
| `subject` / `objectiveId` | 知道时写上 |
| `base` | 这次使用的 `openmaic.baseUrl` |
| `jobId` / `pollUrl` | 202 响应 |
| `runId` / `retryable` / `commandId` | 失败可重试，或 retry 返回了新的 commandId |
| `classroomId` / `url` / `warning` | 成功时 |
| `error` | 失败时的短说明 |
| `summary` | 课后摘要，见下一节 |

`url` 必须是 http 或 https，不能带账号密码。工作台只展示能通过这个形状的记录。

## 对话里怎么给链接

成功后在对话里先用一句孩子能懂的话说明课好了。下一行只放课堂 URL 原文，单独一行，前后不要加括号、反引号或 Markdown 链接。若有 `warning`，用另一句告诉家长。请家长用系统浏览器打开这一行。工作台的「在浏览器打开」做的是同一件事。

可以问孩子要不要记一段学习时间。要的话，该科已确认学校进度就 `start` 模式 `school`，否则用 `explore`。这只是软计时外壳：`timeNotice` 照原文转述，超时仍可上课，不要说系统会关掉页面。

## 失败后重试

只在记录 `status` 为 `failed`、`retryable` 为 true 且有 `runId` 时重试。`POST {base}/api/generation-runs/{runId}/retry`，cookie jar 与生成时相同，JSON 正文用 `{}`。不要再次提交 requirement。

响应里的 `commandId` 是新的，写回同一条记录。响应若带 `pollUrl` 或 `jobId`，改记后再按上一节轮询；否则继续轮询原来的 `pollUrl`。把 `status` 先改回 `generating`。

## 课后摘要和巩固题

孩子上完课后，用同一 cookie jar：

```sh
curl -sS -c "$JAR" -b "$JAR" "$BASE/api/stages/$CLASSROOM_ID"
```

从 JSON 里取大纲和场景，不要把整份 stage 贴进对话或课表。优先用字符串字段 `outline`。没有它时，从 `scenes` 数组取每场的 `title` 或 `name`，以及一句 `summary` 或 `description`，最多 12 场。写成记录上的 `summary`：

- `fetchedAt`：ISO 时间
- `outline`：大纲或各场标题连成的短文，不超过 2000 字
- `scenes`：`{ "title", "summary"? }` 列表

然后出 2 到 5 道巩固题。走现有出题和作答：对话里一次一题，`task` 带上这节课的 `objectiveId`；家长要纸上卷时用 `worksheet`，`kind` 写 `practice`，题量不超过 5。题目要能用摘要和该知识点的 `facts` 核对，不要照抄舞台动画里孩子没看到的句子，也不要另做播放器。出题细则仍以 `questions.md` 为准。
