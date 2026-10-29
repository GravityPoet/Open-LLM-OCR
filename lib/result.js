var MAX_CHARACTERS = 1000000,
  MAX_LINES = 20000;
function text(value) {
  return typeof value === "string"
    ? normalizeTableMarkup(value).replace(/\r\n?/g, "\n")
    : "";
}
function stripTags(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|section|article|thead|tbody|tfoot)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
function normalizeTableMarkup(value) {
  var source = String(value || "");
  var markdownLines = source.replace(/\r\n?/g, "\n").split("\n");
  var markdownTable = markdownLines.some(function (line, index) {
    return /\|/.test(line) && index + 1 < markdownLines.length && /^\s*\|?\s*:?-{3,}/.test(markdownLines[index + 1]);
  });
  if (!/<(?:table|tr|td|th)\b/i.test(source) && !markdownTable) return source;
  if (markdownTable && !/<(?:table|tr|td|th)\b/i.test(source)) {
    return markdownLines
      .map(function (line) {
        if (!/\|/.test(line)) return line;
        var cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (cell) {
          return cell.trim();
        });
        if (cells.length && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell); })) return "";
        return cells.join("\t");
      })
      .filter(function (line) { return line !== ""; })
      .join("\n");
  }
  var table = /<table\b[\s\S]*?<\/table>/i.test(source)
    ? source.match(/<table\b[\s\S]*?<\/table>/i)[0]
    : source;
  var rows = [], rowMatch, rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  while ((rowMatch = rowPattern.exec(table))) {
    var cells = [], cellMatch, cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      cells.push(stripTags(cellMatch[1]).replace(/\s+/g, " ").trim());
    }
    if (cells.length) rows.push(cells.join("\t"));
  }
  if (!rows.length) return stripTags(source);
  var remainder = source.replace(table, "").trim();
  return rows.join("\n") + (remainder ? "\n" + stripTags(remainder) : "");
}
function lines(value) {
  return text(value)
    .split("\n")
    .map(function (v) {
      return { text: v };
    });
}
function box(polygon, width, height) {
  if (
    !Array.isArray(polygon) ||
    (polygon.length !== 4 && polygon.length !== 8) ||
    !(width > 0 && height > 0)
  )
    return undefined;
  var p =
    polygon.length === 8
      ? [
          { x: polygon[0], y: polygon[1] },
          { x: polygon[2], y: polygon[3] },
          { x: polygon[4], y: polygon[5] },
          { x: polygon[6], y: polygon[7] },
        ]
      : polygon.map(function (v) {
          return Array.isArray(v) ? { x: v[0], y: v[1] } : v;
        });
  if (
    p.some(function (v) {
      return (
        !v ||
        typeof v.x !== "number" ||
        typeof v.y !== "number" ||
        !isFinite(v.x) ||
        !isFinite(v.y)
      );
    })
  )
    return undefined;
  return {
    points: p.map(function (v) {
      return {
        x: Math.max(0, Math.min(1, v.x / width)),
        y: Math.max(0, Math.min(1, v.y / height)),
      };
    }),
  };
}
function build(items, query) {
  if (!Array.isArray(items)) throw new Error("OCR 返回结构无效。");
  var count = 0,
    hasText = false;
  var cleaned = items.map(function (item) {
    var v = item && item.plainText === true
      ? (typeof item.text === "string" ? item.text.replace(/\r\n?/g, "\n") : "")
      : text(item && item.text);
    count += v.length;
    if (v.trim()) hasText = true;
    var t = { text: v };
    if (item && item.boundingBox) t.boundingBox = item.boundingBox;
    return t;
  });
  if (count > MAX_CHARACTERS || items.length > MAX_LINES)
    throw new Error("识别结果过大，已停止；请分区域识别，避免丢失正文。");
  if (!hasText) {
    var e = new Error("未识别到文字，请检查截图区域或换一张更清晰的图片。");
    e.serviceError = { type: "notFound", message: e.message };
    throw e;
  }
  while (cleaned.length && !cleaned[0].text.trim()) cleaned.shift();
  while (cleaned.length && !cleaned[cleaned.length - 1].text.trim())
    cleaned.pop();
  var result = { texts: cleaned };
  var from =
    query.from && query.from !== "auto" ? query.from : query.detectFrom;
  if (from && from !== "auto") result.from = from;
  return result;
}
function local(data, query) {
  var p = data;
  for (var i = 0; i < 4; i++) {
    if (!p || typeof p !== "object") break;
    if ((p.errorCode && p.errorCode !== 0) || (p.code && p.code !== 0))
      throw new Error(p.errorMsg || p.msg || "OCR 服务返回错误。");
    if (Array.isArray(p.ocrResults) || Array.isArray(p.ocr_results)) break;
    p = p.result || p.data;
  }
  var pages = p && (p.ocrResults || p.ocr_results);
  if (!Array.isArray(pages))
    throw new Error("本地 OCR 服务返回结构不符合预期。");
  var items = [];
  pages.forEach(function (page) {
    var v = page.prunedResult || page.pruned_result || page.res || page;
    var texts = v.rec_texts;
    var polygons = v.rec_polys || v.dt_polys;
    if (!Array.isArray(texts)) throw new Error("OCR 页缺少文本行。");
    texts.forEach(function (t, i) {
      if (typeof t !== "string") throw new Error("OCR 文本行格式无效。");
      var line = { text: t };
      var b =
        pages.length === 1 &&
        polygons &&
        box(polygons[i], query.pixelWidth, query.pixelHeight);
      if (b) line.boundingBox = b;
      items.push(line);
    });
  });
  return items;
}
module.exports = {
  lines: lines,
  box: box,
  build: build,
  local: local,
  normalizeTableMarkup: normalizeTableMarkup,
};
