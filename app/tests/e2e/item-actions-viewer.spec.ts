import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { emptyRecords } from "../../lib/until/domain";
import { detailAction } from "./editor-helpers";

test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "actions-viewer@example.test",
  }),
);
async function seed(page: Page, photo = false) {
  const records = emptyRecords();
  const stamp = new Date().toISOString();
  const original = await fs.readFile("tests/fixtures/label.png");
  const photoId = crypto.randomUUID();
  if (photo)
    expect(
      (
        await page.request.put(`/api/photos/${photoId}`, {
          headers: { "Content-Type": "image/png" },
          data: original,
        })
      ).status(),
    ).toBe(204);
  const names = [
    "Past quality date",
    "Active sparse",
    "Historical",
    "Detailed packaging",
  ];
  records.products = names.map((name) => ({
    id: crypto.randomUUID(),
    name,
    brand: "",
    category: "Food",
    size: "",
    barcode: "",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1 as const,
  }));
  records.products[3].provenance = {
    provider: "Open Food Facts",
    url: "https://world.openfoodfacts.org/product/123",
    confirmedAt: stamp,
  };
  records.items = records.products.map((p, n) => ({
    id: crypto.randomUUID(),
    productId: p.id,
    quantity: n === 0 ? 20 : 1,
    printedDate: n === 0 ? "2020-01-01" : "",
    dateKind: n === 0 ? ("best before" as const) : ("unspecified" as const),
    openedDate: "",
    purchaseDate: "",
    location: "",
    notes: n === 3 ? "Keep this original label readable." : "",
    status: n === 2 ? ("used" as const) : ("active" as const),
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1 as const,
    ...(photo && n === 3 ? { packagingPhotoId: photoId } : {}),
  }));
  const current = await (await page.request.get("/api/sync")).json();
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision || 0) },
        data: records,
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "View Past quality date", exact: true }),
  ).toBeVisible();
  return { records, original, photoId };
}
async function view(page: Page, name: string, width: number) {
  if (width < 761)
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name, exact: true })
      .click();
  else
    await page
      .getByRole("tab", {
        name: name === "All" ? /All items/ : new RegExp(`^${name}`),
      })
      .click();
}
test("expired card menus have distinct one-unit outcomes in Soon/All Grid/List, and details expose state-appropriate More", async ({
  page,
}) => {
  const fixture = await seed(page);
  let quantity = 20;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of ["Soon", "All"]) {
      await view(page, section, width);
      for (const mode of ["grid", "list"]) {
        const toggle = page.getByRole("button", {
          name: mode === "grid" ? "Show grid" : "Show list",
          exact: true,
        });
        if (await toggle.isVisible()) await toggle.click();
        const card = page.locator(".item-card").filter({
          has: page.getByRole("heading", {
            name: "Past quality date",
            exact: true,
          }),
        });
        await expect(card.locator(".card-arrow")).toHaveCount(0);
        await expect(
          card.getByRole("button", { name: "Review item" }),
        ).toHaveCount(0);
        const trigger = card.getByRole("button", {
          name: "Actions for Past quality date",
          exact: true,
        });
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menuitem")).toHaveText([
          "Mark one as used",
          "Discard one",
        ]);
        await expect(page.locator(".detail")).toHaveCount(0);
        await page.screenshot({
          animations: "disabled",
          path: `test-results/v16-menu-${width}-${section}-${mode}.png`,
        });
        await page
          .getByRole("menuitem", {
            name: mode === "grid" ? "Mark one as used" : "Discard one",
            exact: true,
          })
          .click();
        quantity--;
        await expect(card.locator(".footer-quantity")).toHaveText(
          `×${quantity} unopened`,
        );
        await expect(
          page
            .getByText(
              mode === "grid"
                ? "One unit moved to History as used"
                : "One unit moved to History as discarded",
              { exact: true },
            )
            .first(),
        ).toBeVisible();
        await expect(page.locator(".detail")).toHaveCount(0);
      }
    }
  }
  await expect
    .poll(
      async () =>
        (
          await (await page.request.get("/api/sync")).json()
        ).records.items.filter((i: { status: string }) => i.status !== "active")
          .length,
    )
    .toBe(9);
  const expired = page.getByRole("button", {
    name: "View Past quality date",
    exact: true,
  });
  await expired.focus();
  await page.keyboard.press("Enter");
  const detail = page.locator(".detail");
  await expect(detail.locator(".detail-actions button")).toHaveText([
    "Mark one as used",
    "Discard one",
    "More",
  ]);
  await detail.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Open one",
    "Add another",
    "Edit details",
    "Delete permanently",
  ]);
  await page.getByRole("menuitem", { name: "Delete permanently" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep item", exact: true }).click();
  await expect(detail).toBeVisible();
  expect(
    (await (await page.request.get("/api/sync")).json()).records.items.some(
      (i: { id: string }) => i.id === fixture.records.items[0].id,
    ),
  ).toBe(true);
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await view(page, "History", 390);
  await page
    .getByRole("button", { name: "View Historical", exact: true })
    .click();
  await expect(detail.locator(".detail-actions button")).toHaveText([
    "Add again",
    "More",
  ]);
  await detail.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Edit details",
    "Delete permanently",
  ]);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/v16-history-mobile.png" });
});

test("packaging viewer uses immutable full original bytes, fits and zooms/pans within desktop and phone viewports", async ({
  page,
  context,
}) => {
  const fixture = await seed(page, true);
  await page.getByRole("tab", { name: /All items/ }).click();
  await page
    .getByRole("button", { name: "View Detailed packaging", exact: true })
    .click();
  const detail = page.locator(".detail");
  await expect(detail.locator(".product-attribution")).toBeVisible();
  await detail.getByText("Product data source", { exact: true }).click();
  await expect(
    detail.getByRole("link", { name: "Open Food Facts", exact: true }),
  ).toHaveAttribute("href", "https://world.openfoodfacts.org/product/123");
  expect(await detail.locator(".packaging-photo").innerText()).not.toContain(
    "ODbL",
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await detail
      .getByRole("button", { name: "View original packaging photo" })
      .click();
    const viewer = page.locator(".photo-viewer");
    await expect(viewer).toHaveCSS("opacity", "1");
    const image = viewer.getByRole("img", {
      name: "Full original packaging label",
      exact: true,
    });
    await expect(image).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeEnabled();
    const bytes = await image.evaluate(async (el: HTMLImageElement) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            await (await fetch(el.src)).arrayBuffer(),
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    );
    expect(bytes).toBe(
      createHash("sha256").update(fixture.original).digest("hex"),
    );
    const fit = await image.evaluate((el: HTMLImageElement) => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      ratio: el.naturalWidth / el.naturalHeight,
    }));
    expect(fit.width / fit.height).toBeCloseTo(fit.ratio, 2);
    const box = (await viewer.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/v16-photo-fit-${width}.png`,
    });
    await viewer.getByLabel("Photo zoom", { exact: true }).fill("6");
    await expect
      .poll(async () => (await image.boundingBox())!.width)
      .toBeGreaterThan(fit.width * 5);
    const pan = viewer.getByRole("region", {
      name: "Packaging photo, arrow keys to pan",
      exact: true,
    });
    await pan.focus();
    const old = await pan.evaluate((el) => el.scrollLeft);
    await page.keyboard.press("ArrowRight");
    expect(await pan.evaluate((el) => el.scrollLeft)).toBeGreaterThan(old);
    const panBox = (await pan.boundingBox())!;
    const beforeDrag = await pan.evaluate((el) => el.scrollLeft);
    await page.mouse.move(
      panBox.x + panBox.width / 2,
      panBox.y + panBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      panBox.x + panBox.width / 2 - 40,
      panBox.y + panBox.height / 2,
    );
    await page.mouse.up();
    expect(await pan.evaluate((el) => el.scrollLeft)).toBeGreaterThan(
      beforeDrag,
    );

    await page.screenshot({
      animations: "disabled",
      path: `test-results/v16-photo-zoom-${width}.png`,
    });
    await viewer.getByRole("button", { name: "Fit", exact: true }).click();
    await expect
      .poll(async () => (await image.boundingBox())!.width)
      .toBeCloseTo(fit.width, 0);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(
      detail.getByRole("button", { name: "View original packaging photo" }),
    ).toBeFocused();
  }
  await context.setOffline(true);
  await page.evaluate(async (id) => {
    const request = indexedDB.open("until");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, fixture.photoId);
  await detail
    .getByRole("button", { name: "View original packaging photo" })
    .click();
  await expect(page.locator(".photo-viewer").getByRole("status")).toContainText(
    "unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await context.setOffline(false);
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "View Active sparse", exact: true })
    .click();
  await expect(page.locator(".packaging-photo")).toHaveCount(0);
  await detailAction(page, "Open one");
  await detail.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Open one" })).toHaveCount(0);
});

test("card hover/focus and compact detail hierarchy stay aligned across themes, urgency states and narrow screens", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seed(page, true);
  for (const width of [1440, 1024, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["green", "peach", "lavender", "blue"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      for (const section of ["Soon", "All", "History"]) {
        await view(page, section, width);
        for (const mode of ["grid", "list"]) {
          const toggle = page.getByRole("button", {
            name: mode === "grid" ? "Show grid" : "Show list",
            exact: true,
          });
          if (await toggle.isVisible()) await toggle.click();
          const card = page.locator(".item-card").first();
          const main = card.locator(".card-main");
          const action = card.locator(".card-bottom button");
          const before = (await card.boundingBox())!;
          if (width === 1440 || width === 390)
            await page.screenshot({
              animations: "disabled",
              path: `test-results/v16-card-${width}-${theme}-${section}-${mode}-default.png`,
            });
          await main.hover();
          if (width === 1440 || width === 390)
            await page.screenshot({
              animations: "disabled",
              path: `test-results/v16-card-${width}-${theme}-${section}-${mode}-hover.png`,
            });
          await page.keyboard.press("Tab");
          await main.focus();
          await expect(card).toHaveCSS("outline-style", "solid");
          await action.hover();
          await action.focus();
          const after = (await card.boundingBox())!;
          expect(after.height).toBeCloseTo(before.height, 0);
          const bounds = (await action.boundingBox())!;
          expect(bounds.x).toBeGreaterThanOrEqual(after.x);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(
            after.x + after.width,
          );
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          if (width === 1440 || width === 390)
            await page.screenshot({
              animations: "disabled",
              path: `test-results/v16-card-${width}-${theme}-${section}-${mode}-focus.png`,
            });
        }
      }
    }
    await view(page, "All", width);
    for (const name of [
      "Active sparse",
      "Past quality date",
      "Detailed packaging",
    ]) {
      await page
        .getByRole("button", { name: `View ${name}`, exact: true })
        .click();
      const detail = page.locator(".detail");
      await expect(detail).toHaveCSS("opacity", "1");
      const actions = detail.locator(".detail-actions");
      const bounds = (await actions.boundingBox())!;
      expect(bounds.height).toBeLessThan(160);
      await actions.scrollIntoViewIfNeeded();
      await expect(
        detail.getByRole("button", { name: "More", exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        animations: "disabled",
        path: `test-results/v16-detail-${width}-${name.replaceAll(" ", "-")}.png`,
      });
      await detail.getByRole("button", { name: "More", exact: true }).click();
      const menu = page.getByRole("menu");
      const box = (await menu.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      await page.screenshot({
        animations: "disabled",
        path: `test-results/v16-detail-more-${width}-${name.replaceAll(" ", "-")}.png`,
      });
      await page.keyboard.press("Escape");
      await detail.getByRole("button", { name: "Close", exact: true }).click();
    }
  }
});
