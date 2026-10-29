const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Data, load, query, ok } = require("./helpers.cjs");

test("legacy Roboflow mode sends the documented native LMM request", () => {
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
    roboflowApiKey: "workflow-key",
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

test("the standard unified Roboflow entry routes a custom ID to Workflow", () => {
  const p = load({
    serviceMode: "roboflow",
    roboflowApiKey: "workflow-key",
    roboflowWorkflowId: "my-custom-ocr",
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests[0].url, "https://serverless.roboflow.com/ashers-workspace-u0hh3/workflows/my-custom-ocr");
  assert.equal(p.requests[0].body.api_key, "workflow-key");
  assert.equal(p.requests[0].body.inputs.image.type, "base64");
});

test("the single Roboflow field routes glm-ocr to the native model endpoint", () => {
  const p = load({
    serviceMode: "roboflow",
    roboflowApiKey: "model-key",
    roboflowWorkflowId: "glm-ocr",
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests[0].url, "https://serverless.roboflow.com/infer/lmm");
  assert.equal(p.requests[0].header.Authorization, "Bearer model-key");
  assert.equal(p.requests[0].body.model_id, "glm-ocr");
});

test("a blank unified Roboflow model keeps the legacy GLM-OCR default", () => {
  const p = load({ serviceMode: "roboflow", roboflowApiKey: "model-key" });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests[0].url, "https://serverless.roboflow.com/infer/lmm");
  assert.equal(p.requests[0].body.model_id, "glm-ocr");
});

test("Roboflow Workflow automatically extracts common output text", () => {
  const p = load({
    serviceMode: "roboflowWorkflow",
    roboflowApiKey: "workflow-key",
    roboflowWorkflowId: "claude-haiku-5-5-ocr",
  }, {
    request(r) {
      r.handler(ok({ outputs: [{ text: "First line\nSecond line" }] }));
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.deepEqual(Array.from(q.completions[0].result.texts, (x) => x.text), ["First line", "Second line"]);
  assert.equal(p.requests[0].body.inputs.image.type, "base64");
});

test("Roboflow Workflow always sends the current screenshot as Base64", () => {
  const p = load({
    serviceMode: "roboflowWorkflow",
    roboflowApiKey: "workflow-key",
    roboflowWorkflowId: "claude-haiku-5-5-ocr",
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests[0].body.inputs.image.type, "base64");
  assert.equal(p.requests[0].body.inputs.image.value, q.value.image.toBase64());
});

test("Roboflow model-step 403 reports the workflow failure without blaming a valid key", () => {
  const options = {
    serviceMode: "roboflow",
    roboflowApiKey: "fixture-key",
    roboflowWorkflowId: "gpt-6-1-terra-ocr",
  };
  const saved = JSON.stringify(options);
  const p = load(options, {
    request(r) {
      r.handler(ok({
        message: "Forbidden error occurred while execution of step model fixture-key",
        error_type: "ClientCausedStepExecutionError",
        inner_error_type: "RoboflowAPIForbiddenError",
        context: "workflow_execution | step_execution",
        blocks_errors: [{ block_id: "model" }],
      }, 403));
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  const e = q.completions[0].error;
  assert.equal(e.type, "api");
  assert.equal(e.addition.statusCode, 403);
  assert.match(e.message, /model/);
  assert.match(e.message, /付费工作区/);
  assert.doesNotMatch(e.message, /资源类型|Endpoint|fixture-key/);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].body.api_key, "fixture-key");
  assert.equal(p.requests[0].url, "https://serverless.roboflow.com/ashers-workspace-u0hh3/workflows/gpt-6-1-terra-ocr");
  assert.equal(JSON.stringify(options), saved);
});

test("Roboflow's explicit managed-OpenAI plan denial becomes an actionable message", () => {
  const p = load({
    serviceMode: "roboflow",
    roboflowApiKey: "fixture-key",
    roboflowWorkflowId: "custom-ocr",
  }, {
    request(r) {
      r.handler(ok({ error: "Roboflow-managed OpenAI API keys are only available to workspaces on a paid plan. Provide your own OpenAI API key, or upgrade your plan." }, 403));
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(q.completions[0].error.type, "api");
  assert.match(q.completions[0].error.message, /付费工作区/);
  assert.match(q.completions[0].error.message, /自己的 OpenAI Key/);
  assert.equal(p.requests.length, 1);
});

test("a Roboflow entry authentication failure remains distinct from a model-step denial", () => {
  const p = load({
    serviceMode: "roboflow",
    roboflowApiKey: "fixture-key",
    roboflowWorkflowId: "custom-ocr",
  }, {
    request(r) { r.handler(ok({ message: "Invalid API key fixture-key" }, 401)); },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(q.completions[0].error.type, "secretKey");
  assert.match(q.completions[0].error.message, /Roboflow/);
  assert.doesNotMatch(q.completions[0].error.message, /付费工作区|资源类型|fixture-key/);
  assert.equal(p.requests.length, 1);
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
