import type { Product } from "./domain";
export type Suggestion = {
  name: string;
  brand: string;
  category: string;
  size: string;
  barcode: string;
  image?: string;
  source: string;
  url?: string;
  completeness: number;
  savedProductId?: string;
};
export interface ProductProvider {
  lookup(barcode: string): Promise<Suggestion | null>;
}
export const validBarcode = (s: string) => /^\d{8}$|^\d{12,14}$/.test(s);
export class OpenFactsProvider implements ProductProvider {
  async lookup(barcode: string) {
    const r = await fetch(
      `/api/lookup?barcode=${encodeURIComponent(barcode)}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!r.ok)
      throw Error(
        r.status === 429
          ? "Please wait a minute before looking up another barcode."
          : "Product search is unavailable. Enter the name and date manually.",
      );
    return (await r.json()) as Suggestion | null;
  }
}
export async function lookupProduct(
  code: string,
  products: Product[],
  provider: ProductProvider = new OpenFactsProvider(),
) {
  const barcode = code.replace(/[\s-]/g, "");
  if (!validBarcode(barcode))
    throw Error("Enter an 8, 12, 13, or 14 digit retail barcode.");
  const p = products.find((p) => p.barcode === barcode);
  if (p)
    return {
      name: p.name,
      brand: p.brand,
      category: p.category,
      size: p.size,
      barcode,
      source: "Your saved products",
      completeness: 1,
      savedProductId: p.id,
    };
  if (!navigator.onLine)
    throw Error(
      "You’re offline. Add the name and date manually; the barcode will be kept.",
    );
  return provider.lookup(barcode);
}
