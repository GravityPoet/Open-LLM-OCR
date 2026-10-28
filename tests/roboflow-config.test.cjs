const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, query } = require("./helpers.cjs");

test("Roboflow uses text recognition despite a saved legacy task override", () => {
  const p = load({
    serviceMode: "roboflow",
    roboflowApiKey: "fixture-key",
    roboflowPrompt: "Table Recognition:",
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].body.prompt, "OCR");
});

test("the manifest exposes a separate configurable Roboflow Workflow service", () => {
  const info = require("../info.json");
  const mode = info.options.find((option) => option.identifier === "serviceMode");
  assert.ok(mode.menuValues.some((value) => value.value === "roboflowWorkflow"));
  assert.ok(info.options.some((option) => option.identifier === "roboflowWorkflowId"));
  assert.ok(info.options.some((option) => option.identifier === "roboflowApiKey"));
  assert.equal(info.options.some((option) => option.identifier === "roboflowWorkflowInputType"), false);
  assert.equal(info.options.some((option) => option.identifier === "roboflowWorkflowOutputPath"), false);
  const key = info.options.find((option) => option.identifier === "roboflowApiKey");
  assert.equal(key.textConfig.type, "secure");
  assert.equal(info.options.some((option) => option.identifier === "roboflowWorkflowWorkspace"), false);
  assert.equal(info.options.some((option) => option.identifier === "roboflowWorkflowImageUrl"), false);
});
