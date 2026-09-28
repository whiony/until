import { detailAction } from "./editor-helpers";
import { test, expect, type Page } from "@playwright/test";
import { emptyRecords, categories, today } from "../../lib/until/domain";
import { expandSection, setDate } from "./editor-helpers";
async function seed(page: Page) {
  const current = await (await page.request.get("/api/sync")).json();
  const r = emptyRecords();
  const stamp = "2026-09-01T12:00:00.000Z";
  for (const [n, category] of [...categories, "Custom"].entries()) {
    const id = crypto.randomUUID();
    r.products.push({
      id,
      name: `Category sample ${n}`,
      brand: "Saved brand",
      category,
      barcode: "",
      size: "",
      createdAt: stamp,
      updatedAt: stamp,
      schemaVersion: 1,
    });
    const next = new Date();
    next.setDate(next.getDate() + 2);
    r.items.push({
      id,
      productId: id,
      quantity: 1,
      printedDate: n < 3 ? "2020-01-01" : today(next),
      dateKind: n === 0 ? "best before" : n === 1 ? "use by" : "unspecified",
      purchaseDate: "",
      openedDate: "",
      location: n === 0 ? "Cupboard" : "",
      notes: "Keep this note",
      status: "active",
      createdAt: stamp,
      updatedAt: stamp,
      schemaVersion: 1,
    });
  }
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision || 0) },
        data: r,
      })
    ).status(),
  ).toBe(200);
  return r;
}
async function nav(page: Page, name: string) {
  await page
    .getByRole(page.viewportSize()!.width > 760 ? "tab" : "button", {
      name:
        name === "All" && page.viewportSize()!.width > 760 ? /All items/ : name,
      exact: name !== "All",
    })
    .click();
}
test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "dates@example.test",
  }),
);
test("keeps stored date wording, secondary optional control and brand during editing", async ({
  page,
}) => {
  const r = await seed(page);
  await page.goto("/");
  await nav(page, "All");
  await page.getByRole("button", { name: /View Category sample 0/ }).click();
  await expect(page.locator(".detail-countdown")).toContainText("Expired");
  await detailAction(page, "Edit details");
  await expect(page.getByLabel("Date type", { exact: true })).toContainText(
    "Best before",
  );
  await expandSection(page, "More details");
  await expect(page.getByLabel("Brand", { exact: true })).toHaveAttribute(
    "placeholder",
    "Brand name",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".editor")).toHaveCount(0);
  const saved = await (await page.request.get("/api/sync")).json();
  expect(
    saved.records.items.find((i: { id: string }) => i.id === r.items[0].id)
      .dateKind,
  ).toBe("best before");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByLabel("Date type", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Printed date", { exact: true })).toBeVisible();
  await expandSection(page, "More details");
  await expect(page.getByLabel("Date type", { exact: true })).toContainText(
    "Unspecified",
  );
  await page
    .getByLabel("Product name *", { exact: true })
    .fill("Date without wording");
  await setDate(page, "Printed date", "2030-01-01");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  const added = await (await page.request.get("/api/sync")).json();
  expect(added.records.items.at(-1).dateKind).toBe("unspecified");
});
test("reassigns a custom location explicitly and persists it across reload and selectors", async ({
  page,
}) => {
  const original = await seed(page);
  await page.goto("/");
  await nav(page, "Settings");
  await page.locator(".settings-organize .manager-details").last().locator("summary").click();
  const section = page.getByRole("region", { name: "Locations", exact: true });
  await section
    .getByRole("button", { name: "Rename Cupboard", exact: true })
    .click();
  await section.getByLabel("New location name").fill("Kitchen shelf");
  await section.getByRole("button", { name: "Save location name" }).click();
  await expect(
    section.getByRole("button", { name: "Rename Kitchen shelf" }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Delete Kitchen shelf" }).click();
  await expect(
    section.getByRole("button", { name: "Confirm deletion" }),
  ).toBeDisabled();
  await section.getByLabel("Move items to", { exact: true }).click();
  await page.getByRole("option", { name: "Pantry", exact: true }).click();
  await section.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(
    section.getByRole("button", { name: "Rename Kitchen shelf" }),
  ).toHaveCount(0);
  await page.reload();
  await nav(page, "All");
  await page.getByRole("button", { name: /View Category sample 0/ }).click();
  await expect(page.locator(".detail")).toContainText("Pantry");
  const stored = await (await page.request.get("/api/sync")).json();
  expect(stored.records.items).toHaveLength(original.items.length);
  const item = stored.records.items.find(
    (i: { id: string }) => i.id === original.items[0].id,
  );
  expect(item.location).toBe("Pantry");
  expect(item.notes).toBe("Keep this note");
  expect(item.printedDate).toBe("2020-01-01");
  await detailAction(page, "Edit details");
  await expandSection(page, "More details");
  await page.getByLabel("Location", { exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Pantry", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Kitchen shelf", exact: true }),
  ).toHaveCount(0);
});
test("distinguishes category placeholders and emphasizes passed dates across four themes and mobile/desktop views", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  for (const theme of ["green", "peach", "lavender", "blue"]) {
    await nav(page, "Settings");
    await page.locator(`.theme-options button[data-theme="${theme}"]`).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await nav(page, "All");
      const colors = await page
        .locator(".item-card .photo")
        .evaluateAll((els) =>
          els.map((el) => getComputedStyle(el).backgroundColor),
        );
      expect(new Set(colors).size).toBe(7);
      const contrasts = await page
        .locator(".item-card")
        .evaluateAll((cards) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d")!;
          const luminance = (color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const bytes = ctx.getImageData(0, 0, 1, 1).data;
            return [0, 1, 2]
              .map((i) => {
                const c = bytes[i] / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
          };
          const ratio = (fg: string, bg: string) => {
            const a = luminance(fg),
              b = luminance(bg);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          return cards.map((card) => {
            const status = getComputedStyle(card.querySelector(".countdown")!),
              photo = getComputedStyle(card.querySelector(".photo")!);
            return {
              text: ratio(status.color, getComputedStyle(card).backgroundColor),
              icon: ratio(photo.color, photo.backgroundColor),
            };
          });
        });
      for (const contrast of contrasts) {
        expect(contrast.text).toBeGreaterThanOrEqual(4.5);
        expect(contrast.icon).toBeGreaterThanOrEqual(3);
      }
      const expired = page.locator(".item-card.expired").first();
      await expect(expired.locator(".countdown svg")).toBeVisible();
      await expect(expired.locator(".countdown")).toHaveCSS(
        "font-weight",
        "800",
      );
      expect(
        await expired.evaluate((el) => getComputedStyle(el).borderTopWidth),
      ).toBe("4px");
      await expect(page.getByText(/Expired.*ago/).first()).toBeVisible();
      if (width === 1440) {
        await page
          .getByRole("button", { name: "Show list", exact: true })
          .click();
        await expect(expired.locator(".countdown")).toHaveCSS(
          "font-weight",
          "800",
        );
        await page
          .getByRole("button", { name: "Show grid", exact: true })
          .click();
      }
      await page.screenshot({
        path: `test-results/v14-${theme}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: /View Category sample 0/ })
        .click();
      await expect(page.locator(".detail-countdown")).toHaveCSS(
        "color",
        await expired
          .locator(".countdown")
          .evaluate((el) => getComputedStyle(el).color),
      );
      await page.getByRole("button", { name: "Close", exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
test("rejects invalid location redirects and isolates reminder capability by authenticated account", async ({
  page,
}) => {
  const records = await seed(page);
  const current = await (await page.request.get("/api/sync")).json();
  records.settings.locationRules = [
    { name: "Cupboard", replacement: "Cycle" },
    { name: "Cycle", replacement: "Cupboard" },
  ];
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision) },
        data: records,
      })
    ).status(),
  ).toBe(400);
  records.settings.locationRules = [{ name: "Fridge", replacement: "Pantry" }];
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision) },
        data: records,
      })
    ).status(),
  ).toBe(400);
  records.settings.locationRules = [];
  records.settings.notifications.time = "99:99";
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision) },
        data: records,
      })
    ).status(),
  ).toBe(400);
  expect((await page.request.get("/api/notifications")).status()).toBe(200);
  expect(
    (
      await page.request.get("/api/notifications", {
        headers: {
          "oai-authenticated-user-id": "",
          "oai-authenticated-user-email": "",
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (await (await page.request.get("/api/notifications")).json()).available,
  ).toBe(false);
});
