import { test, expect } from "@playwright/test";
import { expandSection } from "./editor-helpers";

test.beforeEach(async ({ context, page }) => {
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "semantics@example.test",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
});

test("rendered item controls have stable semantics, one form owner and only one required indication", async ({
  page,
}) => {
  await expandSection(page, "After opening");
  await expandSection(page, "More details");
  const form = page.locator("#until-item-form");
  await expect(form).toHaveAttribute("autocomplete", "off");
  await expect(form.locator("form")).toHaveCount(0);
  await expect(form.locator("[required]")).toHaveCount(1);
  await expect(form.locator("[required]")).toHaveAttribute(
    "id",
    "until-product-title",
  );
  await expect(
    page.getByLabel("Product name *", { exact: true }),
  ).toBeVisible();
  await expect(form.locator(".date-section h2")).toHaveText("Dates");
  await expect(form.locator('[data-slot="dialog-description"]')).toHaveText(
    "Start with a name. Add a date whenever you have it.",
  );
  const fields = [
    [
      "Product name *",
      "until-product-title",
      "until-product-title",
      "text",
      "text",
    ],
    ["Brand", "product-brand", "until-product-brand", "text", "text"],
    ["Package size", "product-size", "until-package-size", "text", "text"],
    ["Notes", "item-notes", "until-item-notes", "textarea", "text"],
    ["Quantity", "item-quantity", "until-item-quantity", "number", "numeric"],
    [
      "Use within after opening",
      "opening-duration",
      "until-opening-duration",
      "number",
      "numeric",
    ],
  ];
  for (const [label, id, name, type, mode] of fields) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input).toHaveAttribute("id", id);
    await expect(input).toHaveAttribute("name", name);
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("inputmode", mode);
    const semantics = await input.evaluate((el: HTMLInputElement) => ({
      type: el.type,
      owner: el.form?.id,
      labels: [...(el.labels || [])].map((l) => l.textContent),
    }));
    expect(semantics.type).toBe(type);
    expect(semantics.owner).toBe("until-item-form");
    expect(semantics.labels).toEqual([label]);
  }
  // Radix renders real, visually hidden selects: audit those, not just trigger props.
  for (const [label, name] of [
    ["Date type", "until-item-date-kind"],
    ["Duration unit", "until-opening-duration-unit"],
    ["Location", "until-item-location"],
    ["Category", "until-product-category"],
  ]) {
    const trigger = page.getByLabel(label, { exact: true });
    await expect(trigger).toHaveAttribute("id", name);
    await expect(trigger).toHaveAttribute("aria-labelledby", `${name}-label`);
    const select = form.locator(`select[name="${name}"]`);
    await expect(select).toHaveAttribute("autocomplete", "off");
    expect(
      await select.evaluate((el) =>
        el instanceof HTMLSelectElement ? el.form?.id : null,
      ),
    ).toBe("until-item-form");
  }
  for (const label of ["Location", "Category"]) {
    await page.getByLabel(label, { exact: true }).click();
    await page
      .getByRole("option", {
        name: `Add custom ${label.toLowerCase()}…`,
        exact: true,
      })
      .click();
    const input = page.getByLabel(`Custom ${label.toLowerCase()}`, {
      exact: true,
    });
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("inputmode", "text");
    expect(
      await input.evaluate((el: HTMLInputElement) => ({
        type: el.type,
        owner: el.form?.id,
        name: el.name,
        id: el.id,
      })),
    ).toEqual({
      type: "text",
      owner: "until-item-form",
      name: `${label === "Location" ? "until-item-location" : "until-product-category"}-custom`,
      id: `${label === "Location" ? "until-item-location" : "until-product-category"}-custom`,
    });
    await input.fill(`Test ${label}`);
  }
  // Controlled state and validation still drive saving; no native FormData migration.
  await form.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByLabel("Product name *")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Product name *").fill("Semantic item");
  await page.getByLabel("Quantity", { exact: true }).fill("0");
  await form.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Brand", { exact: true }).fill("Test brand");
  await page.getByLabel("Package size", { exact: true }).fill("50 g");
  await page.getByLabel("Notes", { exact: true }).fill("Keep dry");
  await form.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          ?.length,
    )
    .toBe(1);
  const { records } = await (await page.request.get("/api/sync")).json();
  expect(records.items[0]).toMatchObject({
    quantity: 2,
    location: "Test Location",
    notes: "Keep dry",
    printedDate: "",
  });
  expect(records.products[0]).toMatchObject({
    name: "Semantic item",
    brand: "Test brand",
    size: "50 g",
    category: "Test Category",
  });
});

test("shared label rows align with and without help; desktop columns and mobile stacking remain", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expandSection(page, "More details");
  const section = page.locator(".editor details").filter({
    has: page.locator("summary").filter({ hasText: "More details" }),
  });
  for (const width of [1440, 1024, 800, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const rows = await section.locator(".form-grid").evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll(".field")].map((field) => {
          const label = field.firstElementChild!.getBoundingClientRect();
          const control = field
            .querySelector('input,button[role="combobox"]')!
            .getBoundingClientRect();
          return {
            labelY: label.y,
            labelH: label.height,
            controlY: control.y,
            x: control.x,
            width: control.width,
          };
        }),
      ),
    );
    for (const [left, right] of rows) {
      expect(left.labelH).toBe(32);
      expect(right.labelH).toBe(32);
      if (width > 760) {
        expect(left.labelY).toBe(right.labelY);
        expect(left.controlY).toBe(right.controlY);
        expect(right.x).toBeGreaterThan(left.x + left.width);
      } else {
        expect(right.x).toBe(left.x);
        expect(right.labelY).toBeGreaterThan(left.controlY);
      }
    }
    await page.getByLabel("Category", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/item-form-alignment-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page
        .locator(".editor")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  }
});

test("keyboard viewport keeps the form beneath the native keyboard and focused controls above it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Geometry-only mock, not a native iPhone keyboard or translucency test.
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 844, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expandSection(page, "More details");
  const name = page.getByLabel("Product name *");
  const notes = page.getByLabel("Notes", { exact: true });
  await name.fill("Keyboard appearance record");
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 420, offsetTop: 24 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("html")).toHaveClass(/keyboard-open/);
  await expect(page.locator(".editor .form-footer")).toBeHidden();
  for (const field of [
    name,
    page.getByLabel("Brand", { exact: true }),
    page.getByLabel("Quantity", { exact: true }),
    notes,
  ]) {
    await field.focus();
    await expect
      .poll(async () => {
        const box = await field.boundingBox();
        const scroll = await page.locator(".editor-fields").boundingBox();
        return (
          !!box &&
          !!scroll &&
          box.y >= scroll.y &&
          box.y + box.height <= 444 - 16
        );
      })
      .toBe(true);
    // The entire occluded area must belong to the editor, never to a shelf card.
    expect(
      await page.evaluate(() =>
        [460, 600, 820].every((y) =>
          Boolean(document.elementFromPoint(195, y)?.closest(".editor")),
        ),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollTop),
    ).toBe(0);
  }
  await notes.fill("Keep focused fields reachable");
  const before = await page
    .locator(".editor-fields")
    .evaluate((el) => el.scrollTop);
  await page.locator(".editor-fields").evaluate((el) => (el.scrollTop -= 100));
  expect(
    await page.locator(".editor-fields").evaluate((el) => el.scrollTop),
  ).toBeLessThan(before);
  const modal = await page.locator(".editor").boundingBox();
  expect(modal!.y).toBe(0);
  expect(modal!.height).toBe(844);
  await page.screenshot({
    path: "test-results/item-form-keyboard-geometry.png",
  });
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 844, offsetTop: 0 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await notes.blur();
  const after = await page
    .locator(".editor-fields")
    .evaluate((el) => el.scrollTop);
  expect(Math.abs(after - (before - 100))).toBeLessThan(3);
  await expect(page.locator(".editor .form-footer")).toBeVisible();
  await expect(page.locator(".editor .form-footer")).toBeInViewport();
  await expect(name).toHaveValue("Keyboard appearance record");
  await expect(notes).toHaveValue("Keep focused fields reachable");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/keyboard-open/);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.locator(".editor .form-footer")).toBeInViewport();
  await expect(name).not.toBeFocused();
});
