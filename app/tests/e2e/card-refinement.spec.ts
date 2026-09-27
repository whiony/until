import { test, expect, type Page } from "@playwright/test";

async function seedShelf(page: Page) {
  const current = await (await page.request.get("/api/sync")).json();
  const stamp = "2026-09-01T12:00:00.000Z";
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const products = Array.from({ length: 22 }, (_, n) => ({
    id: crypto.randomUUID(),
    name:
      n === 0
        ? "Single historical item"
        : n === 1
          ? "Multiple discarded packages"
          : `Shelf ${n} with a long product name`,
    brand: "",
    size: n === 2 ? "150 g" : "",
    category: "Food",
    barcode: "",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1,
  }));
  const items = products.map((p, n) => ({
    id: crypto.randomUUID(),
    productId: p.id,
    quantity: n === 1 ? 3 : 1,
    printedDate: n >= 2 && n % 2 === 0 ? date : "",
    dateKind: n >= 2 ? "best before" : "unspecified",
    openedDate: "",
    purchaseDate: "",
    location: "Pantry",
    notes: n === 0 ? "  \n  " : "",
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
          schemaVersion: 1,
          revision: 0,
          products,
          items,
          settings: {
            soonDays: 7,
            notifications: {
              requested: false,
              expirationDay: false,
              leadDays: 7,
              time: "09:00",
              quietStart: "21:00",
              quietEnd: "08:00",
              timezone: "Europe/Zagreb",
            },
          },
        },
      })
    ).status(),
  ).toBe(200);
  return { products, items };
}
test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "cards@example.test",
  }),
);

test("filtered record counts, physical-unit totals, compact history and equal detail actions preserve history", async ({
  page,
}) => {
  const fixture = await seedShelf(page);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".section-heading > span")).toHaveCount(0);
  await expect(page.getByLabel("Shelf summary")).toContainText(
    "20 units need attention",
  );
  await page.getByLabel("Search items").fill("Shelf 2 ");
  await expect(page.getByLabel("Shelf summary")).toContainText(
    "1 unit needs attention",
  );
  await expect(page.locator(".section-heading > span")).toHaveText("1 item");
  await page.getByLabel("Search items").fill("Shelf");
  await expect(page.locator(".section-heading > span")).toHaveText([
    "10 items",
    "10 items",
  ]);
  await page.getByLabel("Search items").fill("");
  const card = page.locator(".item-card").first();
  const status = await card.locator(".countdown").boundingBox();
  const main = await card.locator(".card-main").boundingBox();
  expect(status!.width).toBeGreaterThan(main!.width * 0.8);
  expect((await card.boundingBox())!.height).toBeLessThan(300);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/refined-grid-wide.png",
  });
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.locator(".section-heading > span")).toHaveCount(0);
  const single = page
    .locator(".item-card")
    .filter({ hasText: "Single historical item" });
  const multiple = page
    .locator(".item-card")
    .filter({ hasText: "Multiple discarded packages" });
  await expect(single.locator(".footer-quantity")).toHaveCount(0);
  await expect(multiple.locator(".footer-quantity")).toHaveText("×3 units");
  await expect(multiple.locator(".countdown")).toHaveText("Discarded");
  expect((await single.boundingBox())!.height).toBeLessThan(230);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/refined-history-grid.png",
  });
  await page
    .getByRole("button", { name: "View Single historical item", exact: true })
    .click();
  const detail = page.locator(".detail");
  await expect(detail).not.toContainText("not recorded");
  await expect(detail.locator(".detail-notes")).toHaveCount(0);
  await expect(detail.locator("dt")).toHaveText(["Quantity"]);
  const again = detail.getByRole("button", { name: "Add again", exact: true });
  const more = detail.getByRole("button", { name: "More", exact: true });
  expect((await again.boundingBox())!.width).toBeGreaterThan(
    (await more.boundingBox())!.width,
  );
  await expect(
    detail.getByRole("button", { name: "Edit details" }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/refined-history-detail.png",
  });
  await again.click();
  await expect(detail).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  const after = (await (await page.request.get("/api/sync")).json()).records;
  expect(
    after.items.find((i: { id: string }) => i.id === fixture.items[0].id),
  ).toMatchObject(fixture.items[0]);
  await expect(detail).toHaveCount(0);
  await page.getByRole("button", { name: "Show list", exact: true }).click();
  await expect(multiple.locator(".list-quantity")).toHaveText("3 units");
  for (const row of [single, multiple]) {
    const content = await row.locator(".card-main").boundingBox();
    const status = await row.locator(".card-status").boundingBox();
    expect(
      Math.abs(
        status!.y + status!.height / 2 - content!.y - content!.height / 2,
      ),
    ).toBeLessThan(2);
  }
  await page.screenshot({
    animations: "disabled",
    path: "test-results/refined-history-list.png",
  });
});

test("opaque safe-area header covers fast scrolling on all shelf screens and mobile controls stay aligned", async ({
  page,
}) => {
  await seedShelf(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.addStyleTag({ content: ":root { --safe-top: 59px; }" });
  for (const screen of ["Soon", "All", "History"]) {
    await page.getByRole("button", { name: screen, exact: true }).click();
    await expect(page.locator(".item-card")).toHaveCount(
      screen === "Soon" ? 20 : screen === "All" ? 20 : 2,
    );
    if (screen === "History") {
      // Keep the historical list long without mutating persistent records.
      await page.locator(".cards").evaluate((el) => {
        const originals = [...el.children];
        for (let n = 0; n < 10; n++)
          for (const card of originals) el.appendChild(card.cloneNode(true));
      });
    }
    for (const y of [300, 900, 1800, 400]) {
      await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const header = page.locator(".topbar");
      expect((await header.boundingBox())!.y).toBe(0);
      await expect(header).toHaveCSS("backdrop-filter", "none");
      expect(
        await header.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).not.toContain("rgba");
      expect(
        await page.evaluate(
          () => !!document.elementFromPoint(180, 80)?.closest(".topbar"),
        ),
      ).toBe(true);
      expect(
        (await page.locator(".page-heading").boundingBox())!.y,
      ).toBeLessThan(0);
    }
    await page.screenshot({
      animations: "disabled",
      path: `test-results/refined-scroll-${screen}.png`,
    });
  }
  const plus = page.locator(".mobile-plus");
  await expect(plus).toHaveAccessibleName("Add item");
  await expect(plus).toHaveText("");
  await expect(plus).toBeEnabled();
  const add = await plus.boundingBox();
  const sibling = await page
    .getByRole("button", { name: "All", exact: true })
    .boundingBox();
  expect(
    Math.abs(add!.y + add!.height / 2 - sibling!.y - sibling!.height / 2),
  ).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Search items").fill("Shelf 3 ");
  await page
    .getByRole("button", { name: "Mark one as used", exact: true })
    .click();
  await expect(page.locator(".detail")).toHaveCount(0);
  await expect(page.locator(".item-card")).toHaveCount(0);
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByLabel("Search items").fill("");
    await page.evaluate(() => scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await page.locator(".item-card .photo").first().boundingBox())!.width,
    ).toBe(72);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/refined-history-mobile-${width}.png`,
    });
  }
});

test("portrait, landscape, cropped product photos compose with details and evidence bytes stay intact", async ({
  page,
}) => {
  await seedShelf(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const pull = await (await page.request.get("/api/sync")).json();
  const records = pull.records;
  const evidenceId = crypto.randomUUID();
  const evidence = await (await page.request.get("/demo/yogurt.png")).body();
  expect(
    (
      await page.request.put(`/api/photos/${evidenceId}`, {
        headers: { "Content-Type": "image/png" },
        data: evidence,
      })
    ).status(),
  ).toBe(204);
  for (const [n, dimensions] of [
    [0, [120, 240]],
    [1, [300, 100]],
    [2, [192, 192]],
  ] as const) {
    const id = crypto.randomUUID();
    const encoded = await page.evaluate(([width, height]) => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#dce9b4";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#294d3b";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("SAMPLE", 10, 50);
      return c.toDataURL("image/png").split(",")[1];
    }, dimensions);
    expect(
      (
        await page.request.put(`/api/photos/${id}`, {
          headers: { "Content-Type": "image/png" },
          data: Buffer.from(encoded, "base64"),
        })
      ).status(),
    ).toBe(204);
    records.products[n].photoId = id;
  }
  records.products[3].photoId = records.products[0].photoId;
  records.products[4].photoId = records.products[1].photoId;
  records.items[0].packagingPhotoId = evidenceId;
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(pull.revision) },
        data: records,
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.locator(".item-card .photo img")).toHaveCount(2);
  for (const list of [false, true]) {
    if (list) await page.getByRole("button", { name: "Show list" }).click();
    for (const img of await page.locator(".item-card .photo img").all()) {
      await expect(img).toHaveCSS("object-fit", "contain");
      const frame = await img.locator("..").boundingBox();
      const image = await img.boundingBox();
      expect(image!.width).toBeLessThanOrEqual(frame!.width);
      expect(image!.height).toBeLessThanOrEqual(frame!.height);
    }
    await page.screenshot({
      animations: "disabled",
      path: `test-results/full-card-images-${list ? "list" : "grid"}.png`,
    });
  }
  await page.getByRole("button", { name: "Show grid" }).click();
  for (const name of [
    "Single historical item",
    "Multiple discarded packages",
  ]) {
    await page
      .getByRole("button", { name: `View ${name}`, exact: true })
      .click();
    const media = page.locator(".detail-overview > .photo");
    await expect(media.locator("img")).toBeVisible();
    await expect(media.locator("img")).toHaveCSS("object-fit", "contain");
    const photo = await media.boundingBox(),
      identity = await page.locator(".detail-identity").boundingBox();
    expect(identity!.x).toBeGreaterThan(photo!.x + photo!.width);
    expect(Math.abs(identity!.y - photo!.y)).toBeLessThan(70);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/refined-photo-${name.startsWith("Single") ? "portrait" : "landscape"}.png`,
    });
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.getByRole("tab", { name: /All items/ }).click();
  await expect(page.locator(".item-card .photo img")).toHaveCount(3);
  for (const list of [false, true]) {
    if (list) await page.getByRole("button", { name: "Show list" }).click();
    for (const img of await page.locator(".item-card .photo img").all())
      await expect(img).toHaveCSS("object-fit", "contain");
    await page.screenshot({
      animations: "disabled",
      path: `test-results/active-full-images-${list ? "list" : "grid"}.png`,
    });
  }
  await page
    .getByRole("button", {
      name: "View Shelf 2 with a long product name",
      exact: true,
    })
    .click();
  await expect(page.locator(".detail-overview img")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({
    animations: "disabled",
    path: "test-results/refined-photo-square-mobile.png",
  });
  expect(
    await page
      .locator(".detail")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  expect(
    await (await page.request.get(`/api/photos/${evidenceId}`)).body(),
  ).toEqual(evidence);
  expect(
    (await (await page.request.get("/api/sync")).json()).records.items[0]
      .packagingPhotoId,
  ).toBe(evidenceId);
});
