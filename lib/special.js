var urls = require("./url.js"),
  result = require("./result.js");
function mimeData(meta, query) {
  return { type: "base64", value: meta.base64 };
}
function blocksToItems(page, width, height) {
  var items = [];
  (page.blocks || []).forEach(function (b) {
    if (!b || b.type === "image") return;
    var t = typeof b.content === "string" ? b.content : "";
    if (!t && typeof b.text === "string") t = b.text;
    if (!t.trim()) return;
    var item = { text: t };
    if (
      typeof b.top_left_x === "number" &&
      typeof b.top_left_y === "number" &&
      typeof b.bottom_right_x === "number" &&
      typeof b.bottom_right_y === "number" &&
      width > 0 &&
      height > 0
    ) {
      item.boundingBox = {
        points: [
          { x: b.top_left_x / width, y: b.top_left_y / height },
          { x: b.bottom_right_x / width, y: b.top_left_y / height },
          { x: b.bottom_right_x / width, y: b.bottom_right_y / height },
          { x: b.top_left_x / width, y: b.bottom_right_y / height },
        ],
      };
    }
    items.push(item);
  });
  return items;
}
function openDocItems(data, query) {
  if (!data || !Array.isArray(data.pages))
    throw new Error("OpenDocRouter 返回结果缺少 pages。");
  var items = [];
  data.pages.forEach(function (p, i) {
    if (i) items.push({ text: "" });
    var blocks = blocksToItems(p, query.pixelWidth, query.pixelHeight);
    if (blocks.length) items = items.concat(blocks);
    else if (typeof p.markdown === "string")
      items = items.concat(result.lines(p.markdown));
  });
  return items;
}
function roboflowItems(data) {
  var text = data && data.response;
  if (typeof text !== "string")
    throw new Error("Roboflow GLM-OCR 返回结果缺少 response。");
  return result.lines(text);
}
function run(ctx, c, q, meta) {
  var request;
  if (c.mode === "roboflow") {
    request = {
      method: "POST",
      url: urls.endpoint(c.url, "/infer/lmm"),
      header: {
        Authorization: "Bearer " + c.key,
        "Content-Type": "application/json",
      },
      body: {
        image: mimeData(meta, q),
        model_id: "glm-ocr",
        prompt: c.prompt || "OCR",
        max_new_tokens: c.maxNewTokens,
      },
    };
  } else {
    request = {
      method: "POST",
      url: urls.endpoint(c.url, "/v1/parse"),
      header: {
        Authorization: "Bearer " + c.key,
        "Content-Type": "application/json",
      },
      body: {
        model: c.model,
        document: { data: meta.base64, mime_type: meta.mime },
        mode: "sync",
        cache: false,
        layout: false,
      },
    };
  }
  ctx.request(request, function (resp) {
    var e = ctx.error(resp);
    if (e) {
      ctx.done({ error: e });
      return;
    }
    var items =
      c.mode === "roboflow"
        ? roboflowItems(resp.data)
        : openDocItems(resp.data, q);
    ctx.done({ result: result.build(items, q) });
  });
}
module.exports = {
  run: run,
  roboflowItems: roboflowItems,
  openDocItems: openDocItems,
};
