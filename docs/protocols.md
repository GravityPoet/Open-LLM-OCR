# 协议与验收边界

核查日期：2026-10-25。只发送到用户配置的服务，不自动切换供应商。用户截图、密钥和完整响应不写日志；测试只发送合成样例。

| 服务 | 请求 | 完成条件 |
| --- | --- | --- |
| Azure Document Intelligence | POST `/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`，`base64Source`，`Ocp-Apim-Subscription-Key` | 202 + 同源 Operation-Location；轮询到 succeeded；解析行和归一化坐标 |
| Mistral OCR | POST `/v1/ocr`，Bearer，`document.type=image_url`，data URL，`include_blocks=true`，`table_format=markdown` | 200 + 有效 pages；优先结构块，旧返回回退 Markdown；表格统一为干净文本行，不把 HTML 标签传给 Bob |
| OpenAI Chat | POST `/chat/completions`，Bearer，image_url | 正常 finish_reason + 可解析文字 |
| OpenAI Responses | POST `/responses`，`store=false`，input_image | completed + 可解析文字 |
| Gemini | POST `/models/{model}:generateContent`，inlineData；官方域名使用 x-goog-api-key | 正常候选，忽略 thought 部分 |
| Claude | POST `/messages`，x-api-key，版本 2026-10-21 | end_turn / stop_sequence，忽略 thinking，截断报错 |
| PaddleOCR-VL | Chat 兼容，图片在前，`OCR:` 在后，temperature=0 | 专用任务识别结果；普通模型不被强制设置采样参数 |
| 本地 Paddle | POST `/ocr`，file Base64 | 有效 ocrResults / rec_texts |
| 百度 jobs（旧配置兼容，标准设置已隐藏） | multipart 提交、轮询、下载 JSONL | done + 全部结果解析；不把任务提交当作识别成功 |
| Roboflow OCR（统一入口） | 默认 GLM-OCR；GLM / Qwen3-VL POST `/infer/lmm`，PP-OCR POST `/ocr/pp-ocr`，Qwen3.5 使用模型路径；自定义 Workflow POST `/<workspace>/workflows/<workflow-id>`；共用 Private Key、始终 Base64 image | 统一转换为 Bob OCR 文本；不保存公共图床 URL |
| OpenDocRouter | POST `/v1/parse`，Bearer API Key，`mode=sync`、`cache=false`、`layout=false`，Base64 document | 200 仍需检查整体 `status` 和 `pages[].status`；页级 `error.code/message` 原样归纳后返回，不把失败页当成空 OCR |

Mistral 最新稳定 OCR 为 4.1；latest 可随官方更新，固定版本用于复现。插件请求 inline Markdown 表格，关闭图片 Base64 回传以缩小响应。不调用批处理、上传持久文件或生成额外批量任务。

OpenDocRouter 默认模型为 `llamaindex/ocria-1`，模型名可在设置中替换；图片 inline 请求约 3 MB 限制，PDF 使用配置的 1–200 页范围。Roboflow 统一入口默认选择 GLM-OCR；其他原生模型直接从下拉框选择。只有选择“自定义模型 / Workflow”才使用下方 ID；旧 Workflow ID 保留，升级后需从新菜单选择自定义以继续使用。两家都要求用户分别提供对应 API Key，不共用已有视觉服务 Key。

Azure 图片坐标转换为 Bob 的 `[0,1]` 四点坐标，供原图翻译使用。Mistral 返回段落级结构块；保留文本和可用坐标，但不把段落框冒称行级定位精度。多页响应不把不同页坐标覆盖到同一截图。

总超时覆盖图片提交、轮询及下载。生成/提交请求不盲目重发；百度仅在明确拒绝模型参数时按原策略换模型。取消信号由宿主提供时使用；Bob 当前 OCR query 文档未承诺所有入口都提供取消信号，因此每条路径另有截止时间保证结束。

## Roboflow Workflow 的模型步骤授权

Workspace 认证成功、可以读取 Workflow，与内部模型步骤获准执行是两道检查。`ClientCausedStepExecutionError` 加 `RoboflowAPIForbiddenError` 表示 Workflow 中某个步骤被平台拒绝，不能据此直接断言 Private API Key 无效。插件保留失败步骤与 HTTP 状态，提示核对模型权限和套餐；只有上游明确返回付费计划限制时才断言该限制是原因。

实测已确认：同一有效 Key 的工作区查询、Workflow 定义查询及额度检查均为 HTTP 200，而托管 OpenAI 代理返回 HTTP 403，并明确要求 paid plan。官方 OpenAI Workflow block 的 `api_key` 默认是 `rf_key:account`，因此未额外填写 OpenAI Key 时走 Roboflow 托管计费。可以在 Workflow 模型步骤提供自己的 OpenAI Key；此选择会改为用户的 OpenAI 账户计费，需要由用户自行决定。插件请求不增加备用 Key、自动换供应商或额外计费重试。

官方 SDK 的 `use_cache=True` 缓存的是 Workflow 定义，不能解除模型授权限制；加入相同字段的对照请求同样返回上述 403。

## 本次验证

- 旧版 5 个故障回归均失败；新实现修复 URL query、长行截断、异常结束、字面标签和无效验证路径。
- Azure KEY1 真实调用：202 → 200 succeeded，公开样例三行准确；经插件相同代码调用再次准确，并返回三个坐标框。
- 原有 SiliconFlow PaddleOCR-VL-1.5：旧提示生成错误文本，按官方任务格式修正后同图三行准确。
- Mistral 模型列表真实请求返回 200，列出 latest 与 OCR 4.1；识别请求返回 429 / Rate limit exceeded。用户要求停止其在线验收，未宣称识别成功。
- 其他模型协议及 Baidu 的本地协议夹具不是账户权限验证。
- 本机未运行 Paddle 模型服务，且没有 Docker CLI；服务端边界/并发/端口/Relay 通过离线测试，Docker 构建与完整模型推理尚未在本机验收。

## 官方依据

- [Roboflow Workflow SDK 与定义缓存](https://docs.roboflow.com/reference/inference/inference-sdk/workflows)
- [Roboflow OpenAI block 的托管 Key 默认值与代理路径](https://github.com/roboflow/inference/blob/9d75f3baf45647a7d164a595af5fba2666b4f26c/workflows/roboflow_workflows/core_steps/models/foundation/openai/v7.py)
- [Microsoft Analyze Document](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20(2024-11-30))
- [Document Intelligence Read](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0)
- [Mistral OCR 4.1](https://docs.mistral.ai/models/ocr-4-1) · [OCR API](https://docs.mistral.ai/api/endpoint/ocr) · [结构块与表格](https://docs.mistral.ai/studio/document-processing/basic_ocr)
- [PaddleOCR-VL vLLM 官方任务格式](https://github.com/vllm-project/recipes/blob/main/PaddlePaddle/PaddleOCR-VL.md)
- [PaddleOCR 输入契约](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html)
- [Bob OCR](https://bobtranslate.com/plugin/quickstart/ocr.html) · [OCR 结果与坐标](https://bobtranslate.com/plugin/object/ocrresult.html) · [网络与取消](https://bobtranslate.com/plugin/api/http.html)

## Roboflow 原生模型菜单（0.6.0）

一个 Roboflow 服务和一把 Private API Key；默认 `glm-ocr`。PP-OCR 三档分别发送 `pp_ocr_version_id=tiny-tiny/small-small/medium-medium`，读取 `result`；GLM-OCR 和 Qwen 读取 `response`。Qwen3.5 使用 `/infer/lmm/qwen3_5-<size>` 路径和 `enable_thinking=false`，其余 LMM 使用 `/infer/lmm`。所有内置模型直接发送当前截图 Base64，凭据仅在 Bearer 请求头中。自定义 Workflow 使用原有请求体认证，不与原生模型混用。

显式菜单选择优先于保留的旧 Workflow 字段；底层旧调用仍可读取旧 ID；Bob 设置中新菜单默认 GLM-OCR，升级时须明确选择要继续使用的自定义 Workflow。非法菜单值或 Workflow 路径在发请求前拒绝；不会自动重试、创建工作流或切换计费方式。

## DeepSeek OCR 响应优化（0.6.0）

仅对 OpenRouter 与 Fireworks 上已验证的 V4.1 Flash 1017、Chat 协议及默认逐字转录指令设置关闭思考；使用各自支持的字段，不改变图片、温度或输出上限。自定义指令及其他路由不被强制修改。未通过关闭思考验收的其他模型不强制发送该参数。连接建立耗时与模型思考分别统计；Bob 公开网络接口未提供连接池设置，插件不伪造逐字 OCR 展示或更改宿主网络设置。
