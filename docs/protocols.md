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
| OpenDocRouter | POST `/v1/parse`，Bearer API Key，`mode=sync`、`cache=false`、`layout=true`，Base64 document | 200 仍需检查整体 `status` 和 `pages[].status`；读取 `pages[].layout.elements[].lines/boxes` 并转换为 Bob 坐标；布局失败时保留 Markdown 文本 |

Mistral 最新稳定 OCR 为 4.1；latest 可随官方更新，固定版本用于复现。插件请求 inline Markdown 表格，关闭图片 Base64 回传以缩小响应。不调用批处理、上传持久文件或生成额外批量任务。

OpenDocRouter 默认模型为 `llamaindex/ocria-1`，模型名可在设置中替换；图片 inline 请求约 3 MB 限制，PDF 使用配置的 1–200 页范围。Roboflow 统一入口默认选择 GLM-OCR；其他原生模型直接从下拉框选择。只有选择“自定义模型 / Workflow”才使用下方 ID；旧 Workflow ID 保留，升级后需从新菜单选择自定义以继续使用。两家都要求用户分别提供对应 API Key，不共用已有视觉服务 Key。

Azure 图片坐标转换为 Bob 的 `[0,1]` 四点坐标，供原图翻译使用。Mistral OCR 4+ 的 `include_blocks=true` 返回段落级结构块和四角坐标；插件将其转换为 Bob 坐标。OpenDocRouter 的 `layout=true` 返回阅读顺序元素和归一化 boxes；插件按元素覆盖的 Markdown 行合并为带框文本块。Roboflow PP-OCR 的预测框按行合并后输出带框文本。多页响应不把不同页坐标覆盖到同一截图。

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

## PP-OCR 缩进与字符保真（0.6.1）

PP-OCR 的 `result` 可能已丢掉行首空白，但同一响应的 `predictions` 保留文字位置。插件在坐标、行文本匹配和 ASCII 字符间距足够一致时，仅恢复可测量的行首缩进；保留原识别字符、已有缩进及重复行。非法或缺失几何信息直接使用原文本，不增加 API 调用。

GLM 的相似字符差异已在原始 `response` 中复现。官方 Text Recognition、短精准转录提示、结构化抽取、纯色白边裁除均未形成可靠改善；结构化抽取遗漏正文、裁边增加字符差异，因此均未进入生产。测试字体中 en dash 与 em dash 的轮廓相同，不能仅凭图片唯一还原编码。保留原图、参考文本和严格统计规则，不通过替换已知字符制造测试通过。

## 原生 OCR 参数隔离（0.6.1）

微软 Document Intelligence 请求体仅含 `base64Source`，不发送大模型提示词；Mistral 原生请求也不发送该指令。两者不读取或校验 `cloudPrompt`、`cloudImageDetail`、`cloudProtocol`。这些字段仅在 `providerCloud` 模式使用；通用请求超时、Key 和本服务模型校验保持有效。界面连接字段共用以保留旧配置，但明确标出视觉大模型专用参数。

## OpenDocRouter 表格与代码（0.6.2）

OpenDocRouter Markdown 回退先区分代码围栏与正文。正文中的完整 HTML 表格保持所在位置转换为制表符行，Markdown 表格只转换已确认的表格段；非表格的竖线保持原样。代码围栏标记移除，内部空格、Tab、注释和字面 HTML 保留；已转换的行通过内部纯文本标记避免再次按 HTML 解释，输出给 Bob 时不暴露该标记，原结果大小限制继续生效。围栏外的生成标题前缀仍按原有规则清理，模型字符误认不猜测替换。

请求继续使用原模型和 `mode=sync`、`cache=false`；OpenDocRouter 为支持原图翻译坐标启用 `layout=true`，该字段可能增加少量响应和费用。Node 与 JavaScriptCore 覆盖完整布局元素、PP-OCR 行框、Mistral 块框以及缺坐标回退路径。

## 原图翻译坐标接入（0.6.3）

`supportBoundingBox()` 按当前服务能力返回：Azure、本地多边形、Mistral 官方 OCR 4.x、OpenDocRouter 布局和 Roboflow PP-OCR 声明支持；通用视觉模型、GLM-OCR、Qwen 和自定义 Workflow 仍不声明。不能从纯文本推断真实位置。

OpenDocRouter 的布局是服务端生成的 grounded boxes，开关与普通文本解析共用一个服务配置；如果布局生成失败，保留 OCR Markdown，但不伪造坐标。PP-OCR 只在预测框完整、图片尺寸有效且行匹配成功时返回行框；否则保留文字并让 Bob 使用普通 OCR。Mistral 自定义模型没有官方块坐标时不声明原图翻译能力。

## OpenDocRouter 图片描述清理（0.6.5）

部分 OpenDocRouter 解析配方会把头像、图片或图标生成 `[Figure: ...]`、`[图片：...]`、`[Icon]` 等 Markdown 占位符。这些不是图片中可见文字，插件在 OpenDocRouter 结果层移除明确的图片/图标描述后再交给 Bob；仍发送原图并保留 `layout=true` 的坐标。代码围栏内的同名字面文本不清理，成对 Markdown 粗体/删除线标记也只在普通 OCR 文本中去掉，避免把 OCR 结果误渲染为样式。
