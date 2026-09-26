import { categories, type Records } from "./domain";
export const themes = ["green", "peach", "lavender", "blue"] as const;
export type Theme = (typeof themes)[number];
export type CategoryRule = {
  name: string;
  hidden?: boolean;
  replacement?: string;
};
const key = (name: string) => name.trim().toLocaleLowerCase("en");
export function resolvedCategory(r: Records, name: string): string {
  const seen = new Set<string>();
  while (name) {
    const k = key(name);
    if (seen.has(k)) throw Error("Category replacements cannot form a loop.");
    seen.add(k);
    const rule = r.settings.categoryRules?.find((x) => key(x.name) === k);
    if (!rule) return name.trim();
    if (rule.replacement === undefined) return rule.name;
    name = rule.replacement;
  }
  return "";
}
export function categoryNames(r: Records, selection = false): string[] {
  const names = [
    ...categories,
    ...(r.settings.categoryRules || []).map((x) => x.name),
    ...r.products.map((p) => p.category),
  ];
  const unique = new Map<string, string>();
  for (const name of names) {
    const resolved = resolvedCategory(r, name);
    const rule = r.settings.categoryRules?.find(
      (x) => key(x.name) === key(resolved),
    );
    if (resolved && !(selection && rule?.hidden))
      unique.set(key(resolved), resolved);
  }
  return [...unique.values()];
}
export function normalizeCategories(r: Records) {
  for (const p of r.products) p.category = resolvedCategory(r, p.category);
}
function putRule(r: Records, rule: CategoryRule) {
  const rules = r.settings.categoryRules || [];
  r.settings.categoryRules = [
    ...rules.filter((x) => key(x.name) !== key(rule.name)),
    rule,
  ];
  if (r.settings.categoryRules.length > 200)
    throw Error("The category management limit is 200 names.");
}
function availableName(r: Records, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 100 || clean.startsWith("__"))
    throw Error("Enter a category name of 1–100 characters.");
  if (
    [
      ...categories,
      ...(r.settings.categoryRules || []).map((x) => x.name),
      ...r.products.map((p) => p.category),
    ].some((x) => key(x) === key(clean))
  )
    throw Error(
      "This category name already exists or was retired. Choose another name.",
    );
  return clean;
}
export function addCategory(r: Records, name: string) {
  putRule(r, { name: availableName(r, name) });
}
export function hideCategory(r: Records, name: string, hidden: boolean) {
  if (!categories.includes(name))
    throw Error("Only built-in categories can be hidden.");
  putRule(r, { name, hidden });
}
export function replaceCategory(
  r: Records,
  name: string,
  replacement: string,
  rename = false,
) {
  if (categories.some((x) => key(x) === key(name)))
    throw Error("Built-in categories can be hidden, not deleted or renamed.");
  if (!categoryNames(r).includes(name))
    throw Error("This category changed. Reopen its settings.");
  if (rename) replacement = availableName(r, replacement);
  else if (
    replacement &&
    (!categoryNames(r).includes(replacement) || replacement === name)
  )
    throw Error("Choose a different existing category or Uncategorized.");
  if (rename) putRule(r, { name: replacement });
  putRule(r, { name, replacement });
  normalizeCategories(r);
}
