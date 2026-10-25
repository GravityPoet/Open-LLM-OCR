const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
class Data {
  constructor(value) {
    this.bytes = Buffer.from(value);
  }
  get length() {
    return this.bytes.length;
  }
  toUTF8() {
    return this.bytes.toString("utf8");
  }
  toBase64() {
    return this.bytes.toString("base64");
  }
  toHex() {
    return this.bytes.toString("hex");
  }
  toByteArray() {
    return [...this.bytes];
  }
  readUInt8(i) {
    return this.bytes[i] || 0;
  }
  appendData(data) {
    this.bytes = Buffer.concat([this.bytes, data.bytes]);
  }
}
function signal() {
  const subscriptions = new Set();
  return {
    subscribe(fn) {
      subscriptions.add(fn);
      return {
        dispose() {
          subscriptions.delete(fn);
        },
      };
    },
    send() {
      [...subscriptions].forEach((f) => f());
    },
    get size() {
      return subscriptions.size;
    },
  };
}
function load(options = {}, transport = {}, overrides = {}) {
  const requests = [],
    timers = new Map();
  let tick = 0,
    clock = 1000;
  const context = vm.createContext({
    $option: options,
    $info: { identifier: "io.github.gravitypoet.jk.llm.ocr" },
    $env: { appVersion: "1.21.2" },
    $log: { error() {}, info() {} },
    $data: {
      isData: (v) => v instanceof Data,
      fromBase64: (v) => new Data(Buffer.from(v, "base64")),
      fromHex: (v) => new Data(Buffer.from(v, "hex")),
      fromUTF8: (v) => new Data(v),
      fromByteArray: (v) => new Data(v),
    },
    $file: {
      read(v) {
        if (!v.startsWith("/"))
          throw Error("Bob requires an absolute virtual path");
        return new Data(
          fs.readFileSync(path.resolve(__dirname, "..", v.slice(1))),
        );
      },
    },
    $signal: { new: signal },
    $timer: {
      schedule(o) {
        timers.set(++tick, { ...o, at: clock + o.interval * 1000 });
        return tick;
      },
      invalidate(id) {
        timers.delete(id);
      },
    },
    $http: {
      request(r) {
        requests.push(r);
        return transport.request?.(r);
      },
    },
    ...overrides,
  });
  const RealDate = Date;
  context.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [clock]));
    }
    static now() {
      return clock;
    }
  };
  const root = path.resolve(__dirname, ".."),
    cache = {};
  function loadFile(file) {
    if (cache[file]) return cache[file].exports;
    const m = { exports: {} };
    cache[file] = m;
    const fn = vm.runInContext(
      "(function(require,module,exports){" +
        fs.readFileSync(file, "utf8") +
        "\n})",
      context,
      { filename: file },
    );
    fn((ref) => loadFile(path.resolve(path.dirname(file), ref)), m, m.exports);
    return m.exports;
  }
  context.require = (ref) => loadFile(path.resolve(root, ref));
  vm.runInContext(fs.readFileSync(path.join(root, "main.js"), "utf8"), context);
  return {
    context,
    requests,
    timers,
    ocr: context.ocr,
    validate: context.pluginValidate,
    module: (n) => loadFile(path.join(root, "lib", n + ".js")),
    advance(ms) {
      clock += ms;
      for (const [id, t] of [...timers])
        if (t.at <= clock && timers.has(id)) {
          timers.delete(id);
          t.handler();
        }
    },
    now: () => clock,
  };
}
function query(image) {
  const completions = [];
  const value = {
    image:
      image ||
      new Data(
        Buffer.from(
          "89504e470d0a1a0a0000000d4948445200000280000000c80802000000",
          "hex",
        ),
      ),
    from: "auto",
    detectFrom: "en",
    pixelWidth: 640,
    pixelHeight: 200,
    cancelSignal: signal(),
  };
  return { value, completions, done: (p) => completions.push(p) };
}
const ok = (data, code = 200, headers = {}) => ({
  response: { statusCode: code, headers },
  data,
});
module.exports = { Data, load, query, ok, signal };
