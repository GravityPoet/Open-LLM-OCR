const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { load, query, ok } = require("./helpers.cjs");
const options = {
  serviceMode: "mistral",
  cloudBaseUrl: "https://api.mistral.ai/v1",
  cloudApiKey: "fixture-key",
};
test("Mistral latest calls native OCR endpoint without chat or sampling fields", () => {
  const p = load(options),
    q = query();
  p.ocr(q.value, q.done);
  const r = p.requests[0];
  assert.equal(r.url, "https://api.mistral.ai/v1/ocr");
  assert.equal(r.body.model, "mistral-ocr-latest");
  assert.equal(r.body.document.type, "image_url");
  assert.ok(r.body.document.image_url.startsWith("data:image/png;base64,"));
  assert.equal(r.body.include_image_base64, false);
  assert.equal(r.body.include_blocks, true);
  assert.equal(r.body.table_format, "markdown");
  assert.equal(r.body.temperature, undefined);
});
test("Mistral fixed model 4.1 and custom model remain explicit", () => {
  for (const [preset, model] of [
    ["mistral-ocr-4-1", "mistral-ocr-4-1"],
    ["custom", "fixture-model"],
  ]) {
    const p = load({
        ...options,
        mistralModel: preset,
        cloudModel: "fixture-model",
      }),
      q = query();
    p.ocr(q.value, q.done);
    assert.equal(p.requests[0].body.model, model);
  }
});
test("Mistral block order, paragraph text and table content are retained once", () => {
  const p = load(),
    items = p.module("mistral").parse({
      pages: [
        {
          index: 0,
          dimensions: { width: 1000, height: 300 },
          markdown: "duplicate",
          tables: [{ id: "table1", content: "| A | B |\n| 1 | 2 |" }],
          blocks: [
            {
              type: "text",
              content: "First\n  nested",
              top_left_x: 20,
              top_left_y: 10,
              bottom_right_x: 500,
              bottom_right_y: 60,
            },
            { type: "table", table_id: "table1", content: "" },
            { type: "image", content: "image.png" },
          ],
        },
      ],
    });
  assert.equal(items.length, 2);
  assert.equal(items[0].text, "First\n  nested");
  assert.equal(items[0].boundingBox.points[0].x, 0.02);
  assert.match(items[1].text, /\| 1 \| 2 \|/);
});
test("Mistral fallback preserves all pages, tables and blank lines", () => {
  const p = load(),
    items = p.module("mistral").parse({
      pages: [
        { index: 1, markdown: "Second" },
        {
          index: 0,
          markdown: "First\n\n[tbl.md](tbl.md)",
          tables: [{ id: "tbl.md", content: "| A |" }],
        },
      ],
    });
  assert.equal(items.map((t) => t.text).join("\n"), "First\n\n| A |\n\nSecond");
});

test("Mistral HTML tables become clean tab-separated OCR lines", () => {
  const p = load();
  const items = p.module("mistral").parse({
    pages: [{
      index: 0,
      markdown: "<table><tr><td>2026-10-07</td><td>$0.00</td></tr><tr><td>2026-10-22</td><td>$0.97</td></tr></table>",
    }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(items.map((item) => item.text))), [
    "2026-10-07\t$0.00",
    "2026-10-22\t$0.97",
  ]);
});

test("Mistral Markdown tables become clean tab-separated OCR lines", () => {
  const p = load();
  const items = p.module("mistral").parse({
    pages: [{
      index: 0,
      markdown: "| 日期 | 金额 |\n| --- | ---: |\n| 2026-10-07 | $0.00 |",
    }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(items.map((item) => item.text))), [
    "日期\t金额",
    "2026-10-07\t$0.00",
  ]);
});
test("Mistral rejects malformed page and block without silently dropping text", () => {
  const p = load();
  for (const data of [
    {},
    { pages: [{}] },
    { pages: [{ blocks: [{ type: "text" }] }] },
  ])
    assert.throws(() => p.module("mistral").parse(data));
});
test("Mistral malformed response reports failure, error body is redacted", () => {
  const q = query(),
    p = load(options, {
      request(r) {
        r.handler(ok({ error: { message: "fixture-key" } }, 401));
      },
    });
  p.ocr(q.value, q.done);
  assert.ok(q.completions[0].error);
  assert.doesNotMatch(q.completions[0].error.message, /fixture-key/);
});
