const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { load, query, ok } = require("./helpers.cjs");
const base = {
  serviceMode: "providerCloud",
  cloudBaseUrl: "https://example.com/v1",
  cloudApiKey: "fixture-key",
  cloudModel: "vision-fixture",
};
for (const protocol of ["auto", "responses", "gemini", "anthropic"])
  test("native image request: " + protocol, () => {
    const p = load({ ...base, cloudProtocol: protocol });
    const q = query();
    p.ocr(q.value, q.done);
    const r = p.requests[0];
    assert.ok(r);
    assert.doesNotMatch(JSON.stringify(r.body), /temperature/);
    if (protocol === "responses") {
      assert.equal(r.body.store, false);
      assert.equal(r.body.input[0].content[1].type, "input_image");
    }
    if (protocol === "gemini")
      assert.ok(r.body.contents[0].parts[1].inlineData.data);
    if (protocol === "anthropic") {
      assert.equal(r.header["x-api-key"], "fixture-key");
      assert.equal(r.header.Authorization, undefined);
      assert.equal(r.body.messages[0].content[1].type, "image");
    }
  });
test("Google native endpoint uses key header and full endpoint overrides saved protocol", () => {
  const p = load({
      ...base,
      cloudBaseUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-example:generateContent",
    }),
    q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests[0].header["x-goog-api-key"], "fixture-key");
  assert.equal(p.requests[0].header.Authorization, undefined);
});
test("multiple concurrent requests keep their own state", () => {
  const p = load(base),
    a = query(),
    b = query();
  p.ocr(a.value, a.done);
  p.ocr(b.value, b.done);
  p.requests[1].handler(
    ok({ choices: [{ message: { content: "B" }, finish_reason: "stop" }] }),
  );
  a.value.cancelSignal.send();
  p.requests[0].handler(ok({ output_text: "late" }));
  assert.equal(b.completions[0].result.texts[0].text, "B");
  assert.equal(a.completions.length, 1);
  assert.ok(a.completions[0].error);
});
test("transport exceptions and duplicate handlers complete once", () => {
  const q = query(),
    p = load(base, {
      request() {
        throw Error("network failed");
      },
    });
  p.ocr(q.value, q.done);
  assert.equal(q.completions.length, 1);
  assert.equal(p.timers.size, 0);
  const q2 = query(),
    p2 = load(base, {
      request(r) {
        r.handler(ok({ output_text: "One" }));
        r.handler(ok({ output_text: "Two" }));
      },
    });
  p2.ocr(q2.value, q2.done);
  assert.equal(q2.completions.length, 1);
});
test("missing handler times out and disposes state", () => {
  const q = query(),
    p = load({ ...base, requestTimeoutSec: "5" });
  p.ocr(q.value, q.done);
  p.advance(5000);
  assert.equal(q.completions.length, 1);
  assert.equal(q.value.cancelSignal.size, 0);
  assert.equal(p.timers.size, 0);
});
test("errors redact credentials, signed query and basic authentication", () => {
  const q = query(),
    p = load(base, {
      request(r) {
        r.handler(
          ok(
            {
              error: {
                message:
                  "fixture-key https://user:xxx@example.com/?sig=private-value",
              },
            },
            401,
          ),
        );
      },
    });
  p.ocr(q.value, q.done);
  const error = JSON.stringify(q.completions);
  assert.doesNotMatch(error, /fixture-key|xxx|private-value/);
  assert.equal(q.completions[0].error.type, "secretKey");
});
test("invalid URLs, mode, timeout and key fail before transport", () => {
  for (const o of [
    { cloudBaseUrl: "https://user@example.com" },
    { cloudBaseUrl: "https://example.com/#key" },
    { cloudBaseUrl: "https://example.com/\npath" },
    { serviceMode: "typo" },
    { requestTimeoutSec: "NaN" },
    { cloudApiKey: "x\ny" },
  ]) {
    const q = query(),
      p = load({ ...base, ...o });
    p.ocr(q.value, q.done);
    assert.equal(p.requests.length, 0);
    assert.ok(q.completions[0].error);
  }
});
test("Responses incomplete, Gemini safety, Claude max_tokens, tools and refusal fail", () => {
  for (const d of [
    { status: "incomplete", output_text: "part" },
    {
      candidates: [
        { finishReason: "SAFETY", content: { parts: [{ text: "part" }] } },
      ],
    },
    { stop_reason: "max_tokens", content: [{ type: "text", text: "part" }] },
    {
      choices: [{ finish_reason: "tool_calls", message: { content: "part" } }],
    },
    { choices: [{ message: { refusal: "No" } }] },
  ]) {
    const q = query(),
      p = load(base, {
        request(r) {
          r.handler(ok(d));
        },
      });
    p.ocr(q.value, q.done);
    assert.ok(q.completions[0].error);
  }
});
test("native response parsing excludes thoughts and preserves repeated text", () => {
  const p = load();
  for (const d of [
    {
      status: "completed",
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: "1000" }] },
      ],
    },
    {
      content: [
        { type: "thinking", thinking: "secret" },
        { type: "text", text: "1000" },
      ],
    },
    {
      candidates: [
        {
          content: {
            parts: [{ thought: true, text: "secret" }, { text: "1000" }],
          },
          finishReason: "STOP",
        },
      ],
    },
  ])
    assert.equal(
      p
        .module("cloud")
        .parse(d)
        .map((x) => x.text)
        .join(""),
      "1000",
    );
});
test("blank images give notFound; output guard never returns partial success", () => {
  for (const text of ["   ", "x".repeat(1000001)]) {
    const q = query(),
      p = load(base, {
        request(r) {
          r.handler(ok({ output_text: text }));
        },
      });
    p.ocr(q.value, q.done);
    assert.ok(q.completions[0].error);
  }
});
test("local Paddle compatibility retains paragraphs and normalized polygon", () => {
  const q = query(),
    p = load(
      { serviceMode: "local" },
      {
        request(r) {
          assert.equal(r.url, "http://127.0.0.1:50000/ocr");
          r.handler(
            ok({
              errorCode: 0,
              result: {
                ocrResults: [
                  {
                    prunedResult: {
                      rec_texts: ["  one", "two"],
                      rec_polys: [
                        [
                          [0, 0],
                          [320, 0],
                          [320, 100],
                          [0, 100],
                        ],
                      ],
                    },
                  },
                ],
              },
            }),
          );
        },
      },
    );
  p.ocr(q.value, q.done);
  assert.equal(q.completions[0].result.texts[0].text, "  one");
  assert.equal(q.completions[0].result.texts[0].boundingBox.points[1].x, 0.5);
});
test("validation fails when endpoint cannot actually read sample", () => {
  const p = load(base, {
    request(r) {
      r.handler(ok({ data: [{ id: "model" }] }));
    },
  });
  let v;
  p.validate((p) => (v = p));
  assert.equal(v.result, false);
});
test("modern protocols leave saved options unchanged", () => {
  const opts = { ...base, cloudProtocol: "responses" },
    before = JSON.stringify(opts),
    p = load(opts),
    q = query();
  p.ocr(q.value, q.done);
  assert.equal(JSON.stringify(opts), before);
});
test("PaddleOCR VL uses its task prompt and image-first single user message", () => {
  for (const prompt of [
    undefined,
    "请识别图片中的全部文字，仅返回纯文本结果，保留原有换行，不要解释。",
    "Table Recognition:",
  ]) {
    const p = load({
        ...base,
        cloudModel: "PaddlePaddle/PaddleOCR-VL-1.5",
        cloudPrompt: prompt,
      }),
      q = query();
    p.ocr(q.value, q.done);
    const b = p.requests[0].body;
    assert.equal(b.messages.length, 1);
    assert.equal(b.messages[0].content[0].type, "image_url");
    assert.equal(
      b.messages[0].content[1].text,
      prompt === "Table Recognition:" ? prompt : "OCR:",
    );
    assert.equal(b.temperature, 0);
  }
});
test("loopback vision models work without a dummy credential; remote services require key", () => {
  for (const baseUrl of [
    "http://127.0.0.1:8000/v1",
    "http://localhost:8000/v1",
  ]) {
    const p = load({ ...base, cloudApiKey: "", cloudBaseUrl: baseUrl }),
      q = query();
    p.ocr(q.value, q.done);
    assert.equal(p.requests[0].header.Authorization, undefined);
  }
  const p = load({ ...base, cloudApiKey: "" }),
    q = query();
  p.ocr(q.value, q.done);
  assert.equal(p.requests.length, 0);
  assert.ok(q.completions[0].error);
});
test("native Bob data without length/readUInt8 converts once and remains usable", () => {
  const q = query();
  Object.defineProperty(q.value.image, "length", { value: undefined });
  q.value.image.readUInt8 = undefined;
  let count = 0;
  const original = q.value.image.toBase64.bind(q.value.image);
  q.value.image.toBase64 = () => {
    count++;
    return original();
  };
  const p = load(base, {
    request(r) {
      r.handler(ok({ output_text: "valid" }));
    },
  });
  p.ocr(q.value, q.done);
  assert.ok(q.completions[0].result);
  assert.equal(count, 1);
});
