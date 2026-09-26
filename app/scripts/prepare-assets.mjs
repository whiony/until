import fs from "node:fs/promises";
import sharp from "sharp";
await fs.mkdir("public/icons", { recursive: true });
for (const size of [180, 192, 512])
  await sharp(await fs.readFile("public/favicon.svg"))
    .resize(size, size)
    .png()
    .toFile(
      `public/icons/${size === 180 ? "apple-touch-icon" : `icon-${size}`}.png`,
    );
await fs.mkdir("public/ocr", { recursive: true });
await fs.copyFile(
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  "public/ocr/eng.traineddata.gz",
);
await fs.copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/ocr/worker.min.js",
);
for (const file of await fs.readdir("node_modules/tesseract.js-core"))
  if (file.endsWith(".wasm") || file.endsWith(".wasm.js"))
    await fs.copyFile(
      `node_modules/tesseract.js-core/${file}`,
      `public/ocr/${file}`,
    );
await fs.copyFile(
  "node_modules/tesseract.js/LICENSE.md",
  "public/ocr/LICENSE-tesseract.txt",
);

await fs.copyFile(
  "node_modules/tesseract.js-core/LICENSE",
  "public/ocr/LICENSE-core.txt",
);
