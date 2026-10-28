# Open-LLM-OCR 发布流程

此文件是仓库的发布步骤。普通提交与构建不创建 Release。

1. 明确用户授权的版本，保持 `package.json` / `info.json` 一致；使用当前分支，核对远端与 tag 冲突。
2. `npm run build`，再 `npm run verify` 与 macOS `swift tests/jscore-smoke.swift .`。保留真实业务验证的范围与用户明确豁免的验收项。
3. 记录候选 commit、源码指纹和五种 `.bobplugin` 包的 SHA256，检查包中无凭据、配置、work 文件。
4. 执行获授权的本机安装，逐文件比对安装内容；保留原有服务配置及恢复包。测试生成或改变候选时重建受影响产物。
5. 获授权发布时创建 `v<version>` annotated tag 和 Release，上传标准、Azure、Mistral、统一 Roboflow、OpenDocRouter 五个包及 SHA256 清单，下载后核对字节。
6. 公开下载确认成功后更新标准 `appcast.json` 的顶部版本、URL、SHA、identifier 和毫秒时间戳。精简包当前手动更新。
7. 回读远端 SHA、CI、Release latest/draft/prerelease 和更新源。已发布 tag 不移动，不覆盖旧资产来发布不同内容。

回滚：源码可通过追加 revert 提交恢复；本机可重新安装对应旧包。已经公开下载的版本无法召回，应修正后递增版本。保留历史 Release 与更新源条目。

## 本轮已知失败模式

| 现象 | 证据 / 原因 | 修复与预防 |
| --- | --- | --- |
| Azure 返回 401 | 给 Document Intelligence 资源调用了 Computer Vision API | 先核对资源类型；使用 prebuilt-read 的 202/轮询链路 |
| HTTP 200 但 PaddleOCR-VL 返回无关文本 | 通用聊天提示与专用识别模型不匹配 | 官方 image-first + OCR: 模板，验证必须核对文字 |
| Node 通过但 Bob 图片检查失败 | Bob 实机对象没有数值 length 属性 | 单次编码推导大小，增加无 length 原生形态回归 |
| 超时等字段显示成密码框 | 原 manifest 没有声明 textConfig.type | 所有普通输入显式 visible，凭据显式 secure |
| UI 提示 user changed / Finder 目录串动 | 自动化连接状态及共享桌面发生切换；不是代码测试结果 | 停止重复操作，刷新/重建连接并使用准确状态；保留未验收项 |
| Mistral OCR 返回 429 | 模型列表 200，但识别请求 Rate limit exceeded | 不自动重发付费请求；用户停止在线验收后保留能力并标记未通过 |
| OpenDocRouter 图片/PDF MIME 混用 | 图片和 PDF 都使用 `image/*` 或图片请求携带页范围会被服务拒绝；页范围属于 Parse 请求体顶层 | 通过文件签名识别 PDF；PDF 使用 `application/pdf` 与顶层 `pages=1-N`，图片不发送 pages，并分别做回归 |
| PDF 回归首次未启动 | `ReferenceError: Data is not defined` | 测试夹具使用了 Bob Data 替身但未从 helpers 导入 | 新增 Bob 原生对象夹具时同时检查 helpers 导出并先运行专用测试 |
| 包凭据扫描误报 | 自定义正则把 `placeholderText: sk-xxxxxxxx...` 当成真实 Key | 误报来自示例占位符，包内没有真实凭据 | 扫描时允许固定占位符，并继续检查实际高熵凭据、用户配置和 work 文件未进入包 |
| Bob 文件选择后版本未变化 | 选择 `.bobplugin` 后列表仍显示 0.3.0 | 文件选择流程没有完成升级，不能只凭对话框关闭判定安装成功 | 用 Bob 的“检查更新”读取 appcast；必须看到“更新成功”和插件列表 0.4.0，再逐文件比对安装目录 |
| 统一 Roboflow 后仍出现两个包 | 构建脚本仍把旧 `Open-LLM-OCR-Roboflow.bobplugin` 列入发布循环，导致新客户同时看到固定 GLM-OCR 和自定义 Workflow | 将 GLM-OCR 路径合并到统一 Roboflow 设置：填 `glm-ocr` 走 `/infer/lmm`，其他 ID 走固定工作区 Workflow；旧 `serviceMode=roboflow` 只保留代码兼容；发布循环只允许五个正式包 | 每次发版检查仓库根目录和 Release 资产均不存在旧 Roboflow 包，并用统一入口的两条协议回归测试 |

## 0.4.6 发布记录

- 候选提交：`0201fe6c787b6fdac2e9d072f798022296405285`；tag：`v0.4.6`。
- 首次 `gh release create ... --draft` 返回临时 `untagged-*` 页面地址，这是 GitHub 草稿资产的正常中间状态；发布后已用 `gh release view v0.4.6` 回读正式 tag 地址、`draft=false`、`prerelease=false`、目标提交和六个资产。
- 五个包 SHA 与发布资产 digest 已逐一核对；`appcast.json` 顶部版本为 0.4.6，更新源中的标准包 SHA 与正式资产一致。

## 0.5.0 发布记录

- 将 Roboflow 托管 GLM-OCR 与自定义 Workflow 合并为一个“Roboflow OCR（自定义模型 / Workflow）”入口；旧 `serviceMode=roboflow` 仅保留运行时兼容读取。
- `glm-ocr` 走 `POST /infer/lmm`；其他模型或 Workflow ID 走固定工作区的 `POST /<workspace>/workflows/<workflow-id>`。两条路径共用一把 Private API Key，但认证位置按官方协议分别处理。
- 新版发布清单只包含统一的 `Open-LLM-OCR-Roboflow-Workflow.bobplugin`，不再生成或发布旧 `Open-LLM-OCR-Roboflow.bobplugin`。
- 候选包 SHA256：标准 `23cb5af005b276235c26c5bee9ff13fa7e6f98da64ee8d78b9bcd73a41ac2652`；Azure `e906959cf762673c26d90d07d68b2e7e9a97ef562369dd2d29397603c5089003`；Mistral `1bcbfb0e4d091e55f4dbbad447a73577b6b706a5b69394fffd6e733feadcc681`；统一 Roboflow `34813af98cf796d7699806690b69b8bb659d4682f3222dca1fdbf489b3b2d1f0`；OpenDocRouter `02593674f0bea64f6e7aa292737de1e285371be7fbe5ccf1b036c1ae76f16733`。
- 验证：`npm run verify` 通过（71 个 Node 测试、10 个 Python 测试、五个包字节一致）；`swift tests/jscore-smoke.swift .` 通过 9 项。
