const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");

function capable(options) {
  return load(options).module("service").bounding();
}

test("coordinate-capable OCR modes declare original-image support", () => {
  assert.equal(capable({ serviceMode: "azure", cloudApiKey: "fixture-key" }), true);
  assert.equal(capable({ serviceMode: "local" }), true);
  assert.equal(capable({ serviceMode: "openDocRouter", openDocRouterApiKey: "fixture-key" }), true);
  assert.equal(capable({ serviceMode: "mistral", cloudApiKey: "fixture-key", mistralModel: "mistral-ocr-latest" }), true);
  assert.equal(capable({ serviceMode: "mistral", cloudApiKey: "fixture-key", mistralModel: "mistral-ocr-4-1" }), true);
  assert.equal(capable({ serviceMode: "roboflow", roboflowApiKey: "fixture-key", roboflowModel: "pp-ocr-medium" }), true);
  assert.equal(capable({ serviceMode: "roboflow", roboflowApiKey: "fixture-key", roboflowModel: "pp-ocr-small" }), true);
  assert.equal(capable({ serviceMode: "roboflowWorkflow", roboflowApiKey: "fixture-key", roboflowModel: "pp-ocr-tiny" }), true);
});

test("text-only OCR modes stay out of original-image translation", () => {
  assert.equal(capable({ serviceMode: "providerCloud", cloudBaseUrl: "https://example.com/v1", cloudApiKey: "fixture-key", cloudModel: "vision-model" }), false);
  assert.equal(capable({ serviceMode: "roboflow", roboflowApiKey: "fixture-key", roboflowModel: "glm-ocr" }), false);
  assert.equal(capable({ serviceMode: "roboflow", roboflowApiKey: "fixture-key", roboflowModel: "qwen3_5-2b" }), false);
  assert.equal(capable({ serviceMode: "mistral", cloudApiKey: "fixture-key", mistralModel: "custom", cloudModel: "custom-model" }), false);
});
