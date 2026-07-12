import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const checkOnly = process.argv.includes("--check-only");
const syntaxFiles = [
  "server.mjs",
  "scripts/build.mjs",
  "scripts/verify.mjs",
  ...readdirSync("src")
    .filter((file) => file.endsWith(".js"))
    .map((file) => join("src", file))
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

for (const file of syntaxFiles) {
  run("node", ["--check", file]);
}

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const publicVersion = JSON.parse(readFileSync("version.json", "utf8")).version;
const appVersionSource = readFileSync("src/app-version.js", "utf8");
const appVersion = appVersionSource.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];

if (!appVersion || packageVersion !== appVersion || publicVersion !== appVersion) {
  console.error(
    `Različice se ne ujemajo: package=${packageVersion}, app=${appVersion || "manjka"}, public=${publicVersion}.`
  );
  process.exit(1);
}

if (!checkOnly) {
  const tests = readdirSync("tests")
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => join("tests", file));
  run("node", ["--test", ...tests]);
}
