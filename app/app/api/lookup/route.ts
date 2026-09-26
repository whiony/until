import type { Suggestion } from "@/lib/until/lookup";
import { validBarcode } from "@/lib/until/lookup";
import { owner, failure } from "@/lib/until/server";
const sources = [
  ["openfoodfacts", "Food", "Open Food Facts"],
  ["openbeautyfacts", "Beauty", "Open Beauty Facts"],
  ["openpetfoodfacts", "Pet", "Open Pet Food Facts"],
  ["openproductsfacts", "Household", "Open Products Facts"],
];
const cache = new Map<string, { at: number; value: Suggestion | null }>();
let lastRequests: number[] = [];
export async function GET(req: Request) {
  try {
    await owner(req);
  } catch (error) {
    return failure(error);
  }
  const barcode = new URL(req.url).searchParams.get("barcode") || "";
  if (!validBarcode(barcode))
    return new Response("Invalid barcode", { status: 400 });
  const cached = cache.get(barcode);
  if (cached && Date.now() - cached.at < 86400000)
    return Response.json(cached.value);
  lastRequests = lastRequests.filter((t) => Date.now() - t < 60000);
  if (lastRequests.length >= 12)
    return new Response("Slow down", { status: 429 });
  let failed = false;
  for (const [domain, category, source] of sources) {
    lastRequests.push(Date.now());
    try {
      const r = await fetch(
        `https://world.${domain}.org/api/v3/product/${barcode}.json?fields=product_name,product_name_en,brands,quantity,image_front_url`,
        {
          headers: {
            "User-Agent": "Until/0.1 (https://github.com/whiony/until)",
          },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (r.status === 404) continue;
      if (!r.ok) {
        failed = true;
        continue;
      }
      const data = (await r.json()) as { product?: Record<string, string> };
      const p = data.product;
      if (!p || (!p.product_name && !p.product_name_en)) continue;
      const value: Suggestion = {
        name: p.product_name_en || p.product_name,
        brand: p.brands || "",
        category,
        size: p.quantity || "",
        barcode,
        image: p.image_front_url,
        source,
        url: `https://world.${domain}.org/product/${barcode}`,
        completeness:
          [p.product_name, p.brands, p.quantity, p.image_front_url].filter(
            Boolean,
          ).length / 4,
      };
      cache.set(barcode, { at: Date.now(), value });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      return Response.json(value);
    } catch {
      failed = true;
    }
  }
  if (failed) return new Response("Sources unavailable", { status: 503 });
  cache.set(barcode, { at: Date.now(), value: null });
  return Response.json(null);
}
