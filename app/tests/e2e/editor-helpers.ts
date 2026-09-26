import { expect, type Page } from "@playwright/test";
export async function expandSection(page: Page, title: string) {
  const summary = page.locator(".editor summary").filter({ hasText: title });
  if ((await summary.getAttribute("aria-expanded")) !== "true")
    await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
}
export async function setDate(page: Page, label: string, value: string) {
  if (label === "Purchase date") await expandSection(page, "More details");
  if (label === "Opened date") await expandSection(page, "After opening");
  await page.getByLabel(label, { exact: true }).click();
  await page
    .getByLabel(`Choose ${label.toLowerCase()}`, { exact: true })
    .fill(value);
  await page.getByRole("button", { name: "Apply date", exact: true }).click();
}
