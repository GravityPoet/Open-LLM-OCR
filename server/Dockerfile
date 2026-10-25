FROM python:3.11-slim-bookworm
WORKDIR /app
# Matches the existing CPU deployment dependency set; models stay on a volume.
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 libgl1 curl \
    && python -m pip install --no-cache-dir paddlepaddle==3.2.2 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
    && python -m pip install --no-cache-dir paddleocr==3.4.0 paddlex==3.4.1
COPY server/ /app/server/
ENV HOST=0.0.0.0 PORT=50000 PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
EXPOSE 50000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:50000/healthz', timeout=3)"
CMD ["bash", "/app/server/scripts/start_ppocrv5_server.sh"]
