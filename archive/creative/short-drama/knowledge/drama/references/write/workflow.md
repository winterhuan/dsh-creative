# 剧本时长估算

用户问时长时才把索引写入系统临时目录。先用 Python 查询跨平台临时目录，把第一条命令打印的完整
路径原样替换进后两条命令的引号内。以下每条都是一行完整命令，不依赖 shell 变量或续行符；Windows
没有 `python3` 命令时使用 `py -3`。`--speaker` 的示例值必须替换为本集实际说话者；只有存在项目
配置时才添加 `--project short-drama.json`：

```text
python3 -c "from pathlib import Path; import tempfile, uuid; print(Path(tempfile.gettempdir()) / ('short-drama-' + uuid.uuid4().hex + '.jsonl'))"
python3 "{资源根}/skills/short-drama-write/scripts/screenplay_index.py" "剧集/EP001/剧本.md" --output "粘贴第一条命令输出的完整路径" --speaker "本集角色一" --speaker "本集角色二"
python3 "{资源根}/skills/short-drama-write/scripts/duration_estimate.py" "剧集/EP001/剧本.md" --index "粘贴第一条命令输出的完整路径"
```

估算是参考，不是门禁；没有语速或动作段速率时只报告可数事实，不猜秒数。但任务已给目标时长时，
写作者仍须用真实朗读和动作通读判断能否容纳，并直接压缩重复节拍；“不能精确估秒”不是忽略目标的理由。
