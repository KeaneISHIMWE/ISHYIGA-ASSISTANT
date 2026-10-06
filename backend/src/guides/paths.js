const fs = require("fs");
const path = require("path");

function firstExisting(paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return paths[paths.length - 1];
}

function resolveGuidesDir() {
  if (process.env.GUIDES_DIR) {
    return path.resolve(process.env.GUIDES_DIR);
  }

  return firstExisting([
    path.join(process.cwd(), "guide"),
    path.join(__dirname, "..", "..", "guide"),
  ]);
}

module.exports = { resolveGuidesDir };
