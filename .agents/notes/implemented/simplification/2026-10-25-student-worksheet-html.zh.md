# Agent Note: 学生练习单改为网页渲染与浏览器打印

Status: implemented

[English](2026-10-25-student-worksheet-html.md) | 中文

## Problem

练习单的 23 种题图各写了两套几何：Host 端 `src/worksheet.ts` 用 pdfkit 手工算坐标画 PDF（693 行），客户端 `src/client/figure-view.tsx` 用 SVG 画屏幕题图（324 行）。同一图形的两份实现只能靠人工保持一致，2026-10-17 的重叠圈修复就只改了 PDF 端。打印链路也只覆盖非 Windows 宿主：预览要开独立 PDF 页，确认后 Host 调 `lp`，Windows 直接 501。随包还要发布 17 MB 的 NotoSansSC 字体和 pdfkit 依赖。

## Decision

练习单改由客户端渲染：新增 `src/client/worksheet-view.tsx`，复用屏上题图的 `FigureView` 组件渲染整张卷（标题、编号、姓名日期行、题目、题图、一行/三行/方框作答区），图形几何只剩 SVG 一套。错题本里的「预览与打印」按钮在 body 级 portal 中打开预览对话框，`window.print()` 触发浏览器打印对话框，`@media print` 只保留试卷内容、按 A4 分页且每题不跨页；家长在对话框里选打印机或「存储为 PDF」，这一步本身就是确认。

Host 删除 `/student/worksheet.pdf` 预览、`/student/print` 确认打印、`src/worksheet.ts`、pdfkit 与 `@types/pdfkit` 依赖及随包字体，包体积减少约 17 MB。练习单的 `kind`、作答空间与全部校验不变；无 `kind` 的旧卷沿用「全部题目源自他卷错题即为巩固卷」的命名启发式，改由客户端按 `sources` 判定。

## Alternatives considered

**Host 用无头浏览器把 HTML 转 PDF 再走 `lp`。** 引入一个比 pdfkit 重得多的渲染依赖，还保留了子进程调用；浏览器本身就有完整打印管线。

**保留 pdfkit 作为打印后端、HTML 只做预览。** 两套几何仍在，Windows 打印仍缺失，字体与依赖仍要随包发布。

**Host 直接输出静态 HTML 字符串。** 等于把 pdfkit 的手工布局换成 HTML 的手工布局，题图还是要第二份实现。

## Consequences

客户端现在拥有卷面渲染，真实浏览器里的打印分页与对话框行为以 HANDOFF 记录的验证为准。打印不再有队列回执，纸张输出由家长在浏览器打印状态里核对；Windows 与 macOS 打印路径一致。测试从「渲染 PDF 字节」改为客户端渲染断言：`tests/worksheet-view.client.spec.tsx` 覆盖全部题图、作答空间、卷名与对话框关闭；`learning.spec.ts` 保留全部图形 schema 校验；route 用例改为断言旧端点 404。

练习单决策与巩固回路仍归[知识地图决策](../feature/2026-10-16-student-error-elements.zh.md)；仓库与真实 DSH 验证归 [HANDOFF.md](../../../../HANDOFF.md) 所有。
