# Agent Note: 重叠圈成为可打印图形

Status: implemented

[English](2026-10-16-student-overlap-figure.md) | 中文

## 问题

重叠问题（两个集合有交集，教材里画成两个相交的圆）没有可打印的图形：封闭的 `figure` 词汇表有九种，没有一种能表达“两边都有”，带这种题的练习单存不下、印不出。真正的限制是这份词汇表，不是 PDF 管线——渲染走 pdfkit 矢量绘制，词汇表里有的形状都画得出；自由 HTML 卷也在[出题要素](2026-10-16-student-error-elements.zh.md)那一批被否决，因为那样的卷不进打印、批改和复习回路。

## 决策

`overlap` 是第十种 `figure`：`left`、`right` 是两个集合名，`leftOnly`、`both`、`rightOnly` 各写对应区域的一个标签（空标签印答案框，与其他图形一致），可选 `total` 画在两圈下方的括号处；集合名留空会被拒绝。渲染器画两个圆心距等于半径的圆、在可用宽度里居中，`figureHeight` 报 128 点（带 total 时 156 点），题目不会被分页拆开。[出题参考](../../../../packages/education/student/knowledge/skills/study/references/questions.md)、`worksheet` 工具描述、练习卷提示词和两份 README 都列出这种图形；printable-figures 测试现在画满十种——此前只列了九种里的六种，数轴、钟面、小棒随这一次一起补上。

## 考虑过的替代方案

**自由 HTML 或 SVG 图形。** 作为可打印卷的载体已被否决——没有保存的练习单记录，也没有批改路径——而且两个相交圆并不需要它：同样的几何就是几个 pdfkit 调用。

**一个带 N 个圆的通用集合图 kind。** 教材里的图就是两个圆；固定形状让校验、布局和高度计算都最简单，真需要三圈时按同样方式加一种即可。

**复用 `bar-model` 或 `shapes`。** 两者都表达不了“同时在两个集合里”，用文字补描述就失去了配图的意义。

## 验证

宿主测试把全部十种（含 overlap）经 `renderWorksheet` 渲染进 PDF（两张卷、每张最多 8 题）；带 total 的两种和不带的共三种形态与教材版式做了目视核对。根 `typecheck`、`build`、学生包测试、`doc-sync` 与 `hygiene` 通过；未在真实 DSH 浏览器验证，未调用真实模型。

## 后果

练习单可以印重叠问题，同时留在“打印、批改、复习”回路里；模型可以从文档列出的清单里选到这种图形。词汇表保持封闭是刻意的：每一种新图形只是一个 schema 分支加一个绘制函数，不开放任意渲染面。
