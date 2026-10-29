# Open-LLM-OCR

Bob 图片识别插件：本地 PaddleOCR、视觉大模型、微软 Document Intelligence、Mistral OCR、Roboflow OCR、OpenDocRouter OCR 和百度异步 OCR。插件免费，云端费用与权限由服务商决定。

## 0.6.0 模型选择与逐字识别

- Roboflow 保持一个入口、一把 Private API Key，模型下拉框默认 **GLM-OCR**；选择后直接识别当前截图，不需要先创建 Workflow。
- 可选 GLM-OCR、PP-OCR Small / Tiny / Medium、Qwen3-VL 2B、Qwen3.5 0.8B / 2B / 4B。此前均已在当前账号的免费额度内完成中英文截图实测；可用权限和计费仍以平台及账号为准。
- 自定义 Workflow 保留在同一个模型下拉框中，仅该选项需要填写下方的 Workflow ID；不显示工作区、图片 URL 或输出路径设置。
- 通用视觉模型默认按原文逐字转录，明确禁止纠错、润色和补全，表格列间使用制表符。旧默认指令自动升级，用户自定义指令保留；PaddleOCR-VL 仍使用专用 `OCR:`，GLM-OCR 使用 `OCR`，PP-OCR 不发送聊天提示词。
- 默认逐字 OCR 指令下，OpenRouter / Fireworks 的指定 DeepSeek V4.1 Flash 1017 模型关闭额外思考，减少输出等待和思考 token；保持图片清晰度和完整输出，自定义指令保留服务商默认行为。其他模型保留原请求参数。
- 升级后请确认模型菜单：默认是 GLM-OCR；旧 Workflow ID 仍保留，继续使用工作流时选择“自定义模型 / Workflow”。当前菜单选择优先。Private API Key 沿用原配置，不内置密钥。
- Workflow 入口认证与模型步骤权限错误继续分别提示；插件不会自动切换供应商、改变计费方式或重试收费请求。

## 0.4.6 修复

- OpenDocRouter 返回 HTTP 200 但页面失败时，透传页级错误（例如 `provider_error: invalid x-api-key`），不再误报“未识别到文字”。
- 保留已成功的模型路径；如果单个上游模型故障，可直接切换模型，不需要更换 OpenDocRouter Key。
- 云端 OCR 默认供应商改为微软 Document Intelligence，默认 Endpoint 使用备用 Azure 资源，模型固定为 `prebuilt-read`。
- Mistral 和视觉模型返回的 HTML 表格转换为制表符文本，避免 `<table>`、`<tr>`、`<td>` 等标签污染 OCR 结果。

## 0.4.0 更新

- **微软 OCR**：Document Intelligence `prebuilt-read`，API `2024-11-30`。同一资源的 Endpoint 与一把 Key 即可；自动轮询并保留文字坐标。
- **Mistral OCR**：原生 `/v1/ocr`，可选最新稳定别名 `mistral-ocr-latest`、固定 OCR 4.1 或自定义模型。保留分页、表格和结构块。
- **视觉大模型**：OpenAI Chat / Responses、Gemini generateContent、Claude Messages。完整端点自动识别，保留代理路径与 query 参数。
- **PaddleOCR-VL 修复**：按其专用格式发送图片和 `OCR:` 任务提示。通用聊天提示会导致识别错误；自定义 Table / Formula 等任务提示仍可使用。
- **结果完整性**：保留空行、代码缩进和字面标签；长行不再静默截断；上游截断、拒绝和失败明确报错。
- **请求生命周期**：提交、轮询和下载共享总超时；单次完成、迟到回调隔离；宿主传入取消信号时停止后续请求。
- **真实验证**：点击“验证”会识别一张内置公开样例，检查实际文字，可能产生一次识别费用。
- **本地服务**：默认端口统一为 **50000**；内存解码，减少磁盘写入；繁忙时明确返回 503；Relay 不再记录签名下载 URL，并限制下载大小和重定向。

用户安装入口始终使用 [GitHub Releases 最新版本](https://github.com/GravityPoet/Open-LLM-OCR/releases/latest)，不会固定到仓库中的某一份包。

## 安装与选择

只需要 `.bobplugin`，无需伴随 App。

| 安装包                                 | 用途                       | 设置                              |
| -------------------------------------- | -------------------------- | --------------------------------- |
| `Open-LLM-OCR.bobplugin`               | 升级已有服务、切换所有后端 | 保留原 identifier、名称和旧配置键 |
| `Open-LLM-OCR-Azure.bobplugin`         | 只用微软                   | Endpoint、Key、总超时三个字段     |
| `Open-LLM-OCR-Mistral.bobplugin`       | 只用 Mistral               | 接口地址、Key、模型、超时         |
| `Open-LLM-OCR-Roboflow-Workflow.bobplugin` | 只用 Roboflow OCR | 模型下拉框、Private Key、可选 Workflow ID、超时 |
| `Open-LLM-OCR-OpenDocRouter.bobplugin` | 只用 OpenDocRouter OCR     | Endpoint、API Key、最大页数       |

请从 [GitHub Releases 最新版本](https://github.com/GravityPoet/Open-LLM-OCR/releases/latest) 的资产列表选择对应包。仓库根目录中的 `.bobplugin` 是开发构建产物，版本更新时会变化，不作为长期下载入口。

精简包是可选的独立服务入口；原版也能调用微软和 Mistral。Bob 第三方设置不支持动态折叠，因此原版将连接项靠前、高级项靠后，精简包只保留对应供应商字段。旧版服务无需删除；升级前保留原有地址、模型和密钥。

## 当前服务与设置布局

Bob 的第三方插件设置目前只支持静态输入框和菜单，没有按“识别服务”自动折叠或隐藏字段的条件显示能力。0.4.1 已按供应商连续分组，并把服务选择顺序调整为：OpenDocRouter、Roboflow、云端视觉模型/微软/Mistral、本地。每组字段带有统一编号，选中服务后只填写对应的一组；未自定义服务名称时，Bob 会显示当前供应商提示名；用户手动改过的服务名称会保留。插件每次只调用当前选中的一个服务，不会因为其他密钥已填写而同时调用其他供应商；如果只使用一家供应商，优先使用对应的精简安装包。

## 配置

标准插件已隐藏百度官方异步 OCR 配置；旧版本的百度异步配置仍由运行代码兼容读取，但新服务列表不再显示该入口。


### 微软 Document Intelligence

1. 选择“微软 Document Intelligence”，或安装 Azure 精简包。
2. Endpoint 填 **Document Intelligence / Form Recognizer 资源**的地址，例如 `https://example.cognitiveservices.azure.com/`。
3. Key 填同一资源的 KEY1 或 KEY2 中的一把，不需要同时填写，也不需要区域字段。
4. 点击“验证”。插件发送 `base64Source`，收到 202 后轮询同源 `Operation-Location`，成功后解析 `analyzeResult.pages[].lines`。

Computer Vision、Translator 与 Document Intelligence 是不同 API。Key 看起来相似也不能混用。401 请先核对资源类型和 Endpoint，不要反复换图片。

### Mistral

- 选择“Mistral OCR”或安装精简包。
- 接口地址：`https://api.mistral.ai/v1`；填写该平台 API Key。
- 默认 `mistral-ocr-latest`；截至 2026-10-25 指向 OCR 4.1，也可固定 `mistral-ocr-4-1`。
- 使用原生 `/ocr` 接口。图片发送到配置的 Mistral 服务；不发送 Chat 请求或温度参数。

### Roboflow OCR

选择“Roboflow OCR”，保留默认 **GLM-OCR**，填入你的 **Private API Key** 即可。选择其他内置模型时继续使用同一把 Key，不需要填写模型供应商的 Key。

| 模型选项 | 调用路径 | 说明 |
| --- | --- | --- |
| GLM-OCR（默认） | `/infer/lmm` | 专用 OCR 任务 |
| PP-OCR Small / Tiny / Medium | `/ocr/pp-ocr` | 三种模型大小，分别发送对应版本参数 |
| Qwen3-VL 2B | `/infer/lmm` | 通用视觉模型逐字提取 |
| Qwen3.5 0.8B / 2B / 4B | `/infer/lmm/<model>` | 按模型专用路径调用；4B 的一次实测明显较慢 |
| 自定义模型 / Workflow | `/<workspace>/workflows/<id>` | 仅此项需要填写下方 Workflow ID；沿用项目工作区 |

内置模型直接调用 Roboflow 原生接口，以 Bearer 方式认证；Workflow 按官方契约在请求体发送 `api_key`。图片始终为当前截图的 Base64，结果自动提取。旧 Workflow ID 仍保留；升级后若继续使用工作流，请选择“自定义模型 / Workflow”。选择具体模型后，下方保留的自定义值不会覆盖选择。

如果 Workflow 的 `model` 步骤返回 HTTP 403，即使 Private API Key 有效、可读取工作区，也可能是内部模型授权被拒绝。实测 Roboflow 的 OpenAI 代理会在工作区不满足套餐要求时返回 “Roboflow-managed OpenAI API keys are only available to workspaces on a paid plan”。拥有赠送 credits 不等于已开放这个托管模型通道。可在 Roboflow 的 Workflow 编辑器为模型步骤配置自己的 OpenAI Key，或使用符合平台要求的付费工作区。插件不自动改变计费方式，也不自动重试此类失败。

### OpenDocRouter OCR

选择“OpenDocRouter OCR”，填写 `https://www.opendocrouter.ai` 和 API Key。插件调用 `/v1/parse`，默认 `llamaindex/ocria-1`，可在设置中替换模型名称，固定使用 `mode=sync`、`cache=false`、`layout=false`；图片直接 Base64 发送，PDF 使用 `application/pdf` 并按“最大页数”发送 `pages: "1-N"`。

### 视觉大模型

- 选择“视觉大模型 API”，填写 Base URL、API Key 和支持图像的模型名。
- 协议选择 Chat、Responses、Gemini 或 Claude；完整接口地址优先。
- OpenRouter `deepseek/deepseek-v4.1-flash-1017` 与 Fireworks `accounts/fireworks/models/deepseek-v4p1-flash-1017` 在默认 OCR 指令下使用各自已验证的关闭思考参数；自定义指令及其他模型不被修改思考设置。
- 默认指令按阅读顺序逐字转录，不翻译、纠错、润色或补全；保留符号、代码缩进和段落，表格按行使用制表符分列。相似符号仍可能误识别，提示词不保证逐字符准确。
- 两个历史默认识别指令自动升级；真正的自定义指令保留。PaddleOCR-VL 默认仍发送官方 `OCR:`，自定义 Table / Formula 等任务提示不被替换。
- 空白结果按 Bob 接口返回“未识别到文字”，不会生成空字符串引号或说明文字。Roboflow 自定义 Workflow 的内部提示词由其工作流模型步骤配置。
- Bob OCR 结果接口一次完成，不提供翻译插件那样的逐字刷新。网络流式接收不能冒充 Bob OCR 流式展示。

### 本地与百度

- [本地服务配置](docs/local-server.md)：默认 `http://127.0.0.1:50000/ocr`。
- [VPS / Mac mini 远程部署](docs/vps-remote-ocr.md)：保留原有端口可通过 `PORT` 显式指定。
- [Docker 部署](docs/docker.md)：默认只映射宿主回环端口，模型挂载为只读。
- [百度异步与 Relay](docs/baidu-async-relay.md)：保留原服务配置；不跨供应商自动回退上传图片。
- [协议、验收与限制](docs/protocols.md) · [GitHub issue 审核](docs/issue-review.md)

## 开发

Node.js 20+、Python 3.10+；插件开发检查不需要安装 npm 依赖。Paddle 模型推理的依赖见服务端文档。

```bash
npm run check
npm test
npm run build
npm run verify
swift tests/jscore-smoke.swift .  # macOS JavaScriptCore
```

`main.js` 只暴露 Bob 入口；`lib/` 按配置、生命周期、图片、结果与服务商分工。归档可重复构建，`--check` 比对源码与包字节。测试不使用真实凭据；`scripts/live-smoke.cjs` 只有在显式从 stdin 提供配置后才发送合成图片。

## English

Version 0.6.0 keeps one Roboflow entry and one Private API Key. The model menu defaults to GLM-OCR and also supports PP-OCR Small/Tiny/Medium, Qwen3-VL 2B, and Qwen3.5 0.8B/2B/4B through their native endpoints. Custom Workflows remain an option in the same menu. Base64 screenshots and output extraction are automatic; no companion app is required. Legacy Workflow IDs remain stored; after upgrading, choose Custom Workflow to keep using one. The new menu defaults to GLM-OCR.

For the default transcription instruction, the verified OpenRouter and Fireworks DeepSeek V4.1 Flash 1017 routes disable optional reasoning without changing image detail or output limits. Custom instructions and unverified models retain provider defaults; other models retain their original request parameters.

The general vision prompt now asks for verbatim transcription, preserves punctuation and indentation, prohibits correction and invented content, and separates table columns with tabs. Old stock prompts upgrade automatically; custom instructions remain intact. Dedicated OCR tasks retain their own request formats. Similar-looking characters may still be misread; these instructions do not guarantee exact transcription. Roboflow-managed provider models can still require an eligible plan or a provider key in the Workflow editor; the plugin never changes billing or retries inference automatically.

Validation performs actual OCR on a bundled synthetic sample. Requests share one deadline, report truncation and failure explicitly, and preserve whitespace, code and long text. PaddleOCR-VL uses its documented image-first task prompt. The local server now defaults to port 50000, decodes in memory and rejects busy work; the optional Baidu relay validates destinations and redirects, bounds response size and omits signed URLs from logs.

Use the matching resource type and key for Azure; Computer Vision and Document Intelligence are not interchangeable. Cloud calls may incur provider charges. Mistral uses `/v1/ocr`, not Chat Completions. OCR in Bob completes once; it does not expose translation-style incremental rendering. Always install from the [latest GitHub Release](https://github.com/GravityPoet/Open-LLM-OCR/releases/latest); root packages are development outputs, and Bob's appcast is updated with each public release.

## License

[MIT](LICENSE). Existing contributor attribution is preserved.
