var service = require("./lib/service.js");
function supportLanguages() {
  return service.languages();
}
function supportBoundingBox() {
  return service.bounding();
}
function pluginTimeoutInterval() {
  return Math.max(30, Math.min(300, service.timeout() + 5));
}
function pluginValidate(completion) {
  service.validate(completion);
}
function ocr(query, completion) {
  service.ocr(query, completion);
}
