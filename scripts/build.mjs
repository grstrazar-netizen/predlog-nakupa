import { cp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const outputDir = "dist";
const files = ["index.html", "manifest.webmanifest", "service-worker.js", "icon.svg"];
const directories = ["assets", "src"];

async function assertExists(path) {
  await stat(path);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const file of files) {
  await assertExists(file);
  await cp(file, join(outputDir, file));
}

for (const directory of directories) {
  await assertExists(directory);
  await cp(directory, join(outputDir, directory), { recursive: true });
}

console.log(`Built ${outputDir}/ for Vercel.`);
