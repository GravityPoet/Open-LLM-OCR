// Explicit integration check. JSON options arrive on stdin; never print credentials.
const fs = require("node:fs");
const { load, Data } = require("../tests/helpers.cjs");
const options = JSON.parse(fs.readFileSync(0, "utf8"));
const started = Date.now(),
  requests = [];
const p = load(
  options,
  {
    request(r) {
      const began = Date.now();
      const abort = new AbortController();
      const sub = r.cancelSignal?.subscribe(() => abort.abort());
      fetch(r.url, {
        method: r.method,
        headers: r.header,
        body: r.body ? JSON.stringify(r.body) : undefined,
        redirect: "error",
        signal: AbortSignal.any([
          abort.signal,
          AbortSignal.timeout(Math.ceil(r.timeout * 1000)),
        ]),
      })
        .then(async (resp) => {
          const raw = await resp.text();
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
          requests.push({
            method: r.method,
            status: resp.status,
            ms: Date.now() - began,
          });
          r.handler({
            data,
            response: {
              statusCode: resp.status,
              headers: Object.fromEntries(resp.headers),
            },
          });
        })
        .catch(() => r.handler({ error: { message: "Live transport failed" } }))
        .finally(() => sub?.dispose());
    },
  },
  {
    $timer: {
      schedule(o) {
        return setTimeout(o.handler, o.interval * 1000);
      },
      invalidate(id) {
        clearTimeout(id);
      },
    },
  },
);
p.context.Date = Date;
if (process.argv[2]) {
  require("node:vm").runInContext(
    fs.readFileSync(process.argv[2], "utf8"),
    p.context,
  );
  p.ocr = p.context.ocr;
}
p.ocr(
  {
    image: new Data(
      fs.readFileSync(
        require("node:path").join(__dirname, "../ocr-sample.png"),
      ),
    ),
    from: "en",
    detectFrom: "en",
    pixelWidth: 1000,
    pixelHeight: 300,
  },
  (payload) => {
    const text = payload.result?.texts.map((t) => t.text).join("\n") || "";
    const passed =
      text.includes("AZURE OCR TEST 123") &&
      text.includes("42.50 EUR") &&
      text.includes("Open-LLM-OCR 2026");
    console.log(
      JSON.stringify({
        mode: options.serviceMode,
        elapsed_ms: Date.now() - started,
        passed,
        requests,
        lines: payload.result?.texts.length,
        boxes: payload.result?.texts.filter((t) => t.boundingBox).length,
        sample_text: text.slice(0, 800),
        error: payload.error?.message,
      }),
    );
    process.exitCode = passed ? 0 : 1;
  },
);
