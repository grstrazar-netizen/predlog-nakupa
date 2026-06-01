import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const serveDist = process.argv.includes("--dist");
const root = resolve(projectRoot, process.env.SERVE_DIR || (serveDist ? "dist" : "."));
const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

function resolvePath(url) {
  const parsed = new URL(url, `http://localhost:${port}`);
  const rawPath = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  return resolve(root, `.${decodeURIComponent(rawPath)}`);
}

const server = createServer((req, res) => {
  let filePath;

  try {
    filePath = resolvePath(req.url || "/");
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const acceptsHtml = String(req.headers.accept || "").includes("text/html");
  const isInsideRoot = filePath === root || filePath.startsWith(rootPrefix);
  const hasFile = isInsideRoot && existsSync(filePath) && statSync(filePath).isFile();

  if (!hasFile && acceptsHtml) {
    filePath = resolve(root, "index.html");
  }

  if (!filePath.startsWith(rootPrefix) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-cache"
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Predlog app running at http://${host}:${port}`);
  console.log(`Serving ${root}`);
});
