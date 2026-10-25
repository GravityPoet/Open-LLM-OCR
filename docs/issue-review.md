# GitHub issue 审核（2026-10-25）

## #1：默认端口不一致；更强的远程模型

[原 issue](https://github.com/GravityPoet/JK-LLM-OCR/issues/1)

确认问题成立：旧插件、systemd 和部分教程使用 50000，Python/启动脚本默认 8080，导致照教程启动后插件无法连接。现在 Python、Shell、systemd、Docker、README 均统一 50000。已有 `PORT=8080` 等显式设置仍有效；不要无提示改动用户正在运行的服务。

更强模型有两条独立路径：本地服务支持显式替换兼容的检测/识别模型目录；需要视觉大模型时使用“视觉大模型 API”连接 Mac mini 上已启动的 OpenAI 兼容视觉服务。PP-OCR 检测/识别模型与 PaddleOCR-VL 等生成式模型不能仅换目录就互相替代。通过 SSH 隧道连接，不将“本地模式”误说成远端图片不出机。

验证：端口一致性测试通过；实际正在运行的旧服务没有被改配置或重启。

## #2：Docker 部署示例

[原 issue](https://github.com/GravityPoet/JK-LLM-OCR/issues/2)

有价值的贡献：明确列出了 Linux CPU 依赖、持久模型目录和部署方法。旧示例采用 host 网络与所有网卡监听，并需要手动对齐端口。仓库现提供 `server/Dockerfile`、`server/compose.yaml` 与 `docs/docker.md`，默认只映射宿主回环地址，模型只读挂载，具备 HTTP 健康检查。

验收边界：本机没有 Docker CLI，未冒称镜像已构建或完整 Paddle 模型已运行。原 issue 没有被自动关闭，也未以用户身份发送回复。
