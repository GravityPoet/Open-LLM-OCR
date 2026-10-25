const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { load, query, ok } = require("./helpers.cjs");
const options = {
  serviceMode: "azure",
  cloudBaseUrl: "https://example.cognitiveservices.azure.com",
  cloudApiKey: "fixture-key",
};
const location =
  "https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/fixture?api-version=2024-11-30";
const succeeded = {
  status: "succeeded",
  analyzeResult: {
    pages: [
      {
        width: 1000,
        height: 300,
        lines: [
          {
            content: "AZURE OCR TEST 123",
            polygon: [35, 35, 500, 35, 500, 80, 35, 80],
          },
        ],
      },
    ],
  },
};
test("Document Intelligence uses JSON base64, subscription key, 202 polling and normalized boxes", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        if (r.method === "POST") {
          assert.equal(r.header["Ocp-Apim-Subscription-Key"], "fixture-key");
          assert.equal(r.header.Authorization, undefined);
          assert.equal(r.body.base64Source, q.value.image.toBase64());
          assert.match(r.url, /prebuilt-read:analyze\?api-version=2024-11-30$/);
          r.handler(ok({}, 202, { "operation-location": location }));
        } else r.handler(ok(succeeded));
      },
    });
  p.ocr(q.value, q.done);
  assert.equal(q.completions.length, 0);
  p.advance(1000);
  assert.equal(q.completions[0].result.texts[0].text, "AZURE OCR TEST 123");
  assert.equal(q.completions[0].result.texts[0].boundingBox.points[0].x, 0.035);
  assert.equal(p.timers.size, 0);
  assert.equal(q.value.cancelSignal.size, 0);
});
test("Azure validation completes actual analysis and checks recognized sample", () => {
  const p = load(options, {
    request(r) {
      r.handler(
        r.method === "POST"
          ? ok({}, 202, { "Operation-Location": location })
          : ok(succeeded),
      );
    },
  });
  let value;
  p.validate((v) => (value = v));
  assert.equal(value, undefined);
  p.advance(1000);
  assert.equal(value.result, true);
});
test("Azure adapter accepts root, service path and full endpoint preserving proxy query", () => {
  const p = load();
  for (const path of [
    "",
    "/documentintelligence",
    "/documentintelligence/documentModels/prebuilt-read:analyze",
  ]) {
    assert.equal(
      p
        .module("azure")
        .endpoint("https://example.com/proxy" + path + "?tenant=fixture"),
      "https://example.com/proxy/documentintelligence/documentModels/prebuilt-read:analyze?tenant=fixture&api-version=2024-11-30",
    );
  }
});
for (const bad of [
  "https://attacker.example.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/x",
  "https://example.cognitiveservices.azure.com/other/path",
  "http://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read/analyzeResults/x",
])
  test("poll URL is rejected: " + bad, () => {
    const q = query(),
      p = load(options, {
        request(r) {
          r.handler(ok({}, 202, { "Operation-Location": bad }));
        },
      });
    p.ocr(q.value, q.done);
    assert.ok(q.completions[0].error);
    assert.equal(p.requests.length, 1);
  });
for (const value of ["failed", "canceled", "unknown"])
  test("terminal/unknown Azure state " + value + " never succeeds", () => {
    const q = query(),
      p = load(options, {
        request(r) {
          r.handler(
            r.method === "POST"
              ? ok({}, 202, { "Operation-Location": location })
              : ok({ status: value }),
          );
        },
      });
    p.ocr(q.value, q.done);
    p.advance(1000);
    assert.ok(q.completions[0].error);
  });
test("Azure waits Retry-After and shares deadline across polls", () => {
  const q = query(),
    p = load(
      { ...options, requestTimeoutSec: "5" },
      {
        request(r) {
          r.handler(
            r.method === "POST"
              ? ok({}, 202, {
                  "Operation-Location": location,
                  "Retry-After": "2",
                })
              : ok({ status: "running" }),
          );
        },
      },
    );
  p.ocr(q.value, q.done);
  p.advance(1000);
  assert.equal(p.requests.length, 1);
  p.advance(1000);
  assert.equal(p.requests.length, 2);
  assert.ok(p.requests[1].timeout <= 3);
  p.advance(3000);
  assert.ok(q.completions[0].error);
  assert.equal(p.timers.size, 0);
});
test("Azure cancel stops polls and late callbacks", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        r.handler(ok({}, 202, { "Operation-Location": location }));
      },
    });
  p.ocr(q.value, q.done);
  q.value.cancelSignal.send();
  p.advance(2000);
  assert.equal(p.requests.length, 1);
  assert.equal(q.completions.length, 1);
  assert.match(q.completions[0].error.message, /取消/);
});
test("Azure rejects wrong HTTP status and missing Operation-Location", () => {
  for (const resp of [ok({}, 200), ok({}, 202)]) {
    const q = query(),
      p = load(options, {
        request(r) {
          r.handler(resp);
        },
      });
    p.ocr(q.value, q.done);
    assert.ok(q.completions[0].error);
  }
});
test("Azure coordinate parsing avoids overlaying multiple document pages on one image", () => {
  const p = load(),
    d = JSON.parse(JSON.stringify(succeeded));
  d.analyzeResult.pages.push(d.analyzeResult.pages[0]);
  assert.equal(p.module("azure").parse(d, {}).length, 2);
  assert.equal(p.module("azure").parse(d, {})[0].boundingBox, undefined);
});
test("Azure rejects zero text and corrupt page data", () => {
  for (const d of [
    { status: "succeeded" },
    { status: "succeeded", analyzeResult: { pages: [] } },
  ]) {
    const q = query(),
      p = load(options, {
        request(r) {
          r.handler(
            r.method === "POST"
              ? ok({}, 202, { "Operation-Location": location })
              : ok(d),
          );
        },
      });
    p.ocr(q.value, q.done);
    p.advance(1000);
    assert.ok(q.completions[0].error);
  }
});
