# JK-LLM-OCR 发布流程

此文件是仓库的发布步骤。普通提交与构建不创建 Release。

1. 明确用户授权的版本，保持 `package.json` / `info.json` 一致；使用当前分支，核对远端与 tag 冲突。
2. `npm run build`，再 `npm run verify` 与 macOS `swift tests/jscore-smoke.swift .`。保留真实业务验证的范围与用户明确豁免的验收项。
3. 记录候选 commit、源码指纹和三种 `.bobplugin` 包的 SHA256，检查包中无凭据、配置、work 文件。
4. 执行获授权的本机安装，逐文件比对安装内容；保留原有服务配置及恢复包。测试生成或改变候选时重建受影响产物。
5. 获授权发布时创建 `v<version>` annotated tag 和 Release，上传标准/Azure/Mistral 包及 SHA256 清单，下载后核对字节。
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
