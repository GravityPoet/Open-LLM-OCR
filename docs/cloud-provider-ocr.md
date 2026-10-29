# 云端 OCR 配置

见 [README](../README.md#配置) 与 [协议说明](protocols.md)。0.4.0 保留所有旧连接配置键，增加微软 Document Intelligence 与 Mistral 原生 OCR。

视觉大模型支持 Chat、Responses、Gemini 与 Claude；同一个 API Key 并不代表所有协议都可用。完整端点优先决定协议，根地址按协议补齐；代理路径与查询参数保留。不要把微软 Document Intelligence 的 Key 填给 Computer Vision。

PaddleOCR-VL 使用图片在前、`OCR:` 在后的专用任务格式。旧默认自然语言提示会被转换，自定义任务提示保留。其他视觉大模型继续使用自定义识别指令，不强制 temperature=0。

“验证”会发送内置合成图片，检查文字包含 OCR 和 123；可能收费。GET /models 成功不代表模型具备视觉能力，因此不作为验证成功依据。

## 默认识别指令

0.6.0 的通用视觉模型默认逐字转录：不翻译、纠错、润色或补全，保留原文符号、代码缩进及段落，表格列间使用制表符。旧默认文本会自动升级，自定义文本保留。空白结果由 Bob 显示“未识别到文字”。这些约束不保证相似符号或模糊字完全准确。

专用模型继续遵守各自契约：PaddleOCR-VL 默认 `OCR:`；Roboflow GLM-OCR 为 `OCR`；PP-OCR 不发送聊天提示词。Roboflow 的 Qwen 原生调用使用逐字转录指令，自定义 Workflow 则使用工作流模型步骤中配置的提示词。
