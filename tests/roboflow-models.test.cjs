const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, query, ok } = require("./helpers.cjs");

const models = [
  ["glm-ocr", "/infer/lmm"],
  ["pp-ocr-small", "/ocr/pp-ocr", "small-small"],
  ["pp-ocr-tiny", "/ocr/pp-ocr", "tiny-tiny"],
  ["pp-ocr-medium", "/ocr/pp-ocr", "medium-medium"],
  ["qwen3vl-2b-instruct", "/infer/lmm"],
  ["qwen3_5-0.8b", "/infer/lmm/qwen3_5-0.8b"],
  ["qwen3_5-2b", "/infer/lmm/qwen3_5-2b"],
  ["qwen3_5-4b", "/infer/lmm/qwen3_5-4b"],
];

for (const [model, endpoint, ppVersion] of models) {
  test("Roboflow selection sends the screenshot directly to " + model, () => {
    const p = load({
      serviceMode: "roboflow", roboflowApiKey: "same-private-key",
      roboflowModel: model, roboflowWorkflowId: "old-custom-workflow",
    }, { request(r) { r.handler(ok(ppVersion ? { result: "中文 OCR 123" } : { response: "中文 OCR 123" })); } });
    const q = query(); p.ocr(q.value, q.done);
    assert.equal(p.requests.length, 1);
    const r = p.requests[0];
    assert.equal(r.url, "https://serverless.roboflow.com" + endpoint);
    assert.equal(r.header.Authorization, "Bearer same-private-key");
    assert.equal(r.body.api_key, undefined);
    assert.equal(r.body.image.type, "base64");
    assert.equal(r.body.image.value, q.value.image.toBase64());
    assert.equal(q.completions[0].result.texts[0].text, "中文 OCR 123");
    if (ppVersion) {
      assert.equal(r.body.pp_ocr_version_id, ppVersion);
      assert.equal(r.body.prompt, undefined);
      assert.equal(r.body.model_id, undefined);
    } else {
      assert.equal(r.body.model_id, model);
      assert.equal(r.body.max_new_tokens, 2048);
      assert.equal(r.body.prompt, model === "glm-ocr" ? "OCR" : p.module("config").defaultPrompt);
      if (model.startsWith("qwen3_5-")) assert.equal(r.body.enable_thinking, false);
    }
  });
}

test("Roboflow model menu defaults to GLM-OCR and shares a single secure key", () => {
  const info = require("../info.json");
  const entries = info.options.filter(o => o.identifier.startsWith("roboflow"));
  const menu = entries.find(o => o.identifier === "roboflowModel");
  assert.equal(menu.type, "menu");
  assert.equal(menu.defaultValue, "glm-ocr");
  assert.deepEqual(menu.menuValues.filter(o => o.value !== "custom").map(o => o.value), models.map(o => o[0]));
  assert.equal(entries.filter(o => /ApiKey$/.test(o.identifier)).length, 1);
});

test("Roboflow custom selection requires a Workflow ID and keeps legacy IDs", () => {
  const p = load({serviceMode:"roboflow", roboflowApiKey:"fixture-key", roboflowModel:"custom", roboflowWorkflowId:""});
  const q = query(); p.ocr(q.value, q.done);
  assert.equal(p.requests.length, 0);
  assert.match(q.completions[0].error.message, /Workflow/);
  const old = load({serviceMode:"roboflow", roboflowApiKey:"fixture-key", roboflowWorkflowId:"my-workflow"});
  const request = query(); old.ocr(request.value, request.done);
  assert.match(old.requests[0].url, /\/workflows\/my-workflow$/);
});

test("unknown Roboflow menu selections and custom path injection never make a request", () => {
  for (const options of [{roboflowModel:"unknown"}, {roboflowModel:"custom", roboflowWorkflowId:"../private?api_key=bad"}]) {
    const p = load({serviceMode:"roboflow", roboflowApiKey:"fixture-key", ...options});
    const q = query(); p.ocr(q.value, q.done);
    assert.equal(p.requests.length, 0);
    assert.equal(q.completions[0].error.type, "param");
  }
});

test("native Roboflow denial uses provider guidance and never switches models or retries", () => {
  const p = load({serviceMode:"roboflow",roboflowApiKey:"fixture-key",roboflowModel:"pp-ocr-small"}, {
    request(r) {r.handler(ok({message:"Denied fixture-key"},403));}
  });
  const q=query();p.ocr(q.value,q.done);
  assert.equal(p.requests.length,1);
  assert.equal(q.completions.length,1);
  assert.equal(q.completions[0].error.addition.statusCode,403);
  assert.match(q.completions[0].error.message,/Roboflow/);
  assert.doesNotMatch(q.completions[0].error.message,/Endpoint|资源类型|fixture-key/);
});
