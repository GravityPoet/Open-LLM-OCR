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
  var items = [], prose = [], fence = null;
  function append(text) {
    text.split("\n").forEach(function (line) {
      // The document parser has already converted its markup. In particular,
      // code containing literal HTML must not be interpreted a second time.
      items.push({ text: line, plainText: true });
    });
  }
  function flush() {
    if (!prose.length) return;
    var source = prose.join("\n"),
      opening = /<table\b[^>]*>/gi, closing = /<\/table\s*>/gi,
      cursor = 0, converted = "", match;
    // Convert complete tables in their original position before splitting
    // lines. Scan forward once, including when a table is incomplete.
    while ((match = opening.exec(source))) {
      closing.lastIndex = opening.lastIndex;
      var end = closing.exec(source);
      if (!end) break;
      converted += source.slice(cursor, match.index);
      if (converted && converted.slice(-1) !== "\n") converted += "\n";
      converted += result.normalizeTableMarkup(source.slice(match.index, closing.lastIndex));
      if (closing.lastIndex < source.length && source.charAt(closing.lastIndex) !== "\n") converted += "\n";
      cursor = opening.lastIndex = closing.lastIndex;
    }
    var lines = (converted + source.slice(cursor)).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var next = lines[i + 1] || "";
      var cells = next.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      if (!/^(?: {4}|\t)/.test(lines[i]) && lines[i].indexOf("|") >= 0 &&
          next.indexOf("|") >= 0 && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell.trim()); })) {
        var start = i;
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") >= 0) i++;
        append(result.normalizeTableMarkup(lines.slice(start, i).join("\n")));
        i--;
      } else {
        // Remove generated heading syntax outside code, retaining indentation.
        append(lines[i].replace(/^( {0,3})#{1,6}[ \t]+/, "$1"));
      }
    }
    prose = [];
  }
  String(value || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
    if (fence) {
      var end = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (end && end[1].charAt(0) === fence.charAt(0) && end[1].length >= fence.length) fence = null;
      else append(line);
    } else {
      var start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (start) { flush(); fence = start[1]; }
      else prose.push(line);
    }
  });
  flush();
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
      items = items.concat(markdownLines(p.markdown));
  });
  return items;
}
function roboflowItems(data, c) {
  var text = data && (c && c.ppVersion ? data.result : data.response);
  if (typeof text !== "string")
    throw new Error("Roboflow 模型返回结果缺少识别文字。");
  return c && c.ppVersion ? require("./pp-layout.js").lines(data) : result.lines(text);
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
function workflowError(resp, original) {
  if (!original) return null;
  var status = resp && resp.response && resp.response.statusCode;
  if (status !== 401 && status !== 403) return original;
  var data = resp.data && typeof resp.data === "object" ? resp.data : {};
  var detail = data.inner_error_message ||
    (typeof data.error === "string" ? data.error : data.error && data.error.message) ||
    data.message || (typeof resp.data === "string" ? resp.data : "");
  var type = "secretKey", message;
  if (status === 403 && /Roboflow-managed OpenAI API keys.*paid plan/i.test(detail)) {
    type = "api";
    message = "Roboflow 托管的 OpenAI Key 仅向付费工作区开放（HTTP 403）。请在 Workflow 的模型步骤填写自己的 OpenAI Key，或使用符合要求的付费工作区。";
  } else if (status === 403 && /StepExecutionError$/.test(data.error_type || "")) {
    type = "api";
    var block = Array.isArray(data.blocks_errors) && data.blocks_errors[0];
    var step = block && typeof block.block_id === "string" ? block.block_id.slice(0, 80) : "未知";
    message = "Roboflow Workflow 已进入“" + step + "”步骤，但该步骤被平台拒绝（HTTP 403）。请检查此步骤的模型权限、套餐或第三方 Key。如使用 Roboflow 托管的 OpenAI Key，平台要求付费工作区。";
  } else {
    message = "Roboflow Workflow 认证或访问权限失败（HTTP " + status + "）。请核对 Private API Key 所属工作区和访问权限。";
  }
  if (typeof detail === "string" && detail) message += " 上游：" + detail;
  // Runtime's final error boundary still redacts saved credentials and limits
  // the message. No retry or additional billable diagnostic call is made.
  return { type: type, message: message, addition: { statusCode: status } };
}
function run(ctx, c, q, meta) {
  var request;
  var nativeRoboflowModel = c.roboflowEndpoint === "model";
  if (nativeRoboflowModel) {
    request = {
      method: "POST",
      url: c.url,
      header: {
        Authorization: "Bearer " + c.key,
        "Content-Type": "application/json",
      },
      body: {
        image: mimeData(meta, q),
        model_id: c.model,
        prompt: c.prompt || "OCR",
        max_new_tokens: c.maxNewTokens,
      },
    };
    if (c.ppVersion) {
      request.body = { image: mimeData(meta, q), pp_ocr_version_id: c.ppVersion };
    } else if (c.thinking === false) request.body.enable_thinking = false;
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
    if (c.roboflowEndpoint === "workflow") e = workflowError(resp, e);
    else if (nativeRoboflowModel && e && [401, 403].indexOf(e.addition && e.addition.statusCode) >= 0)
      e = { type: e.type, message: "Roboflow 模型认证或权限失败。请核对 Private API Key 和当前模型的访问权限。", addition: e.addition };
    if (e) {
      ctx.done({ error: e });
      return;
    }
    if (c.mode === "openDocRouter") openDocFailure(resp.data);
    var items = nativeRoboflowModel
      ? roboflowItems(resp.data, c)
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
