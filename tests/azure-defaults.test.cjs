const { test } = require("node:test");
const assert = require("node:assert/strict");
const info = require("../info.json");
const { load, query } = require("./helpers.cjs");

test("Microsoft backup defaults use a full resource URL and native Read model", () => {
  const options = Object.fromEntries(
    info.options.map((option) => [option.identifier, option.defaultValue || ""]),
  );
  assert.equal(options.cloudBaseUrl, "https://msft01.cognitiveservices.azure.com/");
  assert.equal(options.cloudModel, "prebuilt-read");
  assert.equal(options.serviceMode, "azure");
  assert.equal(options.cloudApiKey, "");

  options.serviceMode = "azure";
  options.cloudApiKey = "fixture-key";
  const before = JSON.stringify(options), p = load(options), q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].url,
    "https://msft01.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30");
  assert.equal(p.requests[0].header["Ocp-Apim-Subscription-Key"], "fixture-key");
  assert.equal(p.requests[0].body.base64Source, q.value.image.toBase64());
  assert.equal(JSON.stringify(options), before);
});

test("Azure runtime defaults match the form and preserve explicitly saved endpoints", () => {
  const config = load().module("config");
  const defaults = config.read({ serviceMode: "azure", cloudApiKey: "fixture-key" }, info.identifier);
  assert.equal(defaults.url, "https://msft01.cognitiveservices.azure.com/");
  assert.equal(defaults.model, "prebuilt-read");
  const custom = config.read({ serviceMode: "azure", cloudApiKey: "fixture-key",
    cloudBaseUrl: "https://example.cognitiveservices.azure.com/", cloudModel: "legacy-vision-model" }, info.identifier);
  assert.equal(custom.url, "https://example.cognitiveservices.azure.com/");
  assert.equal(custom.model, "prebuilt-read");
});

test("Microsoft backup values do not send a Chat or Mistral request by mistake", () => {
  for (const serviceMode of ["providerCloud", "mistral"]) {
    const p = load({ serviceMode, cloudBaseUrl: "https://msft01.cognitiveservices.azure.com/",
      cloudApiKey: "fixture-key", cloudModel: "prebuilt-read", mistralModel: "custom" });
    const q = query();
    p.ocr(q.value, q.done);
    assert.equal(p.requests.length, 0);
    assert.match(q.completions[0].error.message, /微软 Document Intelligence/);
  }
});
