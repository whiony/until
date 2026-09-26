import { validDate, type Duration } from "./domain";
export type Recognition = {
  text: string;
  dates: string[];
  rules: Duration[];
  confidence: number;
};
export function interpretText(text: string, confidence = 0): Recognition {
  const dates = new Set<string>();
  for (const m of text.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    if (validDate(d)) dates.add(d);
  }
  for (const m of text.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/g)) {
    for (const [day, month] of [
      [m[1], m[2]],
      [m[2], m[1]],
    ]) {
      const d = `${m[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      if (validDate(d)) dates.add(d);
    }
  }
  const rules: Duration[] = [];
  for (const m of text.matchAll(
    /(?:within|use\s+within|after\s+opening[^\d]{0,12})\s*(\d+)\s*(days?|weeks?|months?)/gi,
  )) {
    const amount = Number(m[1]);
    if (amount > 0 && amount <= 3650)
      rules.push({
        amount,
        unit: (m[2].toLowerCase().replace(/s$/, "") + "s") as Duration["unit"],
      });
  }
  return { text, dates: [...dates], rules, confidence };
}
export async function recognizePhoto(
  blob: Blob,
  language: string,
  onProgress: (s: string) => void,
  mode: "date" | "product" = "date",
): Promise<Recognition> {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker(language, 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    ...(language === "eng" ? { langPath: "/ocr" } : {}),
    logger: (m) =>
      onProgress(`${m.status} ${Math.round(m.progress * 100) || 0}%`),
  });
  try {
    if (mode === "product")
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    let result = await worker.recognize(blob);
    if (
      mode === "product" &&
      !productTextCandidates(result.data.text, result.data.confidence).length
    ) {
      // A high-contrast working copy helps text on tinted packaging. Never changes the saved photo.
      const image = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(3, 1600 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        const context = canvas.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const l =
            0.2126 * pixels.data[i] +
            0.7152 * pixels.data[i + 1] +
            0.0722 * pixels.data[i + 2];
          pixels.data[i] =
            pixels.data[i + 1] =
            pixels.data[i + 2] =
              l < 120 ? 0 : 255;
        }
        context.putImageData(pixels, 0, 0);
        const working = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(Error("Could not read photo"))),
            "image/png",
          ),
        );
        const enhanced = await worker.recognize(working);
        if (
          productTextCandidates(enhanced.data.text, enhanced.data.confidence)
            .length
        )
          result = enhanced;
      } finally {
        image.close();
      }
    }
    return interpretText(result.data.text, result.data.confidence);
  } finally {
    await worker.terminate();
  }
}

// Suggestions are verbatim OCR lines, never visual product guesses or inferred brands.
export function productTextCandidates(text: string, confidence: number) {
  if (confidence < 40) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 3 &&
        line.length <= 200 &&
        /[A-Za-zÀ-ž]{3}/.test(line) &&
        !/(ingredients|nutrition|best before|use by|expiry|expiration|www\.|https?:|\d{4}[-/.]\d)/i.test(
          line,
        ),
    )
    .slice(0, 8);
}
