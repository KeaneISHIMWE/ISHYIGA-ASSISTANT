const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const envPath = path.join(__dirname, "..", ".env");
const envText = fs.readFileSync(envPath, "utf8");
const read = (name) => {
  const line = envText.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
};

const url =
  read("ISHYIGA_OVH_QUERY_URL") ||
  "https://www.ishyiga.net/ishyiga-assistant/account-query.php";
const key = read("ISHYIGA_OVH_QUERY_KEY");
if (!key) {
  console.error("ISHYIGA_OVH_QUERY_KEY missing in .env");
  process.exit(1);
}

const tmpDir = __dirname;
const urlFile = path.join(tmpDir, ".ovh-bridge-url.tmp");
const keyFile = path.join(tmpDir, ".ovh-bridge-key.tmp");
fs.writeFileSync(urlFile, url, { encoding: "ascii" });
fs.writeFileSync(keyFile, key, { encoding: "ascii" });

function setVar(name, file) {
  const input = fs.readFileSync(file);
  const result = spawnSync(
    "npx",
    ["--yes", "@railway/cli", "variable", "set", name, "--stdin"],
    {
      cwd: path.join(__dirname, ".."),
      input,
      encoding: "utf8",
      shell: true,
    }
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

setVar("ISHYIGA_OVH_QUERY_URL", urlFile);
setVar("ISHYIGA_OVH_QUERY_KEY", keyFile);
fs.unlinkSync(urlFile);
fs.unlinkSync(keyFile);
console.log("railway_ovh_env_updated");
