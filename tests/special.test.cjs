const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, query, ok } = require("./helpers.cjs");

test("Roboflow GLM-OCR sends the documented native LMM request", () => {
  const p = load({ serviceMode: "roboflow", roboflowApiKey: "fixture-key" });
  const q = query();
  p.ocr(q.value, q.done);
  const r = p.requests[0];
  assert.equal(r.url, "https://serverless.roboflow.com/infer/lmm");
  assert.equal(r.header.Authorization, "Bearer fixture-key");
  assert.deepEqual(JSON.parse(JSON.stringify(r.body)), {
    image: { type: "base64", value: q.value.image.toBase64() },
    model_id: "glm-ocr",
    prompt: "OCR",
    max_new_tokens: 2048,
  });
});

test("Roboflow response text becomes Bob OCR lines", () => {
  const p = load(
    { serviceMode: "roboflow", roboflowApiKey: "fixture-key" },
    {
      request(r) {
        r.handler(ok({ response: "One\nTwo" }));
      },
    },
  );
  const q = query();
  p.ocr(q.value, q.done);
  assert.deepEqual(
    Array.from(q.completions[0].result.texts, (x) => x.text),
    ["One", "Two"],
  );
});

test("OpenDocRouter sends sync, cache false, layout false and base64 document", () => {
  const p = load({
    serviceMode: "openDocRouter",
    openDocRouterApiKey: "fixture-key",
  });
  const q = query();
  p.ocr(q.value, q.done);
  const r = p.requests[0];
  assert.equal(r.url, "https://www.opendocrouter.ai/v1/parse");
  assert.equal(r.header.Authorization, "Bearer fixture-key");
  assert.equal(r.body.model, "llamaindex/ocria-1");
  assert.equal(r.body.mode, "sync");
  assert.equal(r.body.cache, false);
  assert.equal(r.body.layout, false);
  assert.equal(r.body.document.data, q.value.image.toBase64());
  assert.equal(r.body.document.mime_type, "image/png");
  assert.equal(r.body.pages, undefined);
});

test("OpenDocRouter preserves page markdown and page breaks", () => {
  const p = load();
  const items = p.module("special").openDocItems(
    {
      pages: [
        { index: 0, markdown: "One" },
        { index: 1, markdown: "Two" },
      ],
    },
    {},
  );
  assert.equal(items.map((x) => x.text).join("\n"), "One\n\nTwo");
});

test("Roboflow and OpenDocRouter reject missing keys before transport", () => {
  for (const serviceMode of ["roboflow", "openDocRouter"]) {
    const q = query();
    const p = load({ serviceMode });
    p.ocr(q.value, q.done);
    assert.equal(p.requests.length, 0);
    assert.ok(q.completions[0].error);
  }
});
