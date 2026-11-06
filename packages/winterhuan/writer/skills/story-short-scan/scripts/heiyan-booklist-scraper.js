#!/usr/bin/env node
/**
 * 黑岩短篇书库列表采集脚本
 *
 * ⚠️ 前置条件（必须）：
 *   1. 已安装 Ego Lite（ego-browser 可用，见 browser-cdp skill）
 *   2. 在 Ego Lite 中手动登录 https://manage.zhangwenpindu.cn
 *      登录后会生成 Admin-Token cookie，页面内请求需要它调用后端 API
 *      未登录 → 脚本把浏览器交接给用户（handOff），登录后重跑
 *
 * 采集策略：Admin-Token 只在页面上下文内读取和使用，不返回本机进程；
 * 页面内调用 ms.zhangwenpindu.cn 后端 API，只返回结构化 JSON 业务数据
 * （书名、作者、字数、分类、标签等）。
 *
 * 用法：
 *   node heiyan-booklist-scraper.js --pages 5              # 采集前5页（每页20条）
 *   node heiyan-booklist-scraper.js --pages 3 --channel male   # 仅男频
 *   node heiyan-booklist-scraper.js --pages 2 --detail         # 含逐本详情（标签等）
 */

const fs = require("fs");
const path = require("path");
const { createSession, openRunStore, sleep, safeStr, getArg, localDateStamp, runCli } = require("../../browser-cdp/scripts/ego-session.cjs");

const BOOKLIST_URL = "https://manage.zhangwenpindu.cn/books/booklist";
const API_BASE = "https://ms.zhangwenpindu.cn";
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// API 调用（Token 只在页面内读取和使用，绝不返回本机进程）
// ---------------------------------------------------------------------------

/** 连通性自检：区分浏览器未连 vs 已连但未登录 */
function probePage(session) {
  return session.evalJSON("JSON.stringify({host:location.host})");
}

/** 登录状态自检：只返回布尔值，不返回 Token 本身 */
function checkLogin(session) {
  const js =
    "JSON.stringify((()=>{" +
    "var m=document.cookie.match(/Admin-Token=([^;]+)/);" +
    "return {loggedIn:!!m}" +
    "})())";
  const r = session.evalJSON(js);
  return !!(r && r.loggedIn);
}

/** 页面内读取 Token 并调用后端 API 获取书籍列表，只返回业务 JSON */
function fetchBookList(session, pageNum) {
  const js =
    "(()=>{" +
    "var m=document.cookie.match(/Admin-Token=([^;]+)/);" +
    "if(!m)return Promise.resolve(JSON.stringify({code:401,msg:'no-token'}));" +
    "return fetch(" + safeStr(API_BASE + "/manage/book/list") + "," +
    "{method:'POST'," +
    "headers:{" +
    "'Content-Type':'application/x-www-form-urlencoded'," +
    "'Authorization':'Bearer '+m[1]" +
    "}," +
    "body:new URLSearchParams({pageNum:" + safeStr(pageNum) + ",pageSize:" + safeStr(PAGE_SIZE) + ",language:'zh_TW'})" +
    "}).then(function(r){return r.status===401?{code:401}:r.json()}).then(function(j){return JSON.stringify(j)})" +
    "})()";
  return session.evalJSON(js);
}

/** 页面内读取 Token 并获取书籍详情（标签等），只返回业务 JSON */
function fetchBookDetail(session, bookId) {
  const js =
    "(()=>{" +
    "var m=document.cookie.match(/Admin-Token=([^;]+)/);" +
    "if(!m)return Promise.resolve(JSON.stringify({code:401,msg:'no-token'}));" +
    "return fetch(" + safeStr(API_BASE + "/manage/book/" + encodeURIComponent(String(bookId))) + "," +
    "{headers:{'Authorization':'Bearer '+m[1]}}" +
    ").then(function(r){return r.status===401?{code:401}:r.json()}).then(function(j){return JSON.stringify(j)})" +
    "})()";
  return session.evalJSON(js);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const OUTDIR = getArg(args, "--outdir") || ".";
const PAGES = parseInt(getArg(args, "--pages") || "5", 10);
const CHANNEL = getArg(args, "--channel") || "all";
const DETAIL = args.includes("--detail");
// --space <id>：用户在交接的 Space 里登录后，带 Space ID 重跑续接
const SPACE_ID = parseInt(getArg(args, "--space") || "", 10);
// --resume <runId>：断点续采；参数与解析器版本必须与首次运行一致
const RESUME_RUN = getArg(args, "--resume");
// 解析器版本：改动提取逻辑时递增，使旧检查点失效而不是混入两版结果
const PARSER_REVISION = "1";

/**
 * 字数格式化：手写千分位，不能用 toLocaleString()。
 * 后者按宿主 ICU locale 取分隔符，de_* 会写成「123.456字」（读起来像 123 字），
 * fr_* 用 U+202F、en-IN 会分成「1,23,456」——同一份报告在不同机器上数字不一样。
 * 兼容接口把 words 返回成字符串的情况。
 */
function fmtWords(words) {
  const n =
    typeof words === "number"
      ? Math.trunc(words)
      : parseInt(String(words == null ? "" : words).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "字";
}

function outputFilename(channel, date) {
  if (!["all", "male", "female"].includes(channel)) {
    throw new Error(`未知 --channel: ${channel}（支持 male/female/all）`);
  }
  return `黑岩书库列表_${channel}_${date}.md`;
}

/**
 * 文件头「数据质量」：书库没有热度字段，列表模式只有书单；--detail 按详情取到几成定级。
 * 取值要在 aggregate-rank.js 的 QUALITY_WORDS 里，聚合「采集情况」才会翻成白话。
 */
function dataQuality(books, detail) {
  if (!detail) return "[仅列表-无核心指标]";
  const got = books.filter((b) => b && b.detailOk).length;
  if (got === books.length) return "[OK]";
  return got / books.length < 0.5 ? "[详情解析异常/登录态缺失]" : "[部分详情缺失]";
}

function buildAndSave(allBooks, total, filtered, filepath, detail = DETAIL, reasons = []) {
  const now = new Date().toISOString();
  const maleBooks = filtered.filter((b) => b.classifyStr === "男频");
  const femaleBooks = filtered.filter((b) => b.classifyStr === "女频");
  const otherBooks = filtered.filter(
    (b) => b.classifyStr !== "男频" && b.classifyStr !== "女频"
  );

  const groups = [
    { label: "男频", books: maleBooks },
    { label: "女频", books: femaleBooks },
  ];
  if (otherBooks.length) {
    groups.push({ label: "其他", books: otherBooks });
  }

  const lines = [
    `# 黑岩 · 书库列表`,
    "",
    `- 来源：${BOOKLIST_URL}`,
    `- 抓取时间：${now}`,
    `- 总条目：${total}`,
    `- 已采集：${filtered.length} 条（${Math.ceil(allBooks.length / PAGE_SIZE)} 页）`,
    detail ? "- 含详情（标签、简介）" : "- 列表模式（加 --detail 获取标签和简介）",
    `- 数据质量：${dataQuality(filtered, detail)}`,
    ...reasons.map((reason) => `- 采集未完成：${reason}`),
    "",
    "---",
    "",
  ];

  for (const g of groups) {
    if (!g.books.length) continue;
    lines.push(`## ${g.label}短篇 — ${g.books.length} 本`, "");

    for (let i = 0; i < g.books.length; i++) {
      try {
        const b = g.books[i];
        lines.push(`### #${i + 1} ${b.name}`);
        // 聚合按位置认「作者 · 题材」：缺作者时用占位，否则题材会被当成作者
        const meta = [
          b.userName || "佚名",
          // 分别入数组再拼：预先 classifyStr + "/" + typeDesc 会把缺字段拼成
          // 「undefined/undefined」这种真值字符串，filter(Boolean) 拦不住，直接写进报告
          [b.classifyStr, b.typeDesc].filter(Boolean).join("/"),
          fmtWords(b.words),
          b.price ? b.price + "钻" : "",
          b.open ? "公开" : "未公开",
        ].filter(Boolean).join(" · ");
        if (meta) lines.push(`*${meta}*`);

        if (b.createTime) lines.push(`**创建：** ${b.createTime}`);
        if (b.updateTime) lines.push(`**更新：** ${b.updateTime}`);

        if (b.tags && b.tags.length) {
          lines.push(`**标签：** ${b.tags.join("、")}`);
        }

        if (b.description) {
          lines.push("");
          lines.push(`> ${b.description.substring(0, 200)}${b.description.length > 200 ? "..." : ""}`);
        }

        lines.push("");
      } catch (bookErr) {
        console.error(`[heiyan] ${g.label} 第${i + 1}条处理出错: ${bookErr.message}`);
        lines.push("");
      }
    }

    lines.push("---", "");
  }

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, lines.join("\n"), "utf-8");
  console.log(`  ✓ 已保存: ${filepath}`);
}

/** Browser/session and wait injection keeps CLI regression tests entirely local. */
function main(options = {}) {
  const pages = options.pages === undefined ? PAGES : options.pages;
  const channel = options.channel || CHANNEL;
  const detail = options.detail === undefined ? DETAIL : options.detail;
  const wait = options.sleep || sleep;
  const filepath = path.join(options.outdir || OUTDIR, outputFilename(channel, localDateStamp()));
  const session = options.session || (Number.isInteger(SPACE_ID) && SPACE_ID > 0
    ? createSession({ spaceName: "writer heiyan scan", spaceId: SPACE_ID })
    : createSession({ spaceName: "writer heiyan scan" }));
  const reasons = [];
  let clean = false;
  let stage = "初始化或登录检查";
  const fail = (reason) => {
    reasons.push(reason);
    console.error(`[heiyan] ${reason}`);
  };
  const handOffLogin = () => {
    // Do not attempt another browser operation after an uncertain transport stop.
    if (session.uncertain) {
      fail("认证失败（401）；页面状态不明，停止并保留现场，请人工核实后续接");
      return;
    }
    try {
      session.handOff();
      console.error(`[heiyan] 登录失效，已交接 Space ${session.spaceId}；登录后使用 --space ${session.spaceId}，其余参数及 --resume 保持不变。`);
    } catch {
      session.uncertain = true;
      fail("登录交接失败；已停止并保留现场，请人工核实后续接");
    }
  };
  try {
    console.log(`\n→ 采集 黑岩书库列表（${pages} 页）...`);
    if (session.spaceId != null) session.takeOver();
    session.open(BOOKLIST_URL);
    wait(3000);
    if (!probePage(session)) {
      fail("浏览器无响应，已停止并保留现场");
      return { planned: 1, written: 0, failed: 1, partial: false, partialReasons: reasons };
    }
    if (!checkLogin(session)) {
      fail("未检测到登录态（Admin-Token 不存在）");
      handOffLogin();
      return { planned: 1, written: 0, failed: 1, partial: false, partialReasons: reasons };
    }
    const run = options.runStore || openRunStore({
      resume: options.resume === undefined ? RESUME_RUN : options.resume,
      params: { channel, pages, detail },
      parserRevision: PARSER_REVISION,
    });
    console.log(`  运行 ${run.runId}（检查点 ${run.dir}；续采加 --resume ${run.runId}）`);
    const allBooks = [];
    let total = 0;
    for (let p = 1; p <= pages; p++) {
      stage = `第${p}页采集`;
      try {
        const cacheKey = `page-${p}`;
        const cached = run.get(cacheKey);
        if (cached) {
          if (!Array.isArray(cached.rows)) throw new Error("invalid checkpoint");
          if (p === 1) total = cached.total;
          allBooks.push(...cached.rows);
          continue;
        }
        wait(800);
        const resp = fetchBookList(session, p);
        if (!resp) {
          fail(`第${p}页接口无响应，已停止`);
          break;
        }
        if (resp.code === 401 || resp.code === "401") {
          fail(`第${p}页认证失败（401），已停止`);
          handOffLogin();
          break;
        }
        const rows = resp?.data?.rows;
        if (!Array.isArray(rows) || !rows.length) {
          if (resp.code != null && resp.code !== 0 && resp.code !== 200) {
            fail(`第${p}页接口返回错误，已停止`);
          } else if (!Array.isArray(rows)) {
            fail(`第${p}页列表结构异常，已停止`);
          } else {
            console.log(`  第${p}页无数据，正常结束`);
          }
          break;
        }
        if (p === 1) total = parseInt(resp.data.total) || 0;
        run.commit(cacheKey, { total, rows });
        allBooks.push(...rows);
        console.log(`  第${p}页: ${rows.length} 条（累计 ${allBooks.length}）`);
      } catch {
        // Remote diagnostics can contain headers/cookies; never echo their text.
        fail(`${stage}异常，已停止并保留现场`);
        break;
      }
    }
    if (!allBooks.length) {
      if (!reasons.length) fail("未采集到任何书目");
      return { planned: 1, written: 0, failed: 1, partial: false, partialReasons: reasons };
    }
    stage = "报告生成";
    const written = finishReport(session, allBooks, total, filepath, { channel, detail, wait, reasons, handOffLogin });
    if (!written) fail("报告质量校验失败，未覆盖已有报告");
    clean = written > 0 && reasons.length === 0;
    return { planned: 1, written, failed: clean ? 0 : 1, partial: written > 0 && !clean, partialReasons: reasons };
  } catch {
    fail(`${stage}失败，已停止并保留现场`);
    return { planned: 1, written: 0, failed: 1, partial: false, partialReasons: reasons };
  } finally {
    if (!clean) session.uncertain = true;
    session.endAndReport("heiyan");
  }
}

/** 质量门、频道筛选、可选详情与写盘。返回写出文件数。 */
function finishReport(session, allBooks, total, filepath, options = {}) {
  const channel = options.channel || CHANNEL;
  const detailMode = options.detail === undefined ? DETAIL : options.detail;
  const wait = options.wait || sleep;
  const reasons = options.reasons || [];

  // 质量门：核心字段命中率。API 改字段名时会整片 undefined，必须拦截而非静默写盘。
  // classifyStr 同样要查：它决定男频/女频分组和 --channel 筛选，字段一改全部书都掉进
  // 「其他」、--channel male 直接筛成 0 条，写出一份「已采集：0 条」的假成功报告。
  const CORE_FIELDS = [
    { key: "name", label: "书名" },
    { key: "classifyStr", label: "频道(classifyStr)" },
  ];
  for (const f of CORE_FIELDS) {
    const hit = allBooks.filter((b) => b && b[f.key]).length;
    if (hit / allBooks.length < 0.5) {
      console.error(
        `[heiyan] 采集失败：${allBooks.length} 条里仅 ${hit} 条有${f.label}，疑似接口字段变动，已放弃写盘。`
      );
      return 0;
    }
  }

  // 频道筛选
  let filtered = allBooks;
  if (channel === "male" || channel === "female") {
    const want = channel === "male" ? "男频" : "女频";
    filtered = allBooks.filter((b) => b.classifyStr === want);
    if (!filtered.length) {
      // 筛成 0 条不能算成功：把实际 classifyStr 分布打出来，区分「接口字段变了」
      // 和「这个频道确实没作品」，而不是写一份看不出差别的空报告
      const seen = {};
      for (const b of allBooks) {
        const k = b && b.classifyStr ? b.classifyStr : "(空)";
        seen[k] = (seen[k] || 0) + 1;
      }
      const dist = Object.keys(seen).map((k) => `${k}×${seen[k]}`).join("、");
      console.error(
        `[heiyan] 采集失败：--channel ${channel} 筛选后 0 条（${allBooks.length} 条的 classifyStr 取值：${dist}），已放弃写盘。`
      );
      console.error(`  → 若确实没有${want}作品，去掉 --channel 重跑即可拿到全部书目。`);
      return 0;
    }
  }

  // 可选：逐本获取详情（标签等）
  if (detailMode && filtered.length && reasons.length === 0) {
    console.log(`  获取 ${filtered.length} 本详情...`);
    for (let i = 0; i < filtered.length; i++) {
      try {
        wait(500);
        const detail = fetchBookDetail(session, filtered[i].id);
        if (detail?.code === 401 || detail?.code === "401") {
          reasons.push(`第${i + 1}本详情认证失败（401），已停止详情采集`);
          if (options.handOffLogin) options.handOffLogin();
          break;
        }
        if (detail?.data) {
          filtered[i].tags = detail.data.tags || [];
          filtered[i].description = detail.data.description || "";
          filtered[i].chapterCount = detail.data.chapterCount || 0;
          filtered[i].detailOk = true;
        } else {
          reasons.push(`第${i + 1}本详情无有效数据`);
        }
        if ((i + 1) % 10 === 0) {
          console.log(`    已获取 ${i + 1}/${filtered.length}`);
        }
      } catch (detailErr) {
        reasons.push(`第${i + 1}本详情获取异常，已停止详情采集`);
        break;
      }
    }
    console.log(reasons.length ? "  详情采集未完成，保留已有数据" : "  ✓ 详情获取完成");
  }

  // A partial rerun must not replace a previously complete report.
  const reportPath = reasons.length ? filepath.replace(/\.md$/, ".partial.md") : filepath;
  buildAndSave(allBooks, total, filtered, reportPath, detailMode, reasons);
  return 1;
}

function cliMain(options) {
  const outcome = main(options);
  if (!outcome.written) throw new Error(outcome.partialReasons.join("；") || "未写出报告");
  return outcome;
}

if (require.main === module) {
  runCli(cliMain, "黑岩采集");
}

module.exports = {
  main,
  cliMain,
  probePage,
  checkLogin,
  fetchBookList,
  fetchBookDetail,
  fmtWords,
  outputFilename,
  dataQuality,
  buildAndSave,
};
