var result = require("./result.js");
function finite(value) {
  return typeof value === "number" && isFinite(value);
}
function compact(value) {
  return value.replace(/\s/g, "");
}
function median(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function lines(data) {
  var original = result.lines(data.result),
    image = data.image,
    predictions = data.predictions;
  if (!image || !finite(image.width) || !finite(image.height) ||
      image.width <= 0 || image.height <= 0 || !Array.isArray(predictions) ||
      predictions.length < 1 || predictions.length > 20000 || data.result.length > 1000000)
    return original;
  var boxes = [], pitches = [], count = 0;
  for (var i = 0; i < predictions.length; i++) {
    var p = predictions[i], text = p && p["class"];
    if (!p || typeof text !== "string" || !text.trim() ||
        !finite(p.x) || !finite(p.y) || !finite(p.width) || !finite(p.height) ||
        p.width <= 0 || p.height <= 0 || p.width > image.width || p.height > image.height)
      return original;
    var left = p.x - p.width / 2, top = p.y - p.height / 2;
    if (left < 0 || top < 0 || left + p.width > image.width || top + p.height > image.height)
      return original;
    count += text.length;
    if (count > 1000000) return original;
    boxes.push({ text: text, left: left, top: top, bottom: top + p.height,
      width: p.width, height: p.height, index: i });
    // Long ASCII runs provide a useful pitch estimate; short labels and CJK
    // glyph widths do not establish the width of a code indentation space.
    if (text.length >= 8 && /^[\x20-\x7e]+$/.test(text)) {
      var pitch = p.width / text.length;
      if (pitch >= 1 && pitch <= image.width / 2) pitches.push(pitch);
    }
  }
  // Coordinates do not depend on whether a font pitch can be established.
  var advance = pitches.length >= 2 ? median(pitches) : null;
  if (advance) {
    var consistent = pitches.filter(function (value) {
      return Math.abs(value - advance) <= advance * 0.15;
    });
    advance = consistent.length >= 2 ? median(consistent) : null;
  }
  boxes.sort(function (a, b) { return a.top - b.top || a.left - b.left || a.index - b.index; });
  var rows = [];
  boxes.forEach(function (box) {
    var row = rows[rows.length - 1];
    var overlap = row ? Math.min(row.bottom, box.bottom) - Math.max(row.top, box.top) : 0;
    if (!row || overlap < Math.min(row.height, box.height) * 0.5) {
      rows.push({ parts: [box], left: box.left, top: box.top,
        right: box.left + box.width, bottom: box.bottom, height: box.height });
    } else {
      row.parts.push(box);
      row.left = Math.min(row.left, box.left);
      row.top = Math.min(row.top, box.top);
      row.right = Math.max(row.right, box.left + box.width);
      row.bottom = Math.max(row.bottom, box.bottom);
    }
  });
  var origin = Math.min.apply(null, rows.map(function (row) { return row.left; }));
  var buckets = Object.create(null);
  rows.forEach(function (row) {
    row.parts.sort(function (a, b) { return a.left - b.left || a.index - b.index; });
    var key = compact(row.parts.map(function (box) { return box.text; }).join(" "));
    if (!buckets[key]) buckets[key] = { values: [], next: 0 };
    buckets[key].values.push(row);
  });
  var characters = data.result.length;
  var formatted = original.map(function (item) {
    var text = item.text, bucket = buckets[compact(text)];
    if (!bucket || bucket.next >= bucket.values.length) return item;
    var row = bucket.values[bucket.next++];
    var output = {
      text: text,
      boundingBox: {
        points: [
          { x: row.left / image.width, y: row.top / image.height },
          { x: row.right / image.width, y: row.top / image.height },
          { x: row.right / image.width, y: row.bottom / image.height },
          { x: row.left / image.width, y: row.bottom / image.height },
        ],
      },
    };
    if (!advance || /^\s/.test(text)) return output;
    var offset = row.left - origin, spaces = Math.round(offset / advance);
    // Only use observable, near-integer offsets. Preserve the source text
    // when geometry cannot establish an indentation instead of guessing it.
    if (spaces < 2 || spaces > 32 || Math.abs(offset - spaces * advance) > advance * 0.3)
      return output;
    characters += spaces;
    output.text = new Array(spaces + 1).join(" ") + text;
    return output;
  });
  return characters > 1000000 ? original : formatted;
}
module.exports = { lines: lines };
