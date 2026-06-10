import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const checkOnly = process.argv.includes("--check-only");
const syntaxFiles = [
  "server.mjs",
  "scripts/build.mjs",
  "scripts/verify.mjs",
  "src/app.js",
  "src/db.js",
  "src/document-layout.js",
  "src/material-issue.js",
  "src/material-issue-pdf.js",
  "src/pdf.js",
  "src/utils.js"
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

if (!checkOnly) {
  const tests = readdirSync("tests")
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => join("tests", file));
  run("node", ["--test", ...tests]);
}
