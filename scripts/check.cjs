const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
for (const folder of ["lib", "tests", "scripts"])
  for (const f of fs
    .readdirSync(path.join(root, folder))
    .filter((f) => /\.(c?js)$/.test(f))) {
    const r = spawnSync(
      process.execPath,
      ["--check", path.join(root, folder, f)],
      { stdio: "inherit" },
    );
    if (r.status) process.exit(r.status);
  }
const entry = spawnSync(
  process.execPath,
  ["--check", path.join(root, "main.js")],
  { stdio: "inherit" },
);
if (entry.status) process.exit(entry.status);
const info = require("../info.json"),
  pkg = require("../package.json");
if (info.version !== pkg.version) throw Error("Version mismatch");
if (fs.existsSync(path.join(root, "Open-LLM-OCR-Roboflow.bobplugin")))
  throw Error("Obsolete duplicate Roboflow package must not be present");
const ids = info.options.map((o) => o.identifier);
if (new Set(ids).size !== ids.length) throw Error("Duplicate options");
for (const o of info.options) {
  if (
    o.type === "menu" &&
    !o.menuValues.some((v) => v.value === o.defaultValue)
  )
    throw Error("Invalid default " + o.identifier);
  if (/(?:ApiKey|apiKey|accessToken|AccessToken)$/.test(o.identifier) && o.textConfig?.type !== "secure")
    throw Error("Visible credential");
}
console.log("语法、版本与设置检查通过");
