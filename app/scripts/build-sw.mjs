import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
async function walk(dir) {
  let out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const files = (await walk("dist/client")).filter(
  (p) =>
    !p.includes("/ocr/") &&
    !p.split("/").some((part) => part.startsWith(".")) &&
    !p.endsWith("/_headers") &&
    !p.endsWith(".map") &&
    !p.endsWith("/sw.js"),
);
const urls = [
  "/",
  ...files.map(
    (p) => "/" + path.relative("dist/client", p).split(path.sep).join("/"),
  ),
];
const hash = crypto.createHash("sha256");
for (const f of files) hash.update(await fs.readFile(f));
let source = await fs.readFile("pwa/service-worker.ts", "utf8");
source = source
  .replace("__VERSION__", hash.digest("hex").slice(0, 12))
  .replace("__ASSETS__", JSON.stringify(urls));
const js = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(/export \{\};?/g, "");
await fs.writeFile("dist/client/sw.js", js);
console.log(`Offline shell: ${urls.length} assets`);
