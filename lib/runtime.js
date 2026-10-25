var urls = require("./url.js");
function redact(value, options) {
  var text = String(value || "请求失败。");
  Object.keys(options || {}).forEach(function (key) {
    var v = options[key];
    if (typeof v === "string" && v && /key|token/i.test(key)) {
      text = text.split(v).join("[已隐藏]");
      text = text.split(encodeURIComponent(v)).join("[已隐藏]");
      var bare = v.replace(/^Bearer\s+/i, "").trim();
      if (bare) text = text.split(bare).join("[已隐藏]");
    }
  });
  return text
    .replace(/https?:\/\/[^\s<>"]+/g, function (url) {
      return url
        .replace(/\/\/[^/]*@/, "//[已隐藏]@")
        .replace(/\?.*$/, "?[已隐藏]");
    })
    .slice(0, 500);
}
function makeError(type, message, options, status) {
  var e = { type: type, message: redact(message, options) };
  if (status) e.addition = { statusCode: status };
  return e;
}
function upstream(resp, options) {
  var status = resp && resp.response && resp.response.statusCode;
  if (status >= 200 && status < 300 && !resp.error) return null;
  var type =
    status === 401 || status === 403
      ? "secretKey"
      : status === 404
        ? "notFound"
        : status === 429 || !status
          ? "network"
          : "api";
  var body = resp && resp.data;
  var detail =
    (body && body.error && (body.error.message || body.error.code)) ||
    (body && body.message) ||
    (typeof body === "string" && body) ||
    (resp &&
      resp.error &&
      (resp.error.message || resp.error.localizedDescription)) ||
    "";
  var message = status ? "请求失败（HTTP " + status + "）。" : "网络请求失败。";
  if (status === 401 || status === 403)
    message += "请核对资源类型、Endpoint、密钥和访问权限。";
  else if (status === 429) message += "请求过于频繁或配额不足，请稍后重试。";
  if (detail) message += " " + detail;
  return makeError(type, message, options, status);
}
function create(query, timeout, options, completion) {
  var finished = false,
    deadline = Date.now() + timeout * 1000,
    timers = [],
    subscription;
  var abort =
    typeof $signal !== "undefined" && $signal.new
      ? $signal.new()
      : query.cancelSignal;
  function done(payload) {
    if (finished) return;
    finished = true;
    timers.forEach(function (id) {
      $timer.invalidate(id);
    });
    timers = [];
    if (subscription && subscription.dispose) subscription.dispose();
    if (payload.error) {
      payload.error = makeError(
        payload.error.type || "api",
        payload.error.message,
        options,
        payload.error.addition && payload.error.addition.statusCode,
      );
      if (abort && abort.send) abort.send();
    }
    completion(payload);
  }
  function fail(message, type) {
    done({ error: makeError(type || "api", message, options) });
  }
  function guard(fn) {
    return function () {
      if (finished) return;
      try {
        fn.apply(null, arguments);
      } catch (e) {
        done({
          error:
            e.serviceError ||
            makeError("api", e.message || "响应解析失败。", options),
        });
      }
    };
  }
  function remaining() {
    return Math.max(0, (deadline - Date.now()) / 1000);
  }
  function schedule(seconds, fn) {
    if (finished) return;
    if (seconds >= remaining()) {
      fail("OCR 请求超时，请缩小图片或提高超时。", "network");
      return;
    }
    var id = $timer.schedule({
      interval: seconds,
      repeats: false,
      handler: guard(function () {
        timers = timers.filter(function (v) {
          return v !== id;
        });
        fn();
      }),
    });
    timers.push(id);
  }
  function request(spec, fn) {
    if (finished) return;
    var left = remaining();
    if (left <= 0) {
      fail("OCR 请求超时。", "network");
      return;
    }
    try {
      urls.parse(spec.url);
      spec.timeout = Math.min(spec.timeout || left, left);
      spec.cancelSignal = abort;
      var received = false;
      spec.handler = guard(function (resp) {
        if (received) return;
        received = true;
        if (remaining() <= 0) {
          fail("OCR 请求超时。", "network");
          return;
        }
        fn(resp);
      });
      $http.request(spec);
    } catch (e) {
      fail(e.message || "无法发送请求。", "network");
    }
  }
  timers.push(
    $timer.schedule({
      interval: timeout,
      repeats: false,
      handler: function () {
        fail("OCR 请求超时，请缩小图片或提高超时。", "network");
      },
    }),
  );
  if (query.cancelSignal && query.cancelSignal.subscribe) {
    subscription = query.cancelSignal.subscribe(function () {
      fail("已取消识别。", "network");
    });
    if (finished && subscription && subscription.dispose)
      subscription.dispose();
  }
  return {
    done: done,
    fail: fail,
    guard: guard,
    request: request,
    schedule: schedule,
    remaining: remaining,
    error: function (resp) {
      return upstream(resp, options);
    },
    get finished() {
      return finished;
    },
  };
}
module.exports = {
  create: create,
  redact: redact,
  error: makeError,
  upstream: upstream,
};
