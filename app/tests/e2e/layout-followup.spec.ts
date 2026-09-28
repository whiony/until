import { detailAction } from "./editor-helpers";
import { emptyRecords } from "../../lib/until/domain";
import { test, expect, type Page } from "@playwright/test";
import { expandSection } from "./editor-helpers";

async function seed(page: Page) {
  const current = await (await page.request.get("/api/sync")).json();
  const stamp = "2026-09-01T12:00:00.000Z";
  const products = Array.from({ length: 5 }, (_, n) => ({
    id: crypto.randomUUID(),
    name:
      n === 1
        ? "A historical product with a much longer name and extra metadata"
        : `Layout sample ${n}`,
    brand: n === 1 ? "Sample brand" : "",
    size: n === 1 ? "150 g" : "",
    category: n === 2 ? "Beauty" : n === 3 ? "" : "Food",
    barcode: "",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1,
  }));
  const items = products.map((p, n) => ({
    id: crypto.randomUUID(),
    productId: p.id,
    quantity: 1,
    printedDate: n === 3 ? "2020-01-01" : n === 4 ? "2030-01-01" : "",
    dateKind: "unspecified",
    openedDate: "",
    purchaseDate: "",
    location: "",
    notes: n === 2 ? "Long detail\n".repeat(60) : "",
    status: n < 2 ? (n === 0 ? "used" : "discarded") : "active",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1,
  }));
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision || 0) },
        data: {
          ...emptyRecords(),
          schemaVersion: 1,
          revision: 0,
          products,
          items,
        },
      })
    ).status(),
  ).toBe(200);
  return { products, items };
}
async function view(page: Page, screen: "All" | "History" | "Settings") {
  await page
    .getByRole(page.viewportSize()!.width > 760 ? "tab" : "button", {
      name:
        screen === "All" && page.viewportSize()!.width > 760
          ? /All items/
          : screen,
      exact: screen !== "All",
    })
    .click();
}
async function mockKeyboard(page: Page, height: number, top = 0) {
  await page.evaluate(
    ({ height, top }) => {
      Object.assign(window.visualViewport!, { height, offsetTop: top });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    },
    { height, top },
  );
}
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "layout@example.test",
  });
});

test("mobile Add/Edit/Add another share a top edge and preserve bottom-field drafts during keyboard transitions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, {
      height: 844,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
  });
  await seed(page);
  await page.goto("/");
  await page.addStyleTag({
    content: ":root { --safe-top:59px; --safe-bottom:34px; }",
  });
  for (const path of ["Add item", "Edit item", "Add another"]) {
    if (path === "Add item")
      await page.getByRole("button", { name: "Add item", exact: true }).click();
    else {
      await view(page, "All");
      await page
        .getByRole("button", { name: "View Layout sample 2", exact: true })
        .click();
      await detailAction(
        page,
        path === "Edit item" ? "Edit details" : "Add another",
      );
    }
    const editor = page.locator(".editor");
    await expect(editor.locator('[data-slot="dialog-title"]')).toHaveText(path);
    expect((await editor.boundingBox())!.y).toBe(0);
    await expect(
      editor.getByRole("button", { name: "Close", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() =>
        Boolean(document.elementFromPoint(195, 25)?.closest(".editor")),
      ),
    ).toBe(true);
    await page
      .getByLabel("Label photo", { exact: true })
      .setInputFiles("tests/fixtures/label.png");
    await expect(page.locator(".editor .photo-panel img")).toHaveCount(1);
    const photoSource = await page
      .locator(".editor .photo-panel img")
      .getAttribute("src");
    await expandSection(page, "More details");
    const notes = page.getByLabel("Notes", { exact: true });
    await notes.fill("Bottom draft preserved");
    await mockKeyboard(page, 380, 30);
    await expect(page.locator(".editor .form-footer")).toBeHidden();
    for (const label of ["Notes", "Package size", "Quantity", "Notes"]) {
      const field = page.getByLabel(label, { exact: true });
      await field.focus();
      await expect
        .poll(async () => {
          const box = (await field.boundingBox())!;
          return box.y >= 105 && box.y + box.height <= 394;
        })
        .toBe(true);
    }
    const before = await page
      .locator(".editor-fields")
      .evaluate((el) => el.scrollTop);
    await notes.blur(); // iOS can blur before its viewport expands.
    await expect(page.locator(".editor .form-footer")).toBeHidden();
    await mockKeyboard(page, 844);
    await expect(page.locator(".editor .form-footer")).toBeVisible();
    expect(
      Math.abs(
        (await page.locator(".editor-fields").evaluate((el) => el.scrollTop)) -
          before,
      ),
    ).toBeLessThan(3);
    await notes.focus();
    await mockKeyboard(page, 380, 30);
    await expect(notes).toHaveValue("Bottom draft preserved");
    await expect(page.locator(".editor .photo-panel img")).toHaveAttribute(
      "src",
      photoSource!,
    );
    await expect
      .poll(async () => {
        const box = (await notes.boundingBox())!;
        return box.y + box.height <= 394;
      })
      .toBe(true);
    await page.screenshot({
      path: `test-results/followup-editor-${path.replaceAll(" ", "-")}.png`,
    });
    await mockKeyboard(page, 844);
    await notes.blur();
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    if (path !== "Add item")
      await page
        .locator(".detail")
        .getByRole("button", { name: "Close", exact: true })
        .click();
  }
  // Long detail scrolls internally while keeping the last action and surface inset.
  await view(page, "All");
  await page
    .getByRole("button", { name: "View Layout sample 2", exact: true })
    .click();
  await detailAction(page, "Edit details");
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const detail = page.locator(".detail");
  await expect(detail.locator(".photo-label img")).toBeVisible();
  await detail
    .getByRole("button", { name: "More", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    detail.getByRole("button", { name: "More", exact: true }),
  ).toBeInViewport();
  const box = (await detail.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(59 + 16);
  expect(box.y + box.height).toBeLessThanOrEqual(844 - 34 - 16);
  await page.screenshot({ path: "test-results/followup-long-detail.png" });
});

test("History Add again keeps its source on failure and closes it after one successful creation", async ({
  page,
}) => {
  const fixture = await seed(page);
  await page.goto("/");
  await view(page, "History");
  await page
    .getByRole("button", { name: "View Layout sample 0", exact: true })
    .click();
  await page
    .locator(".detail")
    .getByRole("button", { name: "Add again", exact: true })
    .click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "state" && String(args[1]).startsWith("records")) {
        IDBObjectStore.prototype.put = put;
        throw Error("Storage unavailable");
      }
      return put.apply(this, args);
    };
  });
  await page
    .locator(".editor")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  await expect(page.locator(".editor [role=alert]")).toContainText(
    "Storage unavailable",
  );
  await page
    .locator(".editor")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.locator(".detail")).toBeVisible();
  await expect(page.locator(".detail [data-slot=dialog-title]")).toHaveText(
    "Layout sample 0",
  );
  await page
    .locator(".detail")
    .getByRole("button", { name: "Add again", exact: true })
    .click();
  // Repeated synchronous submits, before React can disable the button.
  await page.locator("#until-item-form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.locator(".editor,.detail")).toHaveCount(0);
  await expect(
    page.getByText("Added to your shelf", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          .length,
    )
    .toBe(6);
  const saved = (await (await page.request.get("/api/sync")).json()).records;
  expect(
    saved.items.find((i: { id: string }) => i.id === fixture.items[0].id),
  ).toEqual(fixture.items[0]);
  expect(
    saved.items.filter(
      (i: { productId: string; status: string }) =>
        i.productId === fixture.products[0].id && i.status === "active",
    ),
  ).toHaveLength(1);
  await view(page, "All");
  await expect(
    page.getByRole("button", { name: "View Layout sample 0", exact: true }),
  ).toBeVisible();
});

test("row-sized grids, coherent placeholders, aligned list controls and full-width Settings across themes", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  for (const width of [1920, 1024, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await view(page, "History");
    await expect(page.locator(".item-card")).toHaveCount(2);
    if (await page.getByRole("button", { name: "Show grid" }).isVisible())
      await page.getByRole("button", { name: "Show grid" }).click();
    const cards = await page.locator(".item-card").evaluateAll((cards) =>
      cards.map((c) => {
        const b = c.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, height: b.height };
      }),
    );
    if (cards[0].top === cards[1].top)
      expect(cards[0].bottom).toBe(cards[1].bottom);
    expect(Math.max(...cards.map((c) => c.height))).toBeLessThan(350);
    if (width > 760) {
      await page.getByRole("button", { name: "Show list" }).click();
      for (const row of await page.locator(".item-card").all()) {
        const icon = (await row.locator(".countdown svg").boundingBox())!;
        const text = (await row.locator(".countdown span").boundingBox())!;
        expect(
          Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
        ).toBeLessThan(2);
      }
      await page.getByRole("button", { name: "Show grid" }).click();
    }
    await view(page, "All");
    await expect(page.locator(".item-card")).toHaveCount(3);
    const activeRows = await page.locator(".item-card").evaluateAll((cards) =>
      cards.map((c) => {
        const b = c.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom };
      }),
    );
    for (const left of activeRows)
      for (const right of activeRows)
        if (left.top === right.top) expect(left.bottom).toBe(right.bottom);
    const card = page
      .locator(".item-card")
      .filter({ hasText: "Layout sample 2" });
    const color = await card
      .locator(".photo")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    await card.locator(".card-main").click();
    await expect(page.locator(".detail .photo")).toHaveCSS(
      "background-color",
      color,
    );
    await page
      .locator(".detail")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    if (width > 760) {
      await page.getByRole("button", { name: "Show list" }).click();
      for (const row of await page.locator(".item-card").all()) {
        const status = row.locator(".countdown");
        const icon = (await status.locator("svg").boundingBox())!;
        const text = (await status.locator("span").boundingBox())!;
        expect(
          Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
        ).toBeLessThan(2);
        const button = row.locator(".card-bottom button");
        await expect(button).toHaveCSS("white-space", "nowrap");
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({
        path: `test-results/followup-list-${width}.png`,
      });
    }
    await view(page, "Settings");
    const main = (await page.locator(".workspace main").boundingBox())!;
    const layout = (await page.locator(".settings-grid").boundingBox())!;
    expect(layout.x).toBeGreaterThan(main.x);
    expect(layout.width).toBeGreaterThan(main.width * 0.85);
    for (const theme of ["Green", "Warm peach", "Lavender", "Soft blue"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      await expect(
        page.getByRole("button", { name: theme, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: theme, exact: true }),
      ).toBeEnabled();
      if (width > 760) {
        const accent = await page
          .locator(
            ".theme-options [aria-pressed=true] .theme-preview i:nth-child(2)",
          )
          .evaluate((el) => getComputedStyle(el).backgroundColor);
        await expect(
          page.getByRole("tab", { name: "Settings", exact: true }),
        ).toHaveCSS("background-color", accent);
      }
      const contrast = await page
        .locator(".settings-page .muted")
        .first()
        .evaluate((el) => {
          const luminance = (rgb: string) => {
            const [r, g, b] = rgb
              .match(/\d+/g)!
              .slice(0, 3)
              .map(Number)
              .map((c) => {
                const n = c / 255;
                return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
              });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const a = luminance(getComputedStyle(el).color),
            b = luminance(
              getComputedStyle(el.closest("section")!).backgroundColor,
            );
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      expect(
        await page
          .locator(".settings-grid")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/followup-settings-${width}-${theme.replaceAll(" ", "-")}.png`,
        animations: "disabled",
      });
    }
  }
});
