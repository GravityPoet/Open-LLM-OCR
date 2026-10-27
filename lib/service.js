var config = require("./config.js"),
  runtime = require("./runtime.js"),
  images = require("./image.js"),
  results = require("./result.js");
var languages = [
  "auto",
  "zh-Hans",
  "zh-Hant",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "ru",
  "ar",
  "hi",
  "th",
  "vi",
  "id",
  "tr",
  "nl",
  "pl",
  "uk",
];
function timeout() {
  try {
    return config.read($option, $info.identifier).timeout;
  } catch (e) {
    return 60;
  }
}
function execute(query, completion) {
  var c, meta;
  try {
    if (!query || typeof query !== "object") throw new Error("识别参数无效。");
    c = config.read($option, $info.identifier);
    meta = c.mode === "roboflowWorkflow" && c.inputType === "url"
      ? { kind: "url", mime: "", base64: "", bytes: 0 }
      : images.inspect(query.image, c.mode);
    if (query.from && languages.indexOf(query.from) < 0)
      throw new Error("当前插件未声明支持该语言，请使用自动检测。");
    if (
      c.mode === "azure" &&
      query.pixelWidth &&
      query.pixelHeight &&
      (query.pixelWidth < 50 ||
        query.pixelHeight < 50 ||
        query.pixelWidth > 10000 ||
        query.pixelHeight > 10000)
    )
      throw new Error("微软 OCR 图片边长需为 50–10000 像素。");
  } catch (e) {
    completion({ error: runtime.error("param", e.message, $option) });
    return;
  }
  var ctx = runtime.create(query, c.timeout, $option, completion);
  ctx.guard(function () {
    if (c.mode === "azure") {
      require("./azure.js").run(ctx, c, query, meta);
      return;
    }
    if (c.mode === "mistral") {
      require("./mistral.js").run(ctx, c, query, meta);
      return;
    }
    if (c.mode === "roboflow" || c.mode === "roboflowWorkflow" || c.mode === "openDocRouter") {
      require("./special.js").run(ctx, c, query, meta);
      return;
    }
    if (c.mode === "providerCloud") {
      require("./cloud.js").run(ctx, c, query, meta);
      return;
    }
    if (c.mode === "cloudAsync") {
      require("./baidu.js").run(ctx, c, query, meta);
      return;
    }
    var body = { file: meta.base64, fileType: 1, visualize: false };
    Object.keys(c.local).forEach(function (k) {
      body[k] = c.local[k];
    });
    ctx.request(
      {
        method: "POST",
        url: c.url,
        header: { "Content-Type": "application/json" },
        body: body,
      },
      function (resp) {
        var e = ctx.error(resp);
        if (e) {
          ctx.done({ error: e });
          return;
        }
        ctx.done({
          result: results.build(results.local(resp.data, query), query),
        });
      },
    );
  })();
}
function validate(completion) {
  var sample;
  try {
    sample = $data.fromBase64(require("./sample.js"));
  } catch (e) {
    completion({
      result: false,
      error: { type: "api", message: "内置验证图片无法读取，请重新安装插件。" },
    });
    return;
  }
  execute(
    {
      image: sample,
      from: "en",
      detectFrom: "en",
      pixelWidth: 1000,
      pixelHeight: 300,
    },
    function (p) {
      if (p.error) {
        completion({ result: false, error: p.error });
        return;
      }
      var text = p.result.texts
        .map(function (t) {
          return t.text;
        })
        .join(" ");
      if (!/OCR/i.test(text) || !text.includes("123")) {
        completion({
          result: false,
          error: {
            type: "api",
            message:
              "接口已响应，但未正确识别内置样例，请检查模型视觉能力或识别指令。",
          },
        });
        return;
      }
      completion({ result: true });
    },
  );
}
function bounding() {
  try {
    return config.read($option, $info.identifier).mode === "azure";
  } catch (e) {
    return false;
  }
}
module.exports = {
  ocr: execute,
  validate: validate,
  timeout: timeout,
  languages: function () {
    return languages.slice();
  },
  bounding: bounding,
};
