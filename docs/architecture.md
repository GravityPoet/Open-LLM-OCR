# 0.4.0 架构与维护

`main.js` 暴露 Bob 入口；`lib/service.js` 校验配置、选择适配器、收口结果。`config.js` 保留旧配置键，专用包仅切换默认服务身份。`runtime.js` 为每次调用独立持有截止时间、定时器、取消订阅和唯一完成状态；`url.js` 保留代理路径/query，并限制服务端返回的轮询或结果地址。

`azure.js`、`mistral.js`、`cloud.js`、`baidu.js` 分别实现协议；`result.js` 负责阅读顺序、空白保留、归一化坐标与结果上限。达到上限返回明确错误，不以截断正文冒充完整结果。普通调用只加载所选适配器。

`image.js` 只进行一次 Base64 转换，计算字节数和文件签名，将编码复用于请求。实机诊断证实本机 Bob 的 `$data` 有转换方法但没有数值 `.length`；不得把 Node 测试替身的长度属性当作所有 Bob 构建的契约。此路径有独立回归。

代码不记录密钥、截图或完整响应。测试/性能数据使用合成图片；不将账户参数放进发布资产。核心插件不依赖 Node、Python、浏览器或独立 App；Node 与 Python 只用于开发/可选本地服务。

## 验证与打包

- `npm run verify`：语法、版本、配置选项、Node 和 Python 回归、归档与源码一致性。
- `swift tests/jscore-smoke.swift .`：在 macOS JavaScriptCore 中执行适配器和回调夹具，不冒充 Bob GUI 或真实服务验收。
- `python3 scripts/build.py`：确定性 ZIP，只包含运行时白名单；标准、Azure、Mistral 包使用不同 identifier。
- 新候选安装前记录源码与包 SHA，保存旧插件归档和必要配置快照；配置与数据不提交仓库。
- 保留原标准插件名称与 identifier。可选精简包无自动更新源，避免被标准包覆盖。

## 已修复的问题与验收限制

- 验证按钮此前只请求模型列表；现在实际识别内置图片并检查文字。
- 默认端口不一致、长文本截断、前后空白/标签丢失、重复或迟到回调、错误完成状态、带 query 的端点被拼错、服务商字段混用、普通文本框误渲染成密码框均有对应修复。
- PaddleOCR-VL 使用通用聊天提示会生成错误文本；仅对已知模型和旧/新默认提示应用官方 `OCR:` 模板，自定义任务提示保留。
- Azure 初始 401 由资源类型和 API 不匹配引起；本次资源是 Document Intelligence，用其 Read 接口后成功。
- Mistral 真实识别遇到 429；用户取消在线验收。限流原因未被证明是余额，不作该因果断言。
- 最终额外在线/GUI 验收按用户要求停止。源码、打包、安装一致性和离线检查照常；不把此前中间候选的 GUI 结果记作最终通过。
- 本机无运行中的 Paddle 模型服务、无 Docker CLI；本次未部署远端服务。Docker/完整模型推理需在对应目标环境验收。


## OCR 设置布局（0.4.3）

Bob schema 没有条件显示或折叠组。标准 OCR 插件按供应商连续排序：OpenDocRouter、Roboflow、云端视觉模型/微软/Mistral、本地；标题使用供应商编号帮助用户识别字段归属。精简包继续提供单供应商设置入口。


当前服务名称使用 Bob `isKeyOption` 的动态默认名称映射，未自定义时显示 OpenDocRouter、Roboflow、本地、Azure、Mistral、视觉模型或百度；用户手动改名会保留。运行时只读取当前 `serviceMode` 对应的一组配置。


标准 manifest 已隐藏百度官方异步 OCR 入口，运行代码保留 cloudAsync 旧配置兼容读取。
