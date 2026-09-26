import { test, expect } from "@playwright/test";
import { expandSection, setDate } from "./editor-helpers";
test.beforeEach(async ({ context, page }) => {
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "form@example.test",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
});
test("help toggles, is exclusive, dismisses and stays inside the modal; control boundaries are local", async ({
  page,
}) => {
  const help = page.getByRole("button", {
    name: "Help: Product photo",
    exact: true,
  });
  await help.click();
  await expect(page.getByRole("note")).toHaveCount(1);
  await expect(page.getByRole("note")).toContainText("recognize");
  await help.click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await help.click();
  await page
    .getByRole("button", { name: "Help: Label photo", exact: true })
    .click();
  await expect(page.getByRole("note")).toHaveCount(1);
  await expect(page.getByRole("note")).toContainText("printed date");
  const pop = await page.getByRole("note").boundingBox(),
    modal = await page.locator(".editor").boundingBox();
  expect(pop!.x).toBeGreaterThanOrEqual(modal!.x);
  expect(pop!.x + pop!.width).toBeLessThanOrEqual(modal!.x + modal!.width);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("note")).toHaveCount(0);
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("note")).toHaveCount(1);
  await page.getByLabel("Product name *").click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await expandSection(page, "More details");
  const location = page.getByLabel("Location", { exact: true }),
    field = location.locator("..");
  await field.locator(".field-label").click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  const box = await location.boundingBox();
  await page.mouse.move(box!.x + box!.width - 4, box!.y - 6);
  expect(await location.evaluate((el) => el.matches(":hover"))).toBe(false);
  await page.mouse.click(box!.x + box!.width - 4, box!.y - 6);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await location.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  const sizeHelp = page.getByRole("button", { name: "Help: Package size" }),
    helpBox = await sizeHelp.boundingBox();
  expect(helpBox!.width).toBe(32);
  expect(helpBox!.height).toBe(32);
  await page.getByText("Package size", { exact: true }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await expect(page.getByLabel("Package size", { exact: true })).toBeFocused();
  await sizeHelp.click();
  await page.locator(".editor-fields").evaluate((el) => (el.scrollTop = 0));
  await expect(page.getByRole("note")).toHaveCount(0);
  let pickerEvents = 0;
  page.on("filechooser", () => pickerEvents++);
  await page
    .locator(".photo-section .field-label")
    .first()
    .click({ position: { x: 5, y: 5 } });
  expect(pickerEvents).toBe(0);
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose product photo", exact: true })
    .first()
    .click();
  await (await chooser).setFiles([]);
  expect(pickerEvents).toBe(1);
});
test("all date fields show calendar dates, navigation and dismissal preserve values, selection and clear are explicit", async ({
  page,
}) => {
  await page.getByLabel("Product name *").fill("Calendar control record");
  for (const label of ["Printed date", "Opened date", "Purchase date"]) {
    if (label === "Opened date") await expandSection(page, "After opening");
    if (label === "Purchase date") await expandSection(page, "More details");
    const trigger = page.getByLabel(label, { exact: true });
    await expect(trigger).toHaveText("Add a date");
    await trigger.click();
    await expect(page.locator(".date-picker input")).toHaveCount(0);
    await page.getByLabel("Year", { exact: true }).selectOption("2028");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveText("Add a date");
    await setDate(page, label, "2026-09-25");
    await expect(trigger).toHaveText("25 Sep 2026");
    await trigger.click();
    await page.getByLabel("Month", { exact: true }).selectOption("10");
    await page.getByRole("heading", { name: "Add item", exact: true }).click();
    await expect(trigger).toHaveText("25 Sep 2026");
    await trigger.click();
    await page.getByRole("button", { name: "Clear date", exact: true }).click();
    await expect(trigger).toHaveText("Add a date");
    await setDate(page, label, "2026-09-25");
  }
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          ?.length,
    )
    .toBe(1);
  const records = (await (await page.request.get("/api/sync")).json()).records;
  expect(records.items[0]).toMatchObject({
    printedDate: "2026-09-25",
    openedDate: "2026-09-25",
    purchaseDate: "2026-09-25",
  });
});
test("duration unit alone never creates a rule, and entered duration preserves its unit in sync", async ({
  page,
}) => {
  await page.getByLabel("Product name *").fill("Optional duration");
  await expandSection(page, "After opening");
  await page.getByLabel("Duration unit", { exact: true }).click();
  await page.getByRole("option", { name: "Months", exact: true }).click();
  await expect(
    page.getByLabel("Use within after opening", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          ?.length,
    )
    .toBe(1);
  let records = (await (await page.request.get("/api/sync")).json()).records;
  expect(records.items[0].rule).toBeUndefined();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .first()
    .click();
  await page.getByLabel("Product name *").fill("Six month duration");
  await expandSection(page, "After opening");
  await page.getByLabel("Duration unit", { exact: true }).click();
  await page.getByRole("option", { name: "Months", exact: true }).click();
  await page.getByLabel("Use within after opening", { exact: true }).fill("6");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          ?.length,
    )
    .toBe(2);
  records = (await (await page.request.get("/api/sync")).json()).records;
  expect(records.items.find((i: { rule?: unknown }) => i.rule).rule).toEqual({
    amount: 6,
    unit: "months",
  });
});
test("mobile opens without input focus, photo heights agree, expanding reveals fields and keyboard bar restores without value loss", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByLabel("Product name *")).not.toBeFocused();
    await expect(page.locator(".editor .form-footer")).toBeVisible();
    const photos = page.getByRole("button", {
      name: /^Choose (product|label) photo$/,
    });
    expect((await photos.first().boundingBox())!.height).toBe(
      (await photos.last().boundingBox())!.height,
    );
    await page.screenshot({ path: `test-results/form-initial-${width}.png` });
    await expandSection(page, "More details");
    const quantity = page.getByLabel("Quantity", { exact: true });
    await expect(quantity).not.toBeFocused();
    const field = await quantity.boundingBox(),
      scroll = await page.locator(".editor-fields").boundingBox();
    expect(field!.y).toBeGreaterThanOrEqual(scroll!.y);
    expect(field!.y + field!.height).toBeLessThanOrEqual(
      scroll!.y + scroll!.height,
    );
    for (const control of [
      quantity,
      page.getByLabel("Brand", { exact: true }),
      page.getByLabel("Package size", { exact: true }),
    ])
      await expect(control).toHaveAttribute("autocomplete", "off");
    const name = page.getByLabel("Product name *");
    await name.fill("Keep my typed product");
    await page.setViewportSize({ width, height: 440 });
    await expect(page.locator("html")).toHaveClass(/keyboard-open/);
    await expect(page.locator(".editor .form-footer")).toBeHidden();
    const focused = await name.boundingBox(),
      region = await page.locator(".editor-fields").boundingBox();
    expect(focused!.y).toBeGreaterThanOrEqual(region!.y);
    expect(focused!.y + focused!.height).toBeLessThanOrEqual(
      region!.y + region!.height,
    );
    await page.screenshot({
      path: `test-results/form-keyboard-viewport-${width}.png`,
    });
    await name.blur();
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".editor .form-footer")).toBeVisible();
    await expect(name).toHaveValue("Keep my typed product");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add item", exact: true })
      .first()
      .click();
  }
});
test("narrow touch calendar and help remain reachable; visible expansion does not scroll", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    hasTouch: true,
  });
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "touch@example.test",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).tap();
  const helper = page.getByRole("button", {
    name: "Help: Label photo",
    exact: true,
  });
  await helper.tap();
  const note = await page.getByRole("note").boundingBox();
  expect(note!.x).toBeGreaterThanOrEqual(0);
  expect(note!.x + note!.width).toBeLessThanOrEqual(320);
  expect(note!.y).toBeGreaterThanOrEqual(0);
  expect(note!.y + note!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "test-results/form-touch-help-320.png" });
  await helper.tap();
  await expect(page.getByRole("note")).toHaveCount(0);
  const trigger = page.getByLabel("Printed date", { exact: true });
  await trigger.tap();
  const picker = page.getByRole("dialog", {
    name: "Printed date picker",
    exact: true,
  });
  const box = await picker.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "test-results/form-touch-calendar-320.png" });
  await page.getByLabel("Year", { exact: true }).selectOption("2026");
  await page.getByLabel("Month", { exact: true }).selectOption("8");
  await page
    .getByRole("button", { name: "Choose 25 Sep 2026", exact: true })
    .tap();
  await expect(trigger).toHaveText("25 Sep 2026");
  await trigger.tap();
  await page.getByRole("heading", { name: "Add item", exact: true }).tap();
  await expect(trigger).toHaveText("25 Sep 2026");
  await trigger.tap();
  await page.getByRole("button", { name: "Clear date", exact: true }).tap();
  await expect(trigger).toHaveText("Add a date");
  await context.close();

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1400 },
  });
  await desktop.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "expansion@example.test",
  });
  const wide = await desktop.newPage();
  await wide.goto("/");
  await wide.getByRole("button", { name: "Add item", exact: true }).click();
  // Leave enough visible space for the expanded first field; photo tools have
  // their own spacing and should not determine this disclosure regression.
  await wide.locator(".photo-section > summary").click();
  const scroll = wide.locator(".editor-fields");
  const before = await scroll.evaluate((el) => el.scrollTop);
  await expandSection(wide, "After opening");
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(before);
  await expect(
    wide.getByLabel("Use within after opening", { exact: true }),
  ).not.toBeFocused();
  await wide.getByLabel("Printed date", { exact: true }).click();
  await wide.screenshot({ path: "test-results/form-calendar-desktop.png" });
  await desktop.close();
});
