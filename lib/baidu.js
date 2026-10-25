var urls = require("./url.js"),
  result = require("./result.js");
function payload(resp, ctx) {
  var e = ctx.error(resp);
  if (e) {
    ctx.done({ error: e });
    return null;
  }
  var d = resp.data;
  if (!d || typeof d.data !== "object")
    throw new Error("百度任务结果结构无效。");
  return d.data;
}
function jsonl(text, q) {
  if (typeof text !== "string" || text.length > 16 * 1024 * 1024)
    throw new Error("百度结果为空或超过 16 MB，请分区域识别。");
  var items = [];
  text.split(/\r?\n/).forEach(function (line) {
    if (!line.trim()) return;
    var d;
    try {
      d = JSON.parse(line);
    } catch (e) {
      throw new Error("百度结果包含无效 JSONL。");
    }
    var r = d.result || d;
    var layouts = r.layoutParsingResults;
    if (Array.isArray(layouts) && layouts.length) {
      layouts.forEach(function (x) {
        var text =
          typeof x.text === "string"
            ? x.text
            : (x.markdown && x.markdown.text) || x.parsedText;
        if (typeof text !== "string") throw new Error("百度版面结果缺少文字。");
        items = items.concat(result.lines(text));
      });
    } else if (Array.isArray(r.ocrResults))
      items = items.concat(result.local(r, q));
    else throw new Error("百度结果没有可解析的 OCR 页面。");
  });
  return items;
}
function textOf(resp) {
  if (typeof resp.data === "string") return resp.data;
  if (resp.data && typeof resp.data.text === "string") return resp.data.text;
  if (resp.data && typeof resp.data.jsonl === "string") return resp.data.jsonl;
  if ($data.isData(resp.data)) return resp.data.toUTF8();
  return "";
}
function run(ctx, c, q, meta) {
  function submit(index) {
    ctx.request(
      {
        method: "POST",
        url: c.url,
        header: { Authorization: "bearer " + c.key },
        body: {
          model: c.models[index],
          optionalPayload: JSON.stringify(c.optional),
        },
        files: [
          {
            data: q.image,
            name: "file",
            filename: "capture." + meta.kind,
            "content-type": meta.mime,
          },
        ],
      },
      function (resp) {
        var status = resp.response && resp.response.statusCode;
        var message =
          (resp.data &&
            (resp.data.message ||
              resp.data.errorMsg ||
              (resp.data.error && resp.data.error.message))) ||
          "";
        if (
          status === 400 &&
          /模型传参错误|invalid model|unsupported model/i.test(message) &&
          index + 1 < c.models.length
        ) {
          submit(index + 1);
          return;
        }
        var d = payload(resp, ctx);
        if (!d) return;
        if (typeof d.jobId !== "string" || !d.jobId)
          throw new Error("百度提交未返回 jobId。");
        poll(d.jobId);
      },
    );
  }
  function poll(id) {
    ctx.request(
      {
        method: "GET",
        url: urls.child(c.url, id),
        header: { Authorization: "bearer " + c.key },
      },
      function (resp) {
        var d = payload(resp, ctx);
        if (!d) return;
        if (d.state === "pending" || d.state === "running") {
          ctx.schedule(1, poll.bind(null, id));
          return;
        }
        if (d.state === "failed")
          throw new Error(d.errorMsg || "百度 OCR 任务失败。");
        if (d.state !== "done") throw new Error("百度 OCR 返回未知任务状态。");
        var target = d.resultUrl && d.resultUrl.jsonUrl;
        if (!target) throw new Error("百度任务没有返回结果下载地址。");
        urls.resultUrl(target);
        download(target);
      },
    );
  }
  function finish(resp) {
    var e = ctx.error(resp);
    if (e) {
      ctx.done({ error: e });
      return;
    }
    ctx.done({ result: result.build(jsonl(textOf(resp), q), q) });
  }
  function relay(target) {
    var url = urls.params(c.relay, { format: "json", url: target });
    ctx.request({ method: "GET", url: url }, finish);
  }
  function download(target) {
    if (c.strategy === "relayOnly") {
      relay(target);
      return;
    }
    ctx.request({ method: "GET", url: target }, function (resp) {
      var status = resp.response && resp.response.statusCode;
      if (
        (status === 400 || status === 403) &&
        c.strategy === "directThenRelay"
      ) {
        relay(target);
        return;
      }
      finish(resp);
    });
  }
  submit(0);
}
module.exports = { run: run, jsonl: jsonl };
