# Docker CPU 部署

对应 GitHub issue #2。从仓库根目录执行；需要已经安装并运行的 Docker Engine/Compose，首次安装 Paddle 和下载模型需要网络与磁盘空间。

```bash
bash server/scripts/download_ppocrv5_server_models.sh
docker compose -f server/compose.yaml build
docker compose -f server/compose.yaml up -d
curl --fail --max-time 5 http://127.0.0.1:50000/healthz
```

Bob 填 `http://127.0.0.1:50000/ocr`。首次加载模型可能较慢，健康检查预留 180 秒启动时间；查看 `docker compose -f server/compose.yaml logs --tail=50`，不要仅凭容器进程存在断言 OCR 可用。最终在 Bob 点击“验证”，必须正确识别内置样例。

容器内部监听 50000，宿主只映射 `127.0.0.1:50000`；远程机器通过 SSH 隧道访问。模型目录只读挂载，替换模型需要与所选检测/识别模型名称配套。镜像沿用仓库已有 PaddlePaddle 3.2.2、PaddleOCR 3.4.0、PaddleX 3.4.1 组合，未自动升级推理依赖。

当前开发主机没有 Docker CLI，本次只完成配置与服务代码检查；首次部署需实际完成上述构建、健康与图片识别验收。
