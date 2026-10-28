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
function pathValue(value, path) {
  if (!path) return undefined;
  var current = value;
  String(path).split(".").forEach(function (part) {
    if (current === undefined || current === null) return;
    var match = /^(.*?)(?:\[(\d+)\])?$/.exec(part);
    if (!match) { current = undefined; return; }
    current = current[match[1]];
    if (match[2] !== undefined && Array.isArray(current)) current = current[Number(match[2])];
    else if (match[2] !== undefined) current = undefined;
  });
  return current;
}
function collectWorkflowText(value, out, depth) {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(function (item) { collectWorkflowText(item, out, depth + 1); });
    return;
  }
  if (typeof value !== "object") return;
  ["text", "output", "result", "response", "markdown", "ocr", "content"].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(value, key)) collectWorkflowText(value[key], out, depth + 1);
  });
  if (!out.length) Object.keys(value).forEach(function (key) { collectWorkflowText(value[key], out, depth + 1); });
}
function roboflowWorkflowItems(data, c) {
  if (!data || typeof data !== "object") throw new Error("Roboflow Workflow 返回结果不是 JSON 对象。");
  var selected = pathValue(data, c.outputPath), values = [];
  collectWorkflowText(selected === undefined ? data : selected, values, 0);
  var unique = [], seen = {};
  values.forEach(function (value) {
    if (!seen[value]) { seen[value] = true; unique.push(value); }
  });
  if (!unique.length) throw new Error("Roboflow Workflow 返回结果中没有可用文字；请检查输出字段路径。");
  return result.lines(unique.join("\n"));
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
  var nativeRoboflowModel = c.roboflowEndpoint === "model";
  if (nativeRoboflowModel) {
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
  } else if (c.roboflowEndpoint === "workflow" || c.mode === "roboflowWorkflow") {
    request = {
      method: "POST",
      url: c.url,
      header: { "Content-Type": "application/json" },
      body: {
        api_key: c.key,
        inputs: {
          image: {
            type: c.inputType,
            value: c.inputType === "url" ? c.imageUrl : meta.base64,
          },
        },
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
    var items = nativeRoboflowModel
      ? roboflowItems(resp.data)
      : c.roboflowEndpoint === "workflow" || c.mode === "roboflowWorkflow"
        ? roboflowWorkflowItems(resp.data, c)
        : openDocItems(resp.data, q);
    ctx.done({ result: result.build(items, q) });
  });
}
module.exports = {
  run: run,
  roboflowItems: roboflowItems,
  roboflowWorkflowItems: roboflowWorkflowItems,
  openDocItems: openDocItems,
  openDocFailure: openDocFailure,
  markdownLines: markdownLines,
};
