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
  if (!value) {
    await page.getByRole("button", { name: "Clear date", exact: true }).click();
    return;
  }
  const [year, month, day] = value.split("-").map(Number);
  const picker = page.getByRole("dialog", {
    name: `${label} picker`,
    exact: true,
  });
  await picker.getByLabel("Year", { exact: true }).selectOption(String(year));
  await picker
    .getByLabel("Month", { exact: true })
    .selectOption(String(month - 1));
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  await picker
    .getByRole("button", {
      name: `Choose ${String(day).padStart(2, "0")} ${months[month - 1]} ${year}`,
      exact: true,
    })
    .click();
}
