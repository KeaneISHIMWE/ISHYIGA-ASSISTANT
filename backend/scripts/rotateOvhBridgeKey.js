const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const key = crypto.randomBytes(32).toString("hex");
const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
let found = false;
const next = lines.map((line) => {
  if (line.startsWith("ISHYIGA_OVH_QUERY_KEY=")) {
    found = true;
    return `ISHYIGA_OVH_QUERY_KEY=${key}`;
  }
  return line;
});
if (!found) {
  next.push(`ISHYIGA_OVH_QUERY_KEY=${key}`);
}
fs.writeFileSync(envPath, `${next.join("\n").replace(/\n*$/, "")}\n`, "utf8");
fs.writeFileSync(path.join(__dirname, ".ovh-bridge-key.tmp"), key, {
  encoding: "ascii",
});
console.log("rotated");
