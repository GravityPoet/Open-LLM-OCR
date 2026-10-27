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
