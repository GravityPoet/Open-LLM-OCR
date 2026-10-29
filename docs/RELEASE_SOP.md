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
| Release tag 与版本源不一致 | 版本修改留在工作树未暂存，构建包为 0.5.1 但 tag 提交中的 `info.json` 仍为 0.5.0 | 版本 bump 后同时回读 `package.json`、`info.json`、包内 `info.json` 和 `git show HEAD:info.json`；只从干净提交创建 tag；不移动已发布 tag，递增版本修正 | 发布前要求工作树干净、版本源一致、包 provenance 与提交 SHA 一致 |
| Roboflow 模型步骤 403 被误报为用户 Key 错误 | 工作区、Workflow 定义和额度检查均 200；插件等价请求与官方 SDK 等价请求均在 `model` 步骤 403；直接查询 OpenAI 代理返回托管 Key 仅限 paid plan | 在 Workflow 适配器区分入口认证失败和 `ClientCausedStepExecutionError`；保留失败步骤，条件提示托管 OpenAI 的套餐限制；仅上游明确返回 paid plan 时确认这一原因 | 用真实响应结构回归，保留密钥脱敏、单次完成、无额外推理或自动重试；不把离线测试或有效 Key 当成模型执行成功 |

## 0.4.6 发布记录

- 候选提交：`0201fe6c787b6fdac2e9d072f798022296405285`；tag：`v0.4.6`。
- 首次 `gh release create ... --draft` 返回临时 `untagged-*` 页面地址，这是 GitHub 草稿资产的正常中间状态；发布后已用 `gh release view v0.4.6` 回读正式 tag 地址、`draft=false`、`prerelease=false`、目标提交和六个资产。
- 五个包 SHA 与发布资产 digest 已逐一核对；`appcast.json` 顶部版本为 0.4.6，更新源中的标准包 SHA 与正式资产一致。

## 0.5.2 发布记录

- 将 Roboflow 托管 GLM-OCR 与自定义 Workflow 合并为一个“Roboflow OCR（自定义模型 / Workflow）”入口；旧 `serviceMode=roboflow` 仅保留运行时兼容读取。
- `glm-ocr` 走 `POST /infer/lmm`；其他模型或 Workflow ID 走固定工作区的 `POST /<workspace>/workflows/<workflow-id>`。两条路径共用一把 Private API Key，但认证位置按官方协议分别处理。
- 新版发布清单只包含统一的 `Open-LLM-OCR-Roboflow-Workflow.bobplugin`，不再生成或发布旧 `Open-LLM-OCR-Roboflow.bobplugin`。
- 候选包 SHA256：标准 `23cb5af005b276235c26c5bee9ff13fa7e6f98da64ee8d78b9bcd73a41ac2652`；Azure `e906959cf762673c26d90d07d68b2e7e9a97ef562369dd2d29397603c5089003`；Mistral `1bcbfb0e4d091e55f4dbbad447a73577b6b706a5b69394fffd6e733feadcc681`；统一 Roboflow `34813af98cf796d7699806690b69b8bb659d4682f3222dca1fdbf489b3b2d1f0`；OpenDocRouter `02593674f0bea64f6e7aa292737de1e285371be7fbe5ccf1b036c1ae76f16733`。
- 验证：`npm run verify` 通过（71 个 Node 测试、10 个 Python 测试、五个包字节一致）；`swift tests/jscore-smoke.swift .` 通过 9 项。
- 兼容修复：标准插件的统一 Roboflow 菜单继续使用历史 `serviceMode=roboflow` 值；空模型默认 GLM-OCR，自定义 ID 才走 Workflow，避免升级后 Bob 下拉框与真实运行服务不一致。
- 候选包 SHA256：标准 `0dae633ad9a4d863265eb31255b18a2afac9043c7b77e7e37cd8b52215ae0d3a`；Azure `234c5c12d18c69da2bf68919643da44e88b42dd05a760128861055e75fddcae1`；Mistral `db8ac313cdc523272149ce70a37072c1cbd29a9a6b9387d219cd1367f8abe274`；统一 Roboflow `3aad8391f5f19bf566744ad3e4e0f77a1b471094c52ed80545d195eff8f0765c`；OpenDocRouter `29d369b00dda2a2ba47bff0893d772857bd59d3d202c85bde2564dd4671370d7`。
- 验证：`npm run verify` 通过（73 个 Node 测试、10 个 Python 测试、五个包字节一致）；`swift tests/jscore-smoke.swift .` 通过 9 项。

## 0.5.3 发布范围与验收

- 修复 Roboflow Workflow 的 401/403 提示与分类，区分入口 Key 认证和内部模型权限、套餐限制；保留原始 HTTP 状态和失败步骤，继续脱敏。
- 请求契约、模型选择与计费方式不变；不自动更换供应商、不增加后台诊断请求或付费重试。
- 真实定位已复现上游 403；托管 OpenAI 的执行仍被平台套餐限制，不能将报错提示修复声明为云端识别恢复。客户可自行在 Workflow 模型步骤配置 OpenAI Key，或使用符合平台要求的付费工作区。
- 发布包为标准、Azure、Mistral、统一 Roboflow、OpenDocRouter 五种 `.bobplugin`；Bob 宿主 App 和签名不变。
- 源码验证与五个包的一致性检查、JavaScriptCore 以及提交后的 CI 全部通过后才发布。标准更新源在公开资产下载并逐一校验后更新。
- 本地验收：`npm run verify` 通过 76 个 Node 测试、10 个 Python 测试和五包字节比对；`swift tests/jscore-smoke.swift .` 通过 10 项，其中包含 Roboflow 步骤 403 与密钥脱敏。
- 发布候选：`63f679717bbfcbf4e47ddf3328cb98165137cc7e`，annotated tag `v0.5.3`；CI `40795302348` 的 `verify` 和 `jscore` 均成功。五个公开下载包与随附 SHA256 清单已逐一校验，标准包 SHA256 为 `4326a83f8f2c87538afd9477280030242a59018663dea36a1fc11ef1b438757d`。

## 0.6.0 发布范围与门禁

- 单一 Roboflow 服务，默认 GLM-OCR，增加八个已实测原生模型配置的下拉选项；同一 Key 分别遵守原生 Bearer 与 Workflow 请求体认证。自定义 Workflow 作为同一菜单的可选项。
- 通用视觉指令补强逐字转录、符号与表格要求；旧默认升级、自定义不覆盖，专用 OCR 任务不被长提示替换。
- 新增模型原生路径、PP-OCR 结果字段、菜单选择优先级、旧配置与非法路径回归；发布前真实调用最终适配器中的全部八个内置选项，并在每次调用前确认免费额度未超限。
- 版本文件、包内版本、提交中版本必须一致；标准与四种精简包均包含新版原生模型支持，旧重复 Roboflow 包仍禁止发布。Bob 宿主 App、签名及其他服务选择不变。
- 本轮读取 `gh api repos/GravityPoet/Open-LLM-OCR/releases/latest` 曾遇到 `net/http: TLS handshake timeout`；它是请求未完成，不能据此判定 Release 不存在。发布写入前重新读取精确远端、tag 与 Release，成功后再继续，不盲目重复创建。
- 本地验证通过：`npm run verify` 的 91 个 Node 测试、10 个 Python 测试和五包字节比对；`swift tests/jscore-smoke.swift .` 的 28 项检查。最终适配器的八个原生选项均返回 HTTP 200，同一张中英文合成图的预期文字全部匹配（忽略空白）；每次识别前额度检查均确认 underCap=true。
- 联调传输出现一次 Node `fetch` 网络失败及一次额度查询连接失败；未收到模型错误响应，不能推断 Key 或协议错误。只读连通性检查与 Python HTTPS 查询返回 200 后，使用同一插件代码生成的请求经 Python 标准库传输完成八项验证；保留原失败记录。产品代码不增加网络重试、不修改系统代理或证书校验。
- 追加 DeepSeek OCR 优化：相同图片和默认指令下，OpenRouter / Fireworks 的指定 1017 模型关闭额外思考；两张合成图各三次，字符差异总量没有增加，思考 token 均为 0。最终候选新增专用参数回归及 JavaScriptCore 检查；其余模型与用户自定义指令保持原请求。
- 八个 Roboflow 原生选项的真实验证继续复用：追加变更仅位于 `lib/cloud.js` 的通用视觉模型分支，该分支不参与 Roboflow 调用；本机安装后仍需通过 GLM-OCR 原生验证。
- 本机文件选择器的“前往”路径未成功定位 Documents 中的安装包，保持旧安装不动；使用经过 SHA 校验的 Downloads 候选副本从原生文件列表选择，安装后核对版本与全部文件字节。未完成选择不能冒称安装成功。
- GitHub CLI 多次 TLS handshake timeout，但同一已登录账号通过 Python 标准库 HTTPS 的 GitHub REST 查询成功。必要时按官方 REST 完成同一仓库的 Release / 资产操作；凭据仅在内存中使用，不修改系统代理或 TLS 校验。写入未知结果先回读再重试。
- 最终追加验证通过：94 个 Node 测试、10 个 Python 测试、32 项 JavaScriptCore 检查；五包重新构建后逐字节一致。五个云端模型基线共 30 次请求全部返回可解析 OCR 文字；两个 DeepSeek 的关闭思考组各 6 次也全部成功，字符差异总数分别由 14/16 降为 9/9（各比较 741 个非空白字符）。性能测量包括网络等待，不据此承诺固定响应时间。
- Bob 运行态核对发现当前 OCR 服务保存在 `Preference_ocrGeneralServiceInfos`；旧 `Preference_ocrServiceInfos` 可与界面不一致。备份、昵称、模型与密钥保留检查必须对照当前界面与 General 组，不能仅凭旧数组判定用户改动。两组本次 Roboflow Key 比对一致，原 API 实测仍有效；已补建当前 General 组的受保护恢复快照，旧域未写入。
- Bob 为新增菜单提供默认显示值；旧 Workflow ID 会保留在可选字段中。公开说明改为“默认 GLM-OCR；继续使用旧工作流时选择自定义”，不把底层缺失字段兼容测试冒称宿主菜单迁移验证。

## 0.6.0 发布与本机记录

- 发布源码与 annotated tag：`08b5b29ba45834903e552b58ccf52a16aa5f5f58` / `v0.6.0`。CI `40805037740` 的 `verify`、`jscore` 均成功。
- Release `427397305` 已发布并确认为 latest；五种 `.bobplugin` 与 `SHA256SUMS` 六个公开下载均逐字节及 SHA256 校验。标准包 SHA256：`2af97a43e5a0c492b073bb271b65d5f79bf99f875d10c52b62b12b25ba961490`。
- 本机 Bob 原生界面显示 0.6.0 安装成功；已安装 16 个文件与同一标准包逐一匹配。通过模型菜单切换 Qwen3.5 2B 后原生验证成功，最后明确保存 GLM-OCR 并再次验证成功；Private Key、名称、其他供应商选择及启用状态均保留。
- 连续点击菜单项和保存可能在菜单绑定尚未完成时保存旧值。必须先读回菜单当前状态，再独立保存并检查保存按钮禁用及 `Preference_ocrGeneralServiceInfos` 的实际值；“保存成功”提示或草稿验证成功不足以证明已落盘。
- 发布后观察会话中断、原 exec ID 失效；先回读 Release ID、draft/latest 与资产完成状态，确认已发布后继续公开下载校验，没有重复创建或重新上传。
- 标准 appcast 在公开下载校验通过后才加入 0.6.0。发布后的更新源与记录提交不移动 tag、不重建已发布包。

## 0.6.1 发布范围与验收

- 本轮交付 PP-OCR 坐标缩进恢复与实际默认指令预填。默认 GLM-OCR、单一 Roboflow 入口和共享 Key 保留。
- 回归同一两张图，各模型六次；满页一致仍为 3/6，GLM 字符混淆必须作为未改善的模型限制披露。不得把缩进恢复宣称为字符准确率提升，不修改原图或参考文本来放宽门槛。
- 保留失败实验：GLM 原始任务 3 处差异、官方任务 3 处、短精准提示 3 处；结构化提取漏正文；无损裁白边增加到 4 处差异。未采用无证据收益的请求或裁切改动。
- PP 缩进恢复只使用同一响应的几何信息；真实响应离线回归与在线三轮均确认字符保持原样、代码缩进由 0/3 改善到 3/3。无额外识别调用，本地处理该响应约 0.06 毫秒。
- 用户指出默认指令框空白会误导。标准安装清单必须包含完整 defaultValue，已有空值/历史默认实际回填并保存；只读回占位文本不足以验收。自定义内容不覆盖。
- Bob 没有打开偏好设置时，界面工具可能只返回空系统对话框和 1px 截图；不能据此断言锁屏。经 Bob 应用菜单的 Preferences 打开设置后恢复正常读取，按真实窗口继续操作。
- 发布前本地门禁通过：98 个 Node 测试、10 个 Python 测试、34 项 JavaScriptCore 检查及五包源码字节比对。相同原图的最终候选共 12 次识别均返回 HTTP 200；GLM 与 PP 全页字符一致均为 3/6，PP 代码缩进保留为 3/3。
- 用户追问微软是否受通用提示词影响，发现 native config 曾误做大模型指令长度和细节校验。请求正文原本不含提示词，但异常字段可能在本地误挡 Azure/Mistral；新增失败回归后按 providerCloud 模式隔离，保留大模型自身的参数保护，更新连接区与专用字段说明。
- 追加参数隔离回归后，101 个 Node 测试、10 个 Python 测试全部通过；JavaScriptCore 的 Azure/Mistral 链路直接带入超长指令和无效大模型设置验证仍能执行原生 OCR，共 34 项检查通过。

## 0.6.1 发布与本机记录

- 发布源码与 annotated tag：`9f66e144b9dce6c5e8f17efce8012090a23c78cb` / `v0.6.1`。CI `40815444961` 的 `verify`、`jscore` 均成功。
- Release `427456744` 已于 2026-10-29 UTC 发布并确认为 latest；五种 `.bobplugin` 与 `SHA256SUMS` 六个公开下载均逐字节及 SHA256 校验。标准包 SHA256：`5c2e44faf153c9b7bdd2e2c41039a3cd393045412812959de4209f5bbf3598a9`。
- Bob 原生界面确认 0.6.0 → 0.6.1 替换成功；已安装 17 个文件与同一标准包逐一匹配。免费额度检查 `underCap=true` 后，默认 GLM-OCR 在 Bob 验证成功。
- 四个已有服务的空白/历史默认指令已实际回填、保存；新标签和完整正文由原生界面回读，并检查当前 General 配置组。除 `cloudPrompt` 外没有字段变化，密钥、模型、名称、服务顺序和启用状态保留；Roboflow 保存值仍为 `glm-ocr`。
- PP-OCR 的可测量缩进改善与 GLM 字符限制分别报告。两者同图整页字符一致仍为 3/6，不将局部修复包装为所有字符误认已解决。微软参数隔离本轮由源码与 Node/JavaScriptCore 回归验证，未新增真实 Azure 付费识别。
- 公开下载校验完成后才将 0.6.1 加入标准 appcast；发布后的更新源与记录提交不移动 tag、不重建已发布包。本机需要回退时可重新安装已校验的 0.6.0 标准包。

## 0.6.2 发布范围与门禁

- 真实 Haiku 回包中的 HTML 表格完整、Python 行首缩进正确；旧解析先拆行，再逐行转换表格并删除行首空白，导致结束标签残留和代码缩进丢失。此前只测单行 HTML 表格不足以发现这一组合问题。
- 先加入真实回包夹具；旧候选在格式回归中失败，再修复完整表格转换、代码围栏与缩进保留。多个表格、前后段落、Tab、代码中的字面 HTML、不匹配围栏、输出上限与内部标记不外泄均须覆盖。
- OpenDocRouter 专用解析器标记已转换的纯文本，阻止公共结果层再次把代码里的 HTML 当成表格；其他供应商继续原路径。接口、模型、Key、缓存和计费参数不变，不增加识别请求。
- 用户要求与前轮相同两张图各测两轮；固定原图 SHA 和参考文本，保留原 0.6.1 基线，不用修后文本覆盖旧记录。先通过本地回归和 JavaScriptCore，再从最终候选运行四次真实调用，检查 HTML 残留、代码缩进、表格列和完整返回耗时。
- 发布前版本源、提交、五包字节和 CI 必须一致；本机经 Bob 原生安装后逐文件比对，回读当前 General 配置确认模型、密钥、昵称、启用状态均保留。更新源继续在公开下载校验后更新。
- 最终本地检查通过：107 个 Node 测试、10 个 Python 测试、39 项 JavaScriptCore。原两图各两次真实调用全部成功；复杂图 HTML 残留 2/2 → 0/2，代码缩进 0/2 → 2/2，表格分列 0/2 → 2/2，整图字符一致仍为 2/4。完整返回中位数 4.03 → 3.99 秒，不将网络波动包装为解析器加速。

## 0.6.2 发布与本机记录

- 发布源码与 annotated tag：`b9714b2e05008534f941f13211fa6273c8aeda10` / `v0.6.2`；CI `40842192719` 的 `verify` 与 `jscore` 均成功。
- Release `427615754` 于 2026-10-29 UTC 发布并确认为 latest；五个插件包与 `SHA256SUMS` 六个公开下载均逐字节及 SHA256 核对。标准包 SHA256：`e9102c957f642e52f57fa168b5870f02f0a528bac26a7e84a03763119c4f543c`。
- 本机 Bob 原生界面确认 0.6.1 → 0.6.2 安装成功，17 个安装文件与标准包完全一致。OpenDocRouter Haiku 服务的原生按钮验证成功；当前 General 配置组与安装前逐项相同，模型、密钥、服务名称和启用状态均保留。
- 保存本轮配置恢复点并验证旧插件恢复包；受管配置备份只保留最新两份，过期的配置备份和 0.5.3 恢复包移入可恢复废纸篓，父目录身份保持。当前插件恢复入口为已校验的 0.6.1 公开下载包，另保留 0.6.0 恢复包。
- 标准 appcast 在六个公开下载核对后才加入 0.6.2；后续元数据提交不移动 tag，不重建或覆盖已发布资产。

## 0.6.3 坐标支持范围与门禁

- 接入 Mistral OCR 4.x 块坐标、Roboflow PP-OCR 行坐标和 OpenDocRouter `layout.elements` 坐标；`supportBoundingBox()` 只对能稳定提供坐标的服务声明 true。
- OpenDocRouter 由 `layout=false` 改为 `layout=true`，保留 `sync`、`cache=false`；布局字段可能增加少量响应和费用，必须在请求回归中核对。
- GLM-OCR、通用视觉模型、Qwen 和自定义 Workflow 仍不得声明坐标支持；不能用文本长度或行号猜测图片位置。
- 门禁至少覆盖：Bob 归一化四点、Mistral block 坐标、PP-OCR 预测框合并、OpenDocRouter layout 元素行范围、多页隔离、缺坐标回退、原图翻译服务能力矩阵；完成后再打包、安装和发布。

## 0.6.3 发布与本机记录

- 发布源码与 annotated tag：`736b8bbce05b065e9b2b43609d197061018e0491` / `v0.6.3`；CI `40920701665` 的 `verify` 与 `jscore` 均成功。
- Release `428183209` 于 2026-10-29 UTC 发布并确认为 latest；五个 `.bobplugin` 和 `SHA256SUMS` 六个公开下载均逐字节及 SHA256 核对。标准包 SHA256：`01b6f2229ba40a35b0ea8d839023e4d95840fd21a03b7fea26c67e8a63bbfb4`。
- 本机 Bob 原生界面确认 0.6.2 → 0.6.3 安装成功；17 个安装文件与标准包一致，OCR General 配置组与安装前逐项相同。OpenDocRouter 配置界面回读为“启用布局坐标以支持原图翻译”。
- 本轮验证通过 116 个 Node、10 个 Python、43 项 JavaScriptCore；没有新增真实付费 OCR 请求，坐标路径使用官方响应夹具和协议回归验证。Mistral、PP-OCR、OpenDocRouter 的原图坐标支持已接入；GLM/Qwen/通用视觉模型仍保持普通 OCR。
- 六个公开资产下载校验后才将 0.6.3 写入 appcast；后续元数据提交不移动 tag、不覆盖已发布资产。本机回退可重新安装已校验的 0.6.2 包。
