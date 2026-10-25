const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, query, ok } = require("./helpers.cjs");
const options = {
  serviceMode: "providerCloud",
  cloudBaseUrl: "https://example.com/v1",
  cloudApiKey: "fixture-key",
  cloudModel: "vision-fixture",
};
test("query parameters stay after the complete endpoint", () => {
  const p = load({
    ...options,
    cloudBaseUrl: "https://example.com/proxy/v1?tenant=example",
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(
    p.requests[0].url,
    "https://example.com/proxy/v1/chat/completions?tenant=example",
  );
});
test("long OCR lines are preserved without silent truncation", () => {
  const text = "字".repeat(3000);
  const p = load(options, {
    request(r) {
      r.handler(
        ok({
          choices: [{ message: { content: text }, finish_reason: "stop" }],
        }),
      );
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(
    q.completions[0].result.texts.map((t) => t.text).join("\n"),
    text,
  );
});
test("truncated model output is an error rather than a successful OCR", () => {
  const p = load(options, {
    request(r) {
      r.handler(
        ok({
          choices: [
            { message: { content: "partial" }, finish_reason: "length" },
          ],
        }),
      );
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.ok(q.completions[0].error);
});
test("literal code markup from the source is not stripped", () => {
  const text = "  <think>literal example</think>\n    nested";
  const p = load(options, {
    request(r) {
      r.handler(
        ok({
          choices: [{ message: { content: text }, finish_reason: "stop" }],
        }),
      );
    },
  });
  const q = query();
  p.ocr(q.value, q.done);
  assert.equal(
    q.completions[0].result.texts.map((t) => t.text).join("\n"),
    text,
  );
});
test("validation calls the selected OCR model instead of GET models", () => {
  const p = load(options);
  p.validate(() => {});
  assert.equal(p.requests[0].method, "POST");
  assert.ok(p.requests[0].body.messages);
});
