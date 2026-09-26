import { test, expect } from "@playwright/test";
import { expandSection, setDate } from "./editor-helpers";
test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "creation@example.test",
  }),
);
test("optional dates commit only on day selection, clear explicitly, and name-only remains unclassified", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const name = page.getByLabel("Product name *"),
    date = page.getByLabel("Printed date", { exact: true });
  await name.fill("Unclassified name only");
  await expect(name).toHaveAttribute("type", "text");
  await expect(date).toHaveText("Add a date");
  await expect(date).toHaveAccessibleName("Printed date");
  await date.click();
  await page.getByLabel("Year", { exact: true }).selectOption("2030");
  await page.keyboard.press("Escape");
  await expect(date).toHaveText("Add a date");
  await date.click();
  await page.keyboard.press("Escape");
  await expect(date).toHaveText("Add a date");
  await setDate(page, "Printed date", "2029-04-15");
  await expect(date).toHaveText("15 Apr 2029");
  await date.click();
  await page.getByRole("button", { name: "Clear date", exact: true }).click();
  await expect(date).toHaveText("Add a date");
  await page.getByLabel("Date type", { exact: true }).click();
  await page.getByRole("option", { name: "Best before", exact: true }).click();
  await expandSection(page, "More details");
  for (const label of ["Location", "Category"])
    await expect(page.getByLabel(label, { exact: true })).toContainText(
      `No ${label.toLowerCase()} selected`,
    );
  await page.getByLabel("Purchase date", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Purchase date", { exact: true })).toHaveText(
    "Add a date",
  );
  await setDate(page, "Purchase date", "2026-09-01");
  await page.getByLabel("Purchase date", { exact: true }).click();
  await page.getByRole("button", { name: "Clear date", exact: true }).click();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await expect(page.locator(".item-card")).toContainText("Needs a date");
  const r = await (await page.request.get("/api/sync")).json();
  expect(r.records.items[0]).toMatchObject({
    printedDate: "",
    purchaseDate: "",
    location: "",
    dateKind: "best before",
  });
  expect(r.records.products[0].category).toBe("");
  await page.reload();
  await page.getByRole("tab", { name: /All items/ }).click();
  await page
    .getByRole("button", { name: "View Unclassified name only" })
    .click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await expect(date).toHaveText("Add a date");
});
test("compact creation preserves values across help, disclosure, photos, keyboard-sized viewport and close warning", async ({
  page,
}) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", {
        name: width > 760 ? "Add item" : "Add item",
        exact: true,
      })
      .first()
      .click();
    await page.screenshot({
      path: `test-results/creation-default-${width}.png`,
      animations: "disabled",
    });
    const name = page.getByLabel("Product name *");
    await name.fill(
      "A long product name that remains editable and is not a large notes field",
    );
    expect((await name.boundingBox())!.height).toBeLessThan(60);
    for (const title of [
      "Photos & label recognition",
      "After opening",
      "More details",
    ]) {
      const summary = page
        .locator(".editor summary")
        .filter({ hasText: title });
      await summary.click();
      const open = await summary.getAttribute("aria-expanded");
      expect((await summary.locator("..").getAttribute("open")) !== null).toBe(
        open === "true",
      );
      await summary.click();
    }
    await expandSection(page, "More details");
    await page.getByLabel("Brand", { exact: true }).fill("Test Brand");
    await page
      .getByRole("button", { name: "Help: Printed date", exact: true })
      .click();
    await expect(page.getByRole("note")).toContainText(
      "printed on the packaging",
    );
    await page.keyboard.press("Escape");
    await expandSection(page, "Photos & label recognition");
    await page
      .getByLabel("Product photo", { exact: true })
      .setInputFiles("public/demo/yogurt.png");
    await page
      .getByRole("button", { name: "Cancel crop", exact: true })
      .click();
    await expect(name).toHaveValue(/A long product/);
    await page
      .getByLabel("Product photo", { exact: true })
      .setInputFiles("public/demo/yogurt.png");
    await page
      .getByRole("button", { name: "Keep full photo", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /A long product/ }),
    ).toBeVisible();
    await page
      .getByLabel("Label photo", { exact: true })
      .setInputFiles("tests/fixtures/label.png");
    await expect(
      page.getByRole("button", { name: "Read date from photo", exact: true }),
    ).toBeVisible();
    if (width <= 760) {
      const intro = page.locator('.editor [data-slot="dialog-description"]');
      await page.locator(".editor-fields").evaluate((el) => (el.scrollTop = 0));
      const before = await intro.boundingBox();
      await page
        .locator(".editor-fields")
        .evaluate((el) => (el.scrollTop = 150));
      expect((await intro.boundingBox())!.y).toBeLessThan(before!.y);
      expect(
        (await page.locator(".editor .form-footer").boundingBox())!.height,
      ).toBeLessThan(90);
    }
    await name.focus();
    await page.setViewportSize({ width, height: 520 });
    await name.blur();
    await expect(name).toHaveValue(/A long product/);
    await expect(page.getByLabel("Brand", { exact: true })).toHaveValue(
      "Test Brand",
    );
    expect(
      await page
        .locator(".editor")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(name).toHaveValue(/A long product/);
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".editor-fields").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: `test-results/creation-${width}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(page.locator(".editor")).toHaveCount(0);
  }
});
