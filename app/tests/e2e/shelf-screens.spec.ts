import { test, expect, type Page } from "@playwright/test";
async function seed(page: Page) {
  const r = await (await page.request.get("/api/sync")).json();
  const stamp = "2026-09-01T12:00:00.000Z";
  const names = [
    "A legacy used item",
    "B discarded recently",
    "C used earlier",
    "Long active product name for responsive cards without a photo",
  ];
  const products = names.map((name) => ({
    id: crypto.randomUUID(),
    name,
    brand: "",
    size: "",
    category: "Food",
    barcode: "",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1,
  }));
  const items = products.map((p, n) => ({
    id: crypto.randomUUID(),
    productId: p.id,
    quantity: n === 3 ? 2 : 1,
    printedDate: "",
    dateKind: "unspecified",
    purchaseDate: "",
    openedDate: "",
    location: "Pantry",
    notes: "",
    status: n === 3 ? "active" : n === 1 ? "discarded" : "used",
    createdAt: stamp,
    updatedAt: n === 0 ? "2026-09-25T12:00:00.000Z" : stamp,
    schemaVersion: 1,
    ...(n === 1
      ? { completedAt: "2026-09-20T12:00:00.000Z" }
      : n === 2
        ? { completedAt: "2026-09-10T12:00:00.000Z" }
        : {}),
  }));
  const settings = {
    soonDays: 13,
    notifications: {
      requested: false,
      expirationDay: false,
      leadDays: 7,
      time: "09:00",
      quietStart: "21:00",
      quietEnd: "08:00",
      timezone: "Europe/Zagreb",
    },
  };
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(r.revision || 0) },
        data: { schemaVersion: 1, revision: 0, products, items, settings },
      })
    ).status(),
  ).toBe(200);
  return { products, items };
}
test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "shelf@example.test",
  }),
);
test("history uses recorded event dates, honest counts, independent sorting and quantity-safe actions", async ({
  page,
}) => {
  const fixture = await seed(page);
  await page.goto("/");
  await expect(page.locator(".page-heading")).toContainText("next 13 days");
  await expect(page.getByText("NEXT 13 DAYS", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByLabel("Search items")).toHaveAttribute(
    "placeholder",
    "Search used and discarded items…",
  );
  await expect(page.getByLabel("Sort Items")).toContainText("Most Recent");
  await expect(page.locator(".item-card h3")).toHaveText([
    "B discarded recently",
    "C used earlier",
    "A legacy used item",
  ]);
  await expect(page.locator(".section-heading")).toContainText("Your history");
  await expect(
    page.locator(".item-card").last().locator(".date-caption"),
  ).toHaveCount(0);
  await expect(
    page.locator(".item-card").first().locator(".date-caption"),
  ).toHaveText("20 Sep 2026");
  await expect(page.getByText("Recorded as used", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".list-quantity")).toHaveCount(0);
  await page.getByRole("button", { name: "Show list", exact: true }).click();
  await expect(page.locator(".list-quantity")).toHaveCount(0);
  await expect(page.locator(".footer-quantity")).toHaveCount(0);
  await page.getByLabel("Search items").fill("A legacy");
  await page.getByRole("button", { name: "Add again", exact: true }).click();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  const after = (await (await page.request.get("/api/sync")).json()).records;
  expect(
    after.items.find((i: { id: string }) => i.id === fixture.items[0].id),
  ).toMatchObject(fixture.items[0]);
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByLabel("Search items").fill("Long active");
  await expect(page.locator(".section-heading")).toContainText("1 item");
  const used = page.getByRole("button", {
    name: "Mark one as used",
    exact: true,
  });
  await used.click();
  await expect(page.locator(".section-heading")).toContainText("1 item");
  await used.click();
  await expect(used).toHaveCount(0);
  await page.getByRole("tab", { name: /History/ }).click();
  await page.getByLabel("Search items").fill("Long active");
  await expect(page.locator(".item-card")).toHaveCount(2);
  const final = (await (await page.request.get("/api/sync")).json()).records;
  expect(
    final.items
      .filter(
        (i: { productId: string }) => i.productId === fixture.products[3].id,
      )
      .every(
        (i: { completedAt?: string; status: string }) =>
          i.status === "used" && !!i.completedAt,
      ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("tab", { name: /History/ }).click();
  await page.getByLabel("Search items").fill("Long active");
  await expect(page.locator(".date-caption").first()).not.toBeEmpty();
});
test("empty history has no clearing action, and desktop/mobile shelf containers and navigation stay coherent", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByText("No history yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByLabel("Search items").fill("nothing exists");
  await expect(page.getByText("No items yet", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toHaveCount(0);
  await seed(page);
  await page.reload();
  await page.getByRole("tab", { name: /History/ }).click();
  await page.getByLabel("Search items").fill("missing");
  await expect(page.getByText("No matching items")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".item-card")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  expect(
    (await page.locator(".item-card").first().boundingBox())!.y,
  ).toBeLessThan(460);
  await page.screenshot({ path: "test-results/shelf-real-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  await page.getByRole("tab", { name: /All items/ }).click();
  for (const width of [1440, 1920, 1024, 800]) {
    await page.setViewportSize({ width, height: 900 });
    if (
      await page.getByRole("button", { name: "Show list", exact: true }).count()
    )
      await page
        .getByRole("button", { name: "Show list", exact: true })
        .click();
    const heading = await page.locator(".section-heading").boundingBox(),
      cards = await page.locator(".cards").first().boundingBox();
    expect(
      Math.abs(heading!.x + heading!.width - cards!.x - cards!.width),
    ).toBeLessThan(2);
    await expect(page.locator(".footer-quantity").first()).toBeHidden();
    await page.screenshot({ path: `test-results/shelf-list-${width}.png` });
  }
  for (const width of [390, 320, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.locator(".view-toggle")).toBeHidden();
    const plus = page.locator(".mobile-plus");
    await expect(plus).toHaveAccessibleName("Add item");
    await expect(plus).toHaveText("");
    await expect(plus).toBeDisabled();
    expect((await plus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/shelf-mobile-${width}.png` });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    expect((await page.locator(".topbar").boundingBox())!.y).toBe(0);
    const last = await page.locator(".item-card").last().boundingBox(),
      nav = await page.locator(".mobile-nav").boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "History", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "All", exact: true }).click();
  }
});
