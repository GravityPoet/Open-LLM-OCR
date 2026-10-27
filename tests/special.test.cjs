const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Data, load, query, ok } = require("./helpers.cjs");

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

test("Roboflow Workflow sends api_key in the body and supports Base64 input", () => {
  const p = load({
    serviceMode: "roboflowWorkflow",
    roboflowWorkflowApiKey: "workflow-key",
    roboflowWorkflowWorkspace: "ashers-workspace-u0hh3",
    roboflowWorkflowId: "claude-haiku-5-5-ocr",
  });
  const q = query();
  p.ocr(q.value, q.done);
  const r = p.requests[0];
  assert.equal(r.url, "https://serverless.roboflow.com/ashers-workspace-u0hh3/workflows/claude-haiku-5-5-ocr");
  assert.equal(r.header.Authorization, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(r.body)), {
    api_key: "workflow-key",
    inputs: { image: { type: "base64", value: q.value.image.toBase64() } },
  });
});

test("Roboflow Workflow supports URL input and explicit output paths", () => {
  const p = load({
    serviceMode: "roboflowWorkflow",
    roboflowWorkflowApiKey: "workflow-key",
    roboflowWorkflowImageUrl: "https://example.com/sample.png",
    roboflowWorkflowOutputPath: "outputs[0].text",
  }, {
    request(r) {
      r.handler(ok({ outputs: [{ text: "First line\nSecond line" }] }));
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.deepEqual(Array.from(q.completions[0].result.texts, (x) => x.text), ["First line", "Second line"]);
  assert.equal(p.requests[0].body.inputs.image.value, "https://example.com/sample.png");
});

test("Roboflow Workflow rejects a non-HTTPS image URL", () => {
  const p = load({
    serviceMode: "roboflowWorkflow",
    roboflowWorkflowApiKey: "workflow-key",
    roboflowWorkflowImageUrl: "http://example.com/sample.png",
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests.length, 0);
  assert.match(q.completions[0].error.message, /https 图片地址/);
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

test("OpenDocRouter sends PDF MIME and the configured page range", () => {
  const p = load({
    serviceMode: "openDocRouter",
    openDocRouterApiKey: "fixture-key",
    openDocRouterMaxPages: "12",
  });
  const q = query(
    new Data(Buffer.from("%PDF-1.7\\nfixture", "utf8")),
  );
  p.ocr(q.value, q.done);
  const r = p.requests[0];
  assert.equal(r.body.document.mime_type, "application/pdf");
  assert.equal(r.body.pages, "1-12");
  assert.equal(r.body.document.pages, undefined);
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

test("OpenDocRouter removes generated Markdown heading markers from OCR fallback text", () => {
  const p = load();
  const items = p.module("special").openDocItems(
    { pages: [{ markdown: "## 管理Notion笔记\n普通文字\n### 第二行" }] },
    {},
  );
  assert.deepEqual(JSON.parse(JSON.stringify(items.map((x) => x.text))), ["管理Notion笔记", "普通文字", "第二行"]);
});

test("OpenDocRouter keeps hashes that are not Markdown headings", () => {
  const p = load();
  const items = p.module("special").openDocItems(
    { pages: [{ markdown: "##NoSpace\n#123\n# 标题" }] },
    {},
  );
  assert.deepEqual(JSON.parse(JSON.stringify(items.map((x) => x.text))), ["##NoSpace", "#123", "标题"]);
});

test("OpenDocRouter exposes page-level provider failures instead of reporting empty OCR", () => {
  const p = load();
  assert.throws(
    () => p.module("special").openDocFailure({
      status: "failed",
      pages: [
        {
          page: 1,
          status: "error",
          error: { code: "provider_error", message: "invalid x-api-key" },
        },
      ],
    }),
    /OpenDocRouter 识别失败（第 1 页）：provider_error: invalid x-api-key/,
  );
});

test("OpenDocRouter accepts completed and partial page responses", () => {
  const p = load();
  assert.doesNotThrow(() =>
    p.module("special").openDocFailure({
      status: "completed",
      pages: [{ page: 1, status: "ok", markdown: "OCR" }],
    }),
  );
  assert.doesNotThrow(() =>
    p.module("special").openDocFailure({
      status: "partial",
      pages: [{ page: 1, status: "ok", markdown: "OCR" }],
    }),
  );
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
