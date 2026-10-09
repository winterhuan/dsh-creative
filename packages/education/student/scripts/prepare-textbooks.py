#!/usr/bin/env python3
"""Prepare the two default textbooks from the verified source PDFs; requires PyMuPDF 1.28.2."""

import argparse
import hashlib
import json
from pathlib import Path

import pymupdf


BOOKS = [
    {
        "id": "chinese-grade2-first",
        "subject": "chinese",
        "title": "义务教育教科书·语文二年级上册",
        "publisher": "人民教育出版社",
        "edition": "根据2022年版课程标准修订；封面标注2024年审定，版权页未列出版版次和印次",
        "source": "（根据2022年版课程标准修订）义务教育教科书·语文二年级上册.pdf",
        "sha256": "0d1f2132731d53ff3ded1d3c1faee325f527dca1a081b9e18a6256a8d8924b9a",
        "pageCount": 126,
        "firstNumberedPdfPage": 6,
        "lastNumberedPdfPage": 123,
        "unnumberedPdfPages": [],
        "contents": [
            ["第一单元·阅读", 1], ["1 小蝌蚪找妈妈", 1], ["2 我是什么", 5],
            ["3 植物妈妈有办法", 8], ["语文园地一", 11], ["快乐读书吧·读读童话故事", 15],
            ["第二单元·识字", 16], ["识字1 场景歌", 16], ["识字2 树之歌", 18],
            ["识字3 拍手歌", 20], ["识字4 田家四季歌", 23], ["语文园地二", 25],
            ["第三单元·阅读", 28], ["4 彩虹", 28], ["5 去外婆家", 30],
            ["6 数星星的孩子", 32], ["语文园地三", 35],
            ["第四单元·阅读", 39], ["7 古诗二首·登鹳雀楼", 39], ["望庐山瀑布", 40],
            ["8 黄山奇石", 42], ["9 日月潭", 45], ["10 葡萄沟", 47], ["语文园地四", 50],
            ["第五单元·阅读", 54], ["11 坐井观天", 54], ["12 寒号鸟", 56],
            ["13 我要的是葫芦", 60], ["语文园地五", 63],
            ["第六单元·阅读", 67], ["14 八角楼上", 67], ["15 朱德的扁担", 69],
            ["16 难忘的泼水节", 72], ["17 刘胡兰", 75], ["语文园地六", 78],
            ["第七单元·阅读", 81], ["18 古诗二首·江雪", 81], ["敕勒歌", 82],
            ["19 雾在哪里", 84], ["20 雪孩子", 87], ["语文园地七", 91],
            ["第八单元·阅读", 95], ["21 称赞", 95], ["22 纸船和风筝", 98],
            ["23 快乐的小河", 101], ["语文园地八", 104],
            ["识字表", 108], ["写字表", 113], ["词语表", 116],
        ],
    },
    {
        "id": "math-grade2-first",
        "subject": "math",
        "title": "义务教育教科书·数学二年级上册（北师大版）",
        "publisher": "北京师范大学出版社",
        "edition": "2025年7月第1版，2026年7月第2次印刷；ISBN 978-7-303-30747-0",
        "source": "（根据2022年版课程标准修订）义务教育教科书•数学二年级上册.pdf",
        "sha256": "c77f21654602a41f4fb1fd42ad855ec4712bf360a0c507ac8a5e650ce094e0c0",
        "pageCount": 118,
        "firstNumberedPdfPage": 7,
        "lastNumberedPdfPage": 116,
        "unnumberedPdfPages": [109, 111, 113, 115],
        "contents": [
            ["第一单元·100以内数加与减（二）", 2], ["数学好玩·猜数游戏", 18],
            ["第二单元·测量（一）", 20], ["第三单元·数一数与乘法", 30],
            ["第四单元·乘法口诀（一）", 43], ["综合实践·画校园路线图", 53],
            ["第五单元·分一分与除法", 56], ["第六单元·图形的运动（一）", 72],
            ["第七单元·乘法口诀（二）", 77], ["第八单元·乘除法的应用（一）", 87],
            ["综合实践·参加欢乐购物活动", 94], ["总复习", 98],
        ],
    },
]


def prepare(source_directory: Path, output_directory: Path) -> None:
    """Reject different editions before writing, then render page images and searchable raw text."""
    for book in BOOKS:
        source = source_directory / book["source"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != book["sha256"]:
            raise ValueError(f"教材文件与已核对的版本不同，请重新核对目录和页码：{source}")

    for book in BOOKS:
        directory = output_directory / book["id"]
        pages_directory = directory / "pages"
        pages_directory.mkdir(parents=True, exist_ok=True)
        with pymupdf.open(source_directory / book["source"]) as document:
            if len(document) != book["pageCount"]:
                raise ValueError(f"教材页数不符：{book['source']}")
            pages = []
            for pdf_page, page in enumerate(document, 1):
                printed = (pdf_page - 5 if book["firstNumberedPdfPage"] <= pdf_page <= book["lastNumberedPdfPage"]
                           and pdf_page not in book["unnumberedPdfPages"] else None)
                stem = f"pdf-{pdf_page:03d}"
                page.get_pixmap(dpi=144).save(pages_directory / f"{stem}.jpg", jpg_quality=88)
                label = f"书页 {printed}" if printed is not None else "未标书页"
                raw = f"PDF 第 {pdf_page} 页；{label}。以下为未校对的文字层，仅供定位，教学前核对同名 JPG。\n\n{page.get_text()}"
                raw = "\n".join(line.rstrip(" \t") for line in raw.split("\n")).rstrip("\n") + "\n"
                (pages_directory / f"{stem}.txt").write_text(raw, encoding="utf-8")
                pages.append({"pdfPage": pdf_page, "printedPage": printed, "image": f"pages/{stem}.jpg", "text": f"pages/{stem}.txt"})
        manifest = {key: value for key, value in book.items() if key not in {"contents", "firstNumberedPdfPage", "lastNumberedPdfPage", "unnumberedPdfPages"}}
        manifest.update({"grade": 2, "term": "first", "renderer": f"PyMuPDF {pymupdf.VersionBind}, 144 dpi, JPEG quality 88", "pages": pages})
        (directory / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        rows = [f"| {title} | {printed} | {printed + 5} | [课页](pages/pdf-{printed + 5:03d}.jpg) |" for title, printed in book["contents"]]
        index = [f"# {book['title']}", "", f"出版社：{book['publisher']}。{book['edition']}。", "",
                 "本索引由 prepare-textbooks.py 生成。版本与源文件校验信息、逐页对应关系见 [manifest.json](manifest.json)。", "",
                 "按目录选择当前课页，使用 read_image 读取 JPG；同名 TXT 仅供搜索定位，文字层有拼音编码、缺字和图文顺序问题，不能直接用于朗读或判分。每次只读取当前任务需要的一至两页。", "",
                 "文件名按 PDF 页序编号，从 001 开始。正文书页与 PDF 页序相差 5；封面、目录及无书页的附页不要套用换算，查 manifest.json。", "",
                 "封面：[PDF 1](pages/pdf-001.jpg)；版权页：[PDF 3](pages/pdf-003.jpg)。", "",
                 "| 单元或课文 | 书页 | PDF 页序 | 图片 |", "|---|---|---|---|"]
        (directory / "index.md").write_text("\n".join(index + rows) + "\n", encoding="utf-8")
        print(f"{book['id']}: {len(pages)} pages prepared")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_directory", type=Path, help="Directory containing the two verified PDF filenames")
    args = parser.parse_args()
    prepare(args.source_directory, Path(__file__).resolve().parents[1] / "knowledge/skills/study/textbooks")
