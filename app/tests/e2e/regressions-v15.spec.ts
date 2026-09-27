import { test, expect } from "@playwright/test";
import { expandSection, setDate } from "./editor-helpers";
import { emptyRecords } from "../../lib/until/domain";
const auth = (id: string) => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": "deletion@example.test",
});
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(auth(crypto.randomUUID()));
});
test("acknowledged dates survive a category-only edit; custom selectors start empty and return to their original choice", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("Acknowledged item");
  await setDate(page, "Printed date", "2020-01-01");
  await setDate(page, "Opened date", "2020-01-02");
  await page.getByLabel("I checked these dates").click();
  await expandSection(page, "More details");
  for (const [label, original] of [
    ["Category", "Food"],
    ["Location", "Fridge"],
  ]) {
    const select = page.getByLabel(label, { exact: true });
    await select.click();
    await page.getByRole("option", { name: original, exact: true }).click();
    await select.click();
    await page
      .getByRole("option", {
        name: `Add custom ${label.toLowerCase()}…`,
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel(`Custom ${label.toLowerCase()}`, { exact: true }),
    ).toHaveValue("");
    await page
      .getByRole("button", {
        name: `Use existing ${label.toLowerCase()}`,
        exact: true,
      })
      .click();
    await expect(select).toContainText(original);
  }
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await page.getByRole("tab", { name: /All items/ }).click();
  await page
    .getByRole("button", { name: "View Acknowledged item", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Beauty", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  for (const [label, original] of [
    ["Category", "Beauty"],
    ["Location", "Fridge"],
  ]) {
    const select = page.getByLabel(label, { exact: true });
    await select.click();
    await page
      .getByRole("option", {
        name: `Add custom ${label.toLowerCase()}…`,
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel(`Custom ${label.toLowerCase()}`, { exact: true }),
    ).toHaveValue("");
    await page
      .getByLabel(`Custom ${label.toLowerCase()}`, { exact: true })
      .fill("Unsaved name");
    await page
      .getByRole("button", {
        name: `Use existing ${label.toLowerCase()}`,
        exact: true,
      })
      .click();
    await expect(select).toContainText(original);
  }
  await page.getByLabel("Category", { exact: true }).click();
  await page
    .getByRole("option", { name: "Add custom category…", exact: true })
    .click();
  await page
    .getByLabel("Custom category", { exact: true })
    .fill("Edit custom category");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await expect(page.getByLabel("Category", { exact: true })).toContainText(
    "Edit custom category",
  );
  await setDate(page, "Opened date", "2020-01-03");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Confirm that you checked these dates.", { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("#date-confirmation")
      .evaluate((el) => !!el.closest(".date-section")),
  ).toBe(true);
});
test("offline permanent deletion syncs without resurrection; shared photos and used history survive", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const id = crypto.randomUUID(),
    options = { baseURL: "http://127.0.0.1:5173", extraHTTPHeaders: auth(id) };
  const a = await browser.newContext(options),
    b = await browser.newContext(options);
  const p = await a.newPage(),
    q = await b.newPage();
  const current = await (await p.request.get("/api/sync")).json();
  const r = emptyRecords(),
    productId = crypto.randomUUID(),
    itemId = crypto.randomUUID(),
    other = crypto.randomUUID(),
    photo = crypto.randomUUID(),
    label = crypto.randomUUID(),
    now = new Date().toISOString();
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile("tests/fixtures/label.png");
  for (const pid of [photo, label])
    expect(
      (
        await p.request.put(`/api/photos/${pid}`, {
          headers: { "Content-Type": "image/png" },
          data: bytes,
        })
      ).status(),
    ).toBe(204);
  r.products = [
    {
      id: productId,
      name: "Shared photo",
      brand: "",
      category: "Food",
      barcode: "",
      size: "",
      photoId: photo,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    },
  ];
  const item = {
    id: itemId,
    productId,
    quantity: 1,
    printedDate: "2020-01-01",
    dateKind: "best before" as const,
    openedDate: "",
    purchaseDate: "",
    location: "",
    notes: "",
    packagingPhotoId: label,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1 as const,
  };
  r.items = [item, { ...item, id: other, status: "used", completedAt: now }];
  expect(
    (
      await p.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision) },
        data: r,
      })
    ).status(),
  ).toBe(200);
  for (const page of [p, q]) {
    await page.goto("/");
    await page.getByRole("tab", { name: /All items/ }).click();
    await expect(page.locator(".item-card")).toHaveCount(1);
  }
  await a.setOffline(true);
  await p.getByRole("button", { name: "Review item", exact: true }).click();
  await expect(p.locator(".detail-countdown")).toContainText("Expired");
  await p
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await p
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(p.locator(".item-card")).toHaveCount(0);
  await a.setOffline(false);
  await p.reload();
  await expect
    .poll(
      async () =>
        (await (await p.request.get("/api/sync")).json()).records.items.length,
    )
    .toBe(1);
  await q.reload();
  await q.getByRole("tab", { name: /All items/ }).click();
  await expect(q.locator(".item-card")).toHaveCount(0);
  expect((await q.request.get(`/api/photos/${photo}`)).status()).toBe(200);
  expect((await q.request.get(`/api/photos/${label}`)).status()).toBe(200);
  await q.getByRole("tab", { name: "History", exact: true }).click();
  await q
    .getByRole("button", { name: "View Shared photo", exact: true })
    .click();
  await q
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await q
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await q.request.get("/api/sync")).json()).records.items.length,
    )
    .toBe(0);
  expect((await q.request.get(`/api/photos/${photo}`)).status()).toBe(404);
  expect((await q.request.get(`/api/photos/${label}`)).status()).toBe(404);
  const cloud = await (await q.request.get("/api/sync")).json();
  // Even a legacy client omitting deletion metadata cannot recreate these IDs.
  const stale = await q.request.put("/api/sync", {
    headers: { "If-Match": String(cloud.revision) },
    data: r,
  });
  expect([200, 409]).toContain(stale.status());
  expect(
    (await (await q.request.get("/api/sync")).json()).records.items,
  ).toHaveLength(0);
  await a.close();
  await b.close();
});
