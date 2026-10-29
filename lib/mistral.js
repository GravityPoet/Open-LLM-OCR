var urls = require("./url.js"),
  result = require("./result.js");
function parse(data) {
  if (!data || !Array.isArray(data.pages))
    throw new Error("Mistral OCR 返回结果缺少 pages。");
  if (data.error) throw new Error(data.error.message || "Mistral OCR 失败。");
  var pages = data.pages.slice().sort(function (a, b) {
      return (a.index || 0) - (b.index || 0);
    }),
    items = [];
  pages.forEach(function (page, pageIndex) {
    if (pageIndex) items.push({ text: "" });
    var blocks = page.blocks,
      dimensions = page.dimensions || {};
    if (Array.isArray(blocks) && blocks.length) {
      blocks.forEach(function (block) {
        if (block.type === "image") return;
        var text = block.content;
        if (block.type === "table" && !text && Array.isArray(page.tables)) {
          var table = page.tables.filter(function (t) {
            return t.id === block.table_id;
          })[0];
          if (table) text = table.content;
        }
        if (typeof text !== "string")
          throw new Error("Mistral 内容块缺少正文，已停止以避免丢失内容。");
        if (!text.trim()) return;
        var line = { text: text };
        var b =
          pages.length === 1 &&
          result.rectangle(
            block.top_left_x, block.top_left_y,
            block.bottom_right_x, block.bottom_right_y,
            dimensions.width,
            dimensions.height,
          );
        if (b) line.boundingBox = b;
        items.push(line);
      });
    } else {
      if (typeof page.markdown !== "string")
        throw new Error("Mistral 页面缺少 Markdown 正文。");
      var markdown = page.markdown;
      (page.tables || []).forEach(function (table) {
        if (typeof table.id === "string" && typeof table.content === "string") {
          markdown = markdown
            .split("[" + table.id + "](" + table.id + ")")
            .join(table.content);
        }
      });
      items = items.concat(result.lines(markdown));
    }
  });
  return items;
}
function run(ctx, c, q, meta) {
  var u = urls.parse(c.url);
  if (!u.path) u.path = "/v1";
  var url = urls.endpoint(u.origin + u.path + u.query, "/ocr");
  ctx.request(
    {
      method: "POST",
      url: url,
      header: {
        Authorization: "Bearer " + c.key,
        "Content-Type": "application/json",
      },
      body: {
        model: c.model,
        document: {
          type: "image_url",
          image_url: "data:" + meta.mime + ";base64," + meta.base64,
        },
        include_image_base64: false,
        include_blocks: true,
        table_format: "markdown",
      },
    },
    function (resp) {
      var e = ctx.error(resp);
      if (e) {
        ctx.done({ error: e });
        return;
      }
      ctx.done({ result: result.build(parse(resp.data), q) });
    },
  );
}
module.exports = { run: run, parse: parse };
