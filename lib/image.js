// Some Bob builds expose data conversion methods but no numeric .length property.
// Encode once, derive size and signature, and share that encoding across adapters.
function inspect(data, mode) {
  if (!$data.isData(data) || typeof data.toBase64 !== "function") {
    throw new Error("图片数据为空或格式无效。");
  }
  var encoded = data.toBase64();
  if (typeof encoded !== "string" || !encoded.length)
    throw new Error("图片数据为空。");
  var limit = mode === "azure" ? 20 : mode === "openDocRouter" ? 3 : 30;
  var padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  var bytes = Math.floor((encoded.length * 3) / 4) - padding;
  if (bytes > limit * 1024 * 1024)
    throw new Error("图片超过 " + limit + " MB，请缩小截图。");
  var alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
    b = [],
    accumulator = 0,
    bits = 0;
  for (var i = 0; i < Math.min(44, encoded.length); i++) {
    var code = alphabet.indexOf(encoded.charAt(i));
    if (code < 0) break;
    accumulator = (accumulator << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      b.push((accumulator >> bits) & 255);
    }
  }
  var kind =
    b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
      ? "png"
      : b[0] === 255 && b[1] === 216
        ? "jpeg"
        : b[0] === 71 && b[1] === 73 && b[2] === 70
          ? "gif"
          : b[0] === 66 && b[1] === 77
            ? "bmp"
            : b[0] === 82 && b[1] === 73 && b[8] === 87 && b[9] === 69
              ? "webp"
              : (b[0] === 73 && b[1] === 73 && b[2] === 42) ||
                  (b[0] === 77 && b[1] === 77 && b[3] === 42)
                ? "tiff"
                : "unknown";
  var allowed =
    mode === "cloudAsync"
      ? ["png", "jpeg"]
      : mode === "providerCloud" || mode === "mistral"
        ? ["png", "jpeg", "gif", "webp"]
        : mode === "roboflow" || mode === "openDocRouter"
          ? ["png", "jpeg", "gif", "webp", "bmp", "tiff", "pdf"]
          : mode === "roboflow" || mode === "openDocRouter"
            ? ["png", "jpeg", "gif", "webp", "bmp", "tiff", "pdf"]
            : mode === "azure"
              ? ["png", "jpeg", "bmp", "tiff"]
              : ["png", "jpeg", "gif", "webp", "bmp", "tiff"];
  if (allowed.indexOf(kind) < 0)
    throw new Error("此服务不支持当前图片格式，请使用 PNG/JPG 截图。");
  return { kind: kind, mime: "image/" + kind, base64: encoded, bytes: bytes };
}
module.exports = { inspect: inspect };
