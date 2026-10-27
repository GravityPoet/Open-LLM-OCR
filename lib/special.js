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
function markdownLines(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(function (line) {
      // OCR fallback responses sometimes add Markdown heading syntax even
      // when the screenshot contains ordinary text. Keep literal hashes that
      // are not followed by heading whitespace.
      return { text: line.replace(/^\s{0,3}#{1,6}(?=\s+)/, "").replace(/^\s+/, "") };
    });
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
      items = items.concat(markdownLines(p.markdown));
  });
  return items;
}
function roboflowItems(data) {
  var text = data && data.response;
  if (typeof text !== "string")
    throw new Error("Roboflow GLM-OCR 返回结果缺少 response。");
  return result.lines(text);
}
function openDocFailure(data) {
  if (!data || typeof data !== "object")
    throw new Error("OpenDocRouter 返回结果不是 JSON 对象。");
  var pages = Array.isArray(data.pages) ? data.pages : [];
  var failed = pages.filter(function (page) {
    return page && page.status && page.status !== "ok";
  });
  if (data.status === "failed" || failed.length) {
    var page = failed[0] || pages[0] || {};
    var detail = page.error || data.error || {};
    var code = typeof detail.code === "string" ? detail.code : "";
    var message = typeof detail.message === "string" ? detail.message : "";
    var suffix = [code, message].filter(function (v) { return v; }).join(": ");
    throw new Error(
      "OpenDocRouter 识别失败" +
        (page.page ? "（第 " + page.page + " 页）" : "") +
        (suffix ? "：" + suffix : "，服务未返回可用页面。"),
    );
  }
  if (data.status && data.status !== "completed" && data.status !== "partial")
    throw new Error("OpenDocRouter 返回未完成状态：" + data.status + "。");
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
    var document = { data: meta.base64, mime_type: meta.mime };
    request = {
      method: "POST",
      url: urls.endpoint(c.url, "/v1/parse"),
      header: {
        Authorization: "Bearer " + c.key,
        "Content-Type": "application/json",
      },
      body: {
        model: c.model,
        document: document,
        mode: "sync",
        cache: false,
        layout: false,
      },
    };
    if (meta.kind === "pdf") request.body.pages = "1-" + c.maxPages;
  }
  ctx.request(request, function (resp) {
    var e = ctx.error(resp);
    if (e) {
      ctx.done({ error: e });
      return;
    }
    if (c.mode === "openDocRouter") openDocFailure(resp.data);
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
  openDocFailure: openDocFailure,
  markdownLines: markdownLines,
};
