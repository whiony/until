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
): Promise<Recognition> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language, 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    ...(language === "eng" ? { langPath: "/ocr" } : {}),
    logger: (m) =>
      onProgress(`${m.status} ${Math.round(m.progress * 100) || 0}%`),
  });
  try {
    const result = await worker.recognize(blob);
    return interpretText(result.data.text, result.data.confidence);
  } finally {
    await worker.terminate();
  }
}
