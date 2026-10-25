var urls = require("./url.js"),
  result = require("./result.js");
function endpoint(base) {
  var u = urls.parse(base);
  var suffix = "/documentintelligence/documentModels/prebuilt-read:analyze";
  if (/\/documentintelligence$/.test(u.path))
    u.path += "/documentModels/prebuilt-read:analyze";
  else if (u.path.indexOf("/documentintelligence/documentModels/") < 0)
    u.path += suffix;
  else if (!u.path.endsWith("/prebuilt-read:analyze"))
    throw new Error("微软 OCR 需要 prebuilt-read 分析地址。");
  return urls.params(u.origin + u.path + u.query, {
    "api-version": "2024-11-30",
  });
}
function header(resp, name) {
  var h = (resp && resp.response && resp.response.headers) || {};
  var key = Object.keys(h).filter(function (k) {
    return k.toLowerCase() === name.toLowerCase();
  })[0];
  return h[key];
}
function parse(data, query) {
  var a = data && data.analyzeResult;
  if (!a || !Array.isArray(a.pages))
    throw new Error("微软 OCR 结果缺少 pages。");
  var items = [];
  a.pages.forEach(function (page) {
    if (!Array.isArray(page.lines)) return;
    page.lines.forEach(function (line) {
      if (typeof line.content !== "string")
        throw new Error("微软 OCR 文本行结构无效。");
      var t = { text: line.content };
      var b =
        a.pages.length === 1 &&
        result.box(line.polygon, page.width, page.height);
      if (b) t.boundingBox = b;
      items.push(t);
    });
  });
  return items;
}
function run(ctx, c, q, meta) {
  var url = endpoint(c.url),
    headers = {
      "Ocp-Apim-Subscription-Key": c.key,
      "Content-Type": "application/json",
    };
  ctx.request(
    {
      method: "POST",
      url: url,
      header: headers,
      body: { base64Source: meta.base64 },
    },
    function (resp) {
      var err = ctx.error(resp);
      if (err) {
        ctx.done({ error: err });
        return;
      }
      if (resp.response.statusCode !== 202)
        throw new Error("微软 OCR 提交未返回 202，检查资源类型和地址。");
      var next = header(resp, "Operation-Location");
      if (!next) throw new Error("微软 OCR 未返回轮询地址。");
      if (next.charAt(0) === "/") next = urls.parse(url).origin + next;
      urls.sameOrigin(next, url);
      var expected = urls
        .parse(url)
        .path.replace(/:analyze$/, "/analyzeResults/");
      if (urls.parse(next).path.indexOf(expected) !== 0)
        throw new Error("微软 OCR 轮询路径无效。");
      function poll() {
        ctx.request(
          {
            method: "GET",
            url: next,
            header: { "Ocp-Apim-Subscription-Key": c.key },
          },
          function (r) {
            var e = ctx.error(r);
            if (e) {
              ctx.done({ error: e });
              return;
            }
            var d = r.data;
            if (!d || typeof d !== "object")
              throw new Error("微软 OCR 轮询结果不是 JSON。");
            if (d.status === "succeeded") {
              ctx.done({ result: result.build(parse(d, q), q) });
              return;
            }
            if (d.status === "failed" || d.status === "canceled")
              throw new Error(
                (d.error && d.error.message) || "微软 OCR 任务失败。",
              );
            if (d.status !== "running" && d.status !== "notStarted")
              throw new Error("微软 OCR 返回未知任务状态。");
            ctx.schedule(delay(r), poll);
          },
        );
      }
      ctx.schedule(delay(resp), poll);
    },
  );
}
function delay(r) {
  var s = Number(header(r, "Retry-After"));
  return s > 0 ? Math.min(s, 15) : 1;
}
module.exports = { run: run, parse: parse, endpoint: endpoint };
