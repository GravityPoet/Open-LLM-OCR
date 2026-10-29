var models = {
  "glm-ocr": { path: "/infer/lmm" },
  "pp-ocr-small": { path: "/ocr/pp-ocr", ppVersion: "small-small" },
  "pp-ocr-tiny": { path: "/ocr/pp-ocr", ppVersion: "tiny-tiny" },
  "pp-ocr-medium": { path: "/ocr/pp-ocr", ppVersion: "medium-medium" },
  "qwen3vl-2b-instruct": { path: "/infer/lmm" },
  "qwen3_5-0.8b": { path: "/infer/lmm/qwen3_5-0.8b", thinking: false },
  "qwen3_5-2b": { path: "/infer/lmm/qwen3_5-2b", thinking: false },
  "qwen3_5-4b": { path: "/infer/lmm/qwen3_5-4b", thinking: false },
};
function find(id) {
  id = String(id || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(models, id) ? models[id] : null;
}
module.exports = { find: find };
