var urls = require("./url.js"),
  result = require("./result.js");
function prepare(c, image, meta) {
  var u = urls.parse(c.url),
    p = c.protocol;
  var inferred = /\/responses$/.test(u.path)
    ? "responses"
    : /\/messages$/.test(u.path)
      ? "anthropic"
      : /:generateContent$/.test(u.path)
        ? "gemini"
        : /\/chat\/completions$/.test(u.path)
          ? "chat"
          : null;
  if (inferred) p = inferred;
  else if (p === "auto") p = "chat";
  if (["chat", "responses", "gemini", "anthropic"].indexOf(p) < 0)
    throw new Error("请选择有效的模型接口协议。");
  var image64 = meta.base64,
    dataUrl = "data:" + meta.mime + ";base64," + image64;
  var header = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + c.key,
    },
    body,
    url;
  var instruction = c.prompt;
  if (p === "chat") {
    url = urls.endpoint(c.url, "/chat/completions");
    body = {
      model: c.model,
      stream: false,
      messages: [
        { role: "system", content: instruction },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all visible text from this image." },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: c.detail },
            },
          ],
        },
      ],
    };
    // PaddleOCR-VL is a task-specific recognizer, not a general chat model.
    if (/(?:^|\/)paddleocr-vl(?:-|$)/i.test(c.model)) {
      var oldDefault =
        "请识别图片中的全部文字，仅返回纯文本结果，保留原有换行，不要解释。";
      var task =
        instruction === oldDefault ||
        instruction === require("./config.js").defaultPrompt
          ? "OCR:"
          : instruction;
      body.temperature = 0;
      body.messages = [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: task },
          ],
        },
      ];
    } else if (instruction === require("./config.js").defaultPrompt) {
      // Pure transcription does not need the optional reasoning pass on
      // these verified routes. Custom instructions keep provider defaults.
      if (u.host === "openrouter.ai" && c.model === "deepseek/deepseek-v4.1-flash-1017")
        body.reasoning = { enabled: false };
      else if (u.host === "api.fireworks.ai" && c.model === "accounts/fireworks/models/deepseek-v4p1-flash-1017")
        body.reasoning_effort = "none";
    }
  } else if (p === "responses") {
    url = urls.endpoint(c.url, "/responses");
    body = {
      model: c.model,
      stream: false,
      store: false,
      instructions: instruction,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract all visible text from this image.",
            },
            { type: "input_image", image_url: dataUrl, detail: c.detail },
          ],
        },
      ],
    };
  } else if (p === "gemini") {
    if (!inferred) {
      if (!u.path) u.path = "/v1beta";
      u.path +=
        "/models/" +
        encodeURIComponent(c.model.replace(/^models\//, "")) +
        ":generateContent";
    }
    url = u.origin + u.path + u.query;
    if (u.host === "generativelanguage.googleapis.com") {
      delete header.Authorization;
      header["x-goog-api-key"] = c.key;
    }
    body = {
      systemInstruction: { parts: [{ text: instruction }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: "Extract all visible text." },
            { inlineData: { mimeType: meta.mime, data: image64 } },
          ],
        },
      ],
    };
  } else {
    url = urls.endpoint(c.url, "/messages");
    delete header.Authorization;
    header["x-api-key"] = c.key;
    header["anthropic-version"] = "2026-10-21";
    body = {
      model: c.model,
      max_tokens: 8192,
      system: instruction,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all visible text." },
            {
              type: "image",
              source: { type: "base64", media_type: meta.mime, data: image64 },
            },
          ],
        },
      ],
    };
  }
  if (!c.key) {
    delete header.Authorization;
    delete header["x-api-key"];
  }
  return { method: "POST", url: url, header: header, body: body };
}
function content(parts) {
  if (typeof parts === "string") return parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map(function (x) {
      return typeof x === "string"
        ? x
        : x &&
            ["text", "output_text"].indexOf(x.type) >= 0 &&
            typeof x.text === "string"
          ? x.text
          : "";
    })
    .join("");
}
function parse(data) {
  if (!data || typeof data !== "object")
    throw new Error("模型 OCR 响应不是 JSON 对象。");
  if (data.error) throw new Error(data.error.message || "模型返回错误。");
  if (data.status && data.status !== "completed")
    throw new Error("模型 OCR 尚未完成或已截断。");
  var choice = data.choices && data.choices[0],
    candidate = data.candidates && data.candidates[0];
  var reason =
    (choice && choice.finish_reason) ||
    (candidate && candidate.finishReason) ||
    data.stop_reason;
  if (
    reason &&
    ["stop", "STOP", "end_turn", "stop_sequence"].indexOf(reason) < 0
  )
    throw new Error(
      "模型 OCR 未正常完成（" + reason + "），请缩小图片后重试。",
    );
  if (
    (choice && choice.message && choice.message.refusal) ||
    (data.promptFeedback && data.promptFeedback.blockReason)
  )
    throw new Error("模型拒绝识别此图片。");
  var text = "";
  if (choice)
    text =
      content(choice.message && choice.message.content) || choice.text || "";
  else if (Array.isArray(data.content)) text = content(data.content);
  else if (candidate)
    text = ((candidate.content && candidate.content.parts) || [])
      .filter(function (p) {
        return !p.thought;
      })
      .map(function (p) {
        return p.text || "";
      })
      .join("");
  else if (typeof data.output_text === "string") text = data.output_text;
  else if (Array.isArray(data.output))
    text = data.output
      .filter(function (x) {
        return x.type === "message";
      })
      .map(function (x) {
        if (
          (x.content || []).some(function (p) {
            return p.type === "refusal";
          })
        )
          throw new Error("模型拒绝识别此图片。");
        return content(x.content);
      })
      .join("\n");
  else if (typeof data.result === "string") text = data.result;
  return result.lines(text);
}
function run(ctx, c, q, meta) {
  ctx.request(prepare(c, q.image, meta), function (resp) {
    var e = ctx.error(resp);
    if (e) {
      ctx.done({ error: e });
      return;
    }
    ctx.done({ result: result.build(parse(resp.data), q) });
  });
}
module.exports = { run: run, prepare: prepare, parse: parse };
