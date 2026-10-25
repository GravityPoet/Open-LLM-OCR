var MAX_CHARACTERS = 1000000,
  MAX_LINES = 20000;
function text(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : "";
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
    var v = text(item && item.text);
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
module.exports = { lines: lines, box: box, build: build, local: local };
