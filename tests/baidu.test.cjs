const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { load, query, ok } = require("./helpers.cjs");
const options = {
  serviceMode: "cloudAsync",
  accessToken: "fixture-token",
  asyncJsonDownloadStrategy: "directOnly",
};
const url = "https://example.bcebos.com/result?authorization=fixture";
const text = JSON.stringify({
  result: {
    layoutParsingResults: [{ text: "  A\nB", markdown: { text: "duplicate" } }],
    ocrResults: [{ rec_texts: ["duplicate"] }],
  },
});
test("Baidu submit, immediate poll and credential-free result download preserve content once", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        if (r.method === "POST") {
          assert.ok(r.files[0].data);
          assert.equal(r.body.model, "PaddleOCR-VL-1.5");
          r.handler(ok({ data: { jobId: "id" } }));
        } else if (r.url === url) {
          assert.equal(r.header, undefined);
          r.handler(ok(text));
        } else
          r.handler(
            ok({ data: { state: "done", resultUrl: { jsonUrl: url } } }),
          );
      },
    });
  p.ocr(q.value, q.done);
  assert.equal(
    q.completions[0].result.texts.map((x) => x.text).join("\n"),
    "  A\nB",
  );
  assert.equal(p.requests.length, 3);
});
test("Baidu pending cancellation stops subsequent polls", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        r.handler(
          ok({
            data: r.method === "POST" ? { jobId: "id" } : { state: "running" },
          }),
        );
      },
    });
  p.ocr(q.value, q.done);
  q.value.cancelSignal.send();
  p.advance(3000);
  assert.equal(p.requests.length, 2);
  assert.equal(q.completions.length, 1);
});
test("Baidu model fallback only follows explicit model rejection", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        if (p.requests.length === 1)
          r.handler(ok({ message: "模型传参错误" }, 400));
      },
    });
  p.ocr(q.value, q.done);
  assert.equal(p.requests[1].body.model, "PaddleOCR-VL");
  const b = query(),
    p2 = load(options, {
      request(r) {
        r.handler(ok({ error: { message: "unavailable" } }, 503));
      },
    });
  p2.ocr(b.value, b.done);
  assert.equal(p2.requests.length, 1);
});
test("Baidu 403 fallback uses existing local relay without forwarding access token", () => {
  const q = query(),
    p = load(
      { ...options, asyncJsonDownloadStrategy: "directThenRelay" },
      {
        request(r) {
          if (r.method === "POST") r.handler(ok({ data: { jobId: "id" } }));
          else if (r.url === url) r.handler(ok("Forbidden", 403));
          else if (r.url.includes("fetch-jsonl")) {
            assert.equal(r.header, undefined);
            assert.match(r.url, /url=https%3A/);
            r.handler(ok({ text }));
          } else
            r.handler(
              ok({ data: { state: "done", resultUrl: { jsonUrl: url } } }),
            );
        },
      },
    );
  p.ocr(q.value, q.done);
  assert.ok(q.completions[0].result);
});
test("Baidu malicious result URL is rejected before download", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        r.handler(
          ok({
            data:
              r.method === "POST"
                ? { jobId: "id" }
                : {
                    state: "done",
                    resultUrl: { jsonUrl: "https://attacker.example.com" },
                  },
          }),
        );
      },
    });
  p.ocr(q.value, q.done);
  assert.equal(p.requests.length, 2);
  assert.ok(q.completions[0].error);
});
test("Baidu malformed JSONL does not expose signed URL or partial output", () => {
  const p = load();
  assert.throws(
    () => p.module("baidu").jsonl(text + "\n{invalid", {}),
    /JSONL/,
  );
});
