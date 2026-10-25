function parse(value) {
  if (
    typeof value !== "string" ||
    /[\s\x00-\x1f\\#]/.test(value) ||
    value.length > 8192
  )
    throw new Error("接口地址格式不正确，请填写完整 http(s) 地址。");
  var m = /^(https?):\/\/([^/?]+)([^?]*)(\?.*)?$/i.exec(value);
  if (
    !m ||
    /@|%/.test(m[2]) ||
    !/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(m[2])
  )
    throw new Error("接口地址不能包含用户名、密码或无效主机。");
  var host = m[2].toLowerCase(),
    port = /:(\d+)$/.exec(host);
  if (port && (+port[1] < 1 || +port[1] > 65535))
    throw new Error("接口端口无效。");
  return {
    origin: m[1].toLowerCase() + "://" + host,
    host: host,
    path: (m[3] || "").replace(/\/+$/, ""),
    query: m[4] || "",
  };
}
function endpoint(value, suffix) {
  var u = parse(value);
  return (
    u.origin + (u.path.endsWith(suffix) ? u.path : u.path + suffix) + u.query
  );
}
function params(value, fields) {
  var u = parse(value),
    pairs = u.query ? u.query.slice(1).split("&") : [];
  Object.keys(fields).forEach(function (key) {
    pairs = pairs.filter(function (pair) {
      return decodeURIComponent(pair.split("=")[0]) !== key;
    });
    pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(fields[key]));
  });
  return u.origin + u.path + (pairs.length ? "?" + pairs.join("&") : "");
}
function child(value, id) {
  var u = parse(value);
  return u.origin + u.path + "/" + encodeURIComponent(id) + u.query;
}
function sameOrigin(value, base) {
  var u = parse(value),
    b = parse(base);
  var a = u.origin.replace(/:443$/, ""),
    c = b.origin.replace(/:443$/, "");
  if (a !== c)
    throw new Error("轮询地址与所配置服务不一致，已停止以保护密钥。");
  return value;
}
function resultUrl(value) {
  var u = parse(value);
  if (
    !/^https:\/\//.test(u.origin) ||
    !/(^|\.)(bcebos\.com|baidubce\.com|aistudio-app\.com)$/.test(u.host)
  )
    throw new Error("结果下载地址不是受支持的百度存储地址。");
  return value;
}
module.exports = {
  parse: parse,
  endpoint: endpoint,
  params: params,
  child: child,
  sameOrigin: sameOrigin,
  resultUrl: resultUrl,
};
