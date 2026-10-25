# OpenDocRouter 全模型 OCR 速度验收（2026-10-25）

测试条件：同一张合成 PNG、`POST /v1/parse`、`mode=sync`、`cache=false`、`layout=false`，模型逐个顺序调用；耗时从请求发送前到 HTTP 响应解析完成。

- 模型数：19
- 成功识别：19/19
- 本轮总费用估算：$0.030343

| 排名 | 模型 | 总耗时 | HTTP | 页状态 | 费用 |
| ---: | --- | ---: | ---: | --- | ---: |
| 1 | `mistral/mistral-ocr-4-1` | 2286 ms | 200 | ok | $0.004000 |
| 2 | `mistral/mistral-ocr-4-1-annotations` | 2603 ms | 200 | ok | $0.005000 |
| 3 | `openai/gpt-6-luna` | 2669 ms | 200 | ok | $0.000089 |
| 4 | `anthropic/claude-haiku-5-5` | 2805 ms | 200 | ok | $0.000118 |
| 5 | `openai/gpt-5.6-terra` | 3070 ms | 200 | ok | $0.001852 |
| 6 | `anthropic/claude-opus-5-5` | 3115 ms | 200 | ok | $0.004704 |
| 7 | `llamaindex/ocria-1` | 3148 ms | 200 | ok | $0.001498 |
| 8 | `google/gemini-3.8-flash-low` | 3432 ms | 200 | ok | $0.001228 |
| 9 | `google/gemini-3-flash` | 3790 ms | 200 | ok | $0.001294 |
| 10 | `meta/muse-spark-1.3-minimal` | 5012 ms | 200 | ok | $0.001506 |
| 11 | `meta/muse-wonder-1.0-minimal` | 6646 ms | 200 | ok | $0.004000 |
| 12 | `google/gemini-4-argon` | 7005 ms | 200 | ok | $0.003336 |
| 13 | `xingchen-agi/teleocr` | 9626 ms | 200 | ok | $0.000511 |
| 14 | `opendatalab/mineru2.5-pro` | 10242 ms | 200 | ok | $0.000175 |
| 15 | `lightonai/lightonocr-3-1b` | 10984 ms | 200 | ok | $0.000237 |
| 16 | `rednote-hilab/dots.mocr` | 14798 ms | 200 | ok | $0.000387 |
| 17 | `infly/infinity-parser2-flash` | 18066 ms | 200 | ok | $0.000280 |
| 18 | `nvidia/nemotron-3.5-parse` | 19341 ms | 200 | ok | $0.000048 |
| 19 | `paddlepaddle/paddleocr-vl-1.6` | 22515 ms | 200 | ok | $0.000080 |

最快是 `mistral/mistral-ocr-4-1`，约 2286 ms。结果只代表本次账号、时间、单页合成图片和服务排队状态；不能推断所有文档、页面数或高峰期表现。

每个模型都返回了可解析正文；部分模型对同一图片增加了 Markdown 标题，这属于格式差异，当前插件会原样保留。
