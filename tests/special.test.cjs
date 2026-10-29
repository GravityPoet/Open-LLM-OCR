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

test("OpenDocRouter sends sync, cache false, layout true and base64 document", () => {
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
  assert.equal(r.body.layout, true);
  assert.equal(r.body.document.data, q.value.image.toBase64());
  assert.equal(r.body.document.mime_type, "image/png");
  assert.equal(r.body.pages, undefined);
});

test("OpenDocRouter converts official layout elements into normalized line boxes", () => {
  const p = load();
  const items = p.module("special").openDocItems({
    pages: [{
      page: 1,
      status: "ok",
      markdown: "标题\n\n正文第一行\n正文第二行",
      layout: {
        status: "ok",
        width: 1000,
        height: 500,
        elements: [
          { type: "title", lines: [0, 0], boxes: [{ x: 0.1, y: 0.05, w: 0.3, h: 0.08 }] },
          { type: "text", lines: [2, 3], boxes: [{ x: 0.2, y: 0.2, w: 0.5, h: 0.18 }] },
        ],
      },
    }],
  }, {});
  assert.equal(JSON.stringify(items.map((item) => item.text)), JSON.stringify(["标题", "", "正文第一行\n正文第二行"]));
  assert.equal(items[0].boundingBox.points[0].x, 0.1);
  assert.equal(items[2].boundingBox.points[2].y, 0.38);
});
test('OpenDocRouter layout preserves uncovered text and uses existing table and code cleanup',()=>{
  const p=load(),markdown='before\n## Title\n\n```python\n    # comment\n    return 1\n```\n<table><tr><td>A</td><td>B</td></tr></table>\nafter';
  const data={pages:[{markdown,layout:{status:'ok',elements:[
    {type:'title',lines:[1,1],boxes:[{x:.1,y:.1,w:.4,h:.1}]},
    {type:'code',lines:[3,6],boxes:[{x:.1,y:.3,w:.4,h:.2}]},
    {type:'table',lines:[7,7],boxes:[{x:.1,y:.6,w:.4,h:.1}]}
  ]}}]};
  const result=p.module('result').build(p.module('special').openDocItems(data,{}),{});
  assert.equal(result.texts.map(t=>t.text).join('\n'),'before\nTitle\n\n    # comment\n    return 1\nA\tB\nafter');
  assert.equal(result.texts.filter(t=>t.boundingBox).length,3);
});
test('OpenDocRouter invalid or overlapping ranges fall back to complete text without guessed positions',()=>{
  const p=load(),markdown='one\ntwo\nthree';
  for(const ranges of [[[0.5,1]],[[0,'1']],[[0,1],[1,2]]]){
    const items=p.module('special').openDocItems({pages:[{markdown,layout:{status:'ok',elements:ranges.map(lines=>({lines,boxes:[{x:.1,y:.1,w:.4,h:.1}]}))}}]},{});
    assert.equal(items.map(t=>t.text).join('\n'),markdown);
    assert.ok(items.every(t=>!t.boundingBox));
  }
});
test('OpenDocRouter multi-page and ambiguous multi-box results retain text without combining page or column positions',()=>{
  const p=load(),a={markdown:'one',layout:{status:'ok',elements:[{lines:[0,0],boxes:[{x:.1,y:.1,w:.2,h:.1},{x:.6,y:.1,w:.2,h:.1}]}]}};
  assert.equal(p.module('special').openDocItems({pages:[a]},{}).filter(t=>t.boundingBox).length,0);
  const b={markdown:'two',layout:{status:'ok',elements:[{lines:[0,0],boxes:[{x:.1,y:.2,w:.4,h:.1}]}]}};
  const items=p.module('special').openDocItems({pages:[a,b]},{});
  assert.equal(items.map(t=>t.text).join('\n'),'one\n\ntwo');
  assert.ok(items.every(t=>!t.boundingBox));
});
test('OpenDocRouter keeps unwrapped code content and rejects invalid or rotated boxes without changing text',()=>{
  const p=load();
  for(const box of [{x:NaN,y:.1,w:.4,h:.1},{x:.9,y:.1,w:.4,h:.1},{x:.1,y:.1,w:.4,h:.1,r:30}]){
    const items=p.module('special').openDocItems({pages:[{markdown:'    <td>literal</td>',layout:{status:'ok',elements:[{type:'code',lines:[0,0],boxes:[box]}]}}]},{});
    const output=p.module('result').build(items,{});
    assert.equal(output.texts[0].text,'    <td>literal</td>');
    assert.equal(output.texts[0].boundingBox,undefined);
  }
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
