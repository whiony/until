import { test, expect, type Page } from "@playwright/test";
import { setDate, expandSection } from "./editor-helpers";
const auth = (id: string) => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": "preferences@example.test",
});
async function settings(p: Page) {
  await p
    .getByRole(p.viewportSize()!.width > 760 ? "tab" : "button", {
      name: "Settings",
      exact: true,
    })
    .click();
}
async function all(p: Page) {
  await p
    .getByRole(p.viewportSize()!.width > 760 ? "tab" : "button", {
      name: p.viewportSize()!.width > 760 ? /All items/ : "All",
      exact: p.viewportSize()!.width <= 760,
    })
    .click();
}
async function add(p: Page, name: string, category?: string) {
  await p
    .getByRole("button", { name: "Add item", exact: true })
    .first()
    .click();
  await p.getByLabel("Product name *").fill(name);
  await expandSection(p, "More details");
  if (category) {
    await p.getByRole("combobox", { name: "Category", exact: true }).click();
    await p.getByRole("option", { name: category, exact: true }).click();
  }
  await p.getByLabel("Notes", { exact: true }).fill("First line\nSecond line");
  await p.getByRole("button", { name: "Add item", exact: true }).last().click();
  await expect(p.locator(".editor")).toHaveCount(0);
}
test("in-place expiration date supports cancel, storage failure and successful save with unspecified type; Notes preserve lines", async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders(auth(crypto.randomUUID()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await add(page, "Date sample");
  await all(page);
  await page.getByRole("button", { name: "Show list" }).click();
  await expect(page.locator(".date-caption")).toHaveCount(0);
  await page.getByRole("button", { name: "View Date sample" }).click();
  await expect(page.locator(".detail-notes h3")).toHaveText("Notes");
  await expect(page.locator(".detail-notes p")).toHaveText(
    "First line\nSecond line",
  );
  await expect(page.locator(".detail-notes p")).toHaveCSS(
    "white-space",
    "pre-wrap",
  );
  await page
    .getByRole("button", { name: "Add expiration date", exact: true })
    .click();
  await setDate(page, "Printed date", "2029-04-15");
  await page.getByRole("button", { name: "Cancel date" }).click();
  await expect(page.locator(".detail-countdown")).toHaveText("Needs a date");
  await page
    .getByRole("button", { name: "Add expiration date", exact: true })
    .click();
  await setDate(page, "Printed date", "2029-04-15");
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
  await page.getByRole("button", { name: "Save expiration date" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not save expiration date",
  );
  await expect(page.locator(".detail-countdown")).toHaveText("Needs a date");
  await page.getByRole("button", { name: "Save expiration date" }).click();
  await expect(page.locator(".inline-date")).toHaveCount(0);
  await expect(page.locator(".detail-countdown")).not.toHaveText(
    "Needs a date",
  );
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items[0]
          ?.printedDate,
    )
    .toBe("2029-04-15");
  expect(
    (await (await page.request.get("/api/sync")).json()).records.items[0]
      .dateKind,
  ).toBe("unspecified");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".date-caption")).toHaveText("15 Apr 2029");
});
test("two independent sessions sync category management, reassignment and offline themes without restoring hidden selections", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const id = crypto.randomUUID();
  const a = await browser.newContext({
      extraHTTPHeaders: auth(id),
      viewport: { width: 1440, height: 1000 },
    }),
    b = await browser.newContext({
      extraHTTPHeaders: auth(id),
      viewport: { width: 390, height: 844 },
    });
  const p = await a.newPage(),
    q = await b.newPage();
  await p.goto("/");
  await q.goto("/");
  await settings(p);
  await settings(q);
  await p.getByLabel("New category", { exact: true }).fill("Infusions");
  await p.getByRole("button", { name: "Add category", exact: true }).click();
  await p.getByRole("button", { name: "Hide Beauty" }).click();
  await p.getByRole("button", { name: "Warm peach", exact: true }).click();
  await expect(q.getByRole("button", { name: "Rename Infusions" })).toBeVisible(
    { timeout: 20000 },
  );
  await expect(q.getByRole("button", { name: "Show Beauty" })).toBeVisible();
  await expect(q.locator("html")).toHaveAttribute("data-theme", "peach");
  await all(p);
  await add(p, "Tea packet", "Infusions");
  await expect
    .poll(
      async () =>
        (await (await p.request.get("/api/sync")).json()).records?.items.length,
    )
    .toBe(1);
  await settings(p);
  await p.getByRole("button", { name: "Rename Infusions" }).click();
  await p.getByLabel("New category name").fill("Tea");
  await p.getByRole("button", { name: "Save category name" }).click();
  await expect(p.getByRole("button", { name: "Rename Tea" })).toBeVisible();
  await p.getByRole("button", { name: "Delete Tea", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Confirm deletion" }),
  ).toBeDisabled();
  await expect(p.locator(".category-confirm")).toContainText(
    "1 item uses this category",
  );
  await p.getByRole("combobox", { name: "Move items to" }).click();
  await p.getByRole("option", { name: "Uncategorized", exact: true }).click();
  await expect(p.locator(".category-confirm")).toContainText(
    "No items will be deleted",
  );
  await p.getByRole("button", { name: "Confirm deletion" }).click();
  await expect
    .poll(
      async () =>
        (await (await p.request.get("/api/sync")).json()).records?.products[0]
          ?.category,
    )
    .toBe("");
  await expect(q.getByRole("button", { name: "Rename Tea" })).toHaveCount(0, {
    timeout: 20000,
  });
  await a.setOffline(true);
  await p.getByRole("button", { name: "Soft blue", exact: true }).click();
  await expect(p.locator("html")).toHaveAttribute("data-theme", "blue");
  await p.reload();
  await settings(p);
  await expect(p.locator("html")).toHaveAttribute("data-theme", "blue");
  await expect(p.getByRole("button", { name: "Show Beauty" })).toBeVisible();
  await p.getByLabel("Show dates in the next (days)").fill("12");
  await p
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(p.locator("html")).toHaveAttribute("data-theme", "blue");
  await a.setOffline(false);
  await expect(q.locator("html")).toHaveAttribute("data-theme", "blue", {
    timeout: 25000,
  });
  await q.reload();
  await settings(q);
  await expect(q.getByRole("button", { name: "Show Beauty" })).toBeVisible();
  await all(q);
  await q.getByRole("button", { name: "View Tea packet" }).click();
  await expect(q.locator(".detail")).toContainText("Tea packet");
  await q.getByRole("button", { name: "Close", exact: true }).click();
  await q.getByRole("button", { name: "Add item", exact: true }).click();
  await expandSection(q, "More details");
  await q.getByRole("combobox", { name: "Category", exact: true }).click();
  await expect(
    q.getByRole("option", { name: "Beauty", exact: true }),
  ).toHaveCount(0);
  await expect(q.getByRole("option", { name: "Tea", exact: true })).toHaveCount(
    0,
  );
  await a.close();
  await b.close();
});

test("curated palettes color desktop and mobile surfaces, retain urgency colors and persist after reload", async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders(auth(crypto.randomUUID()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await settings(page);
  const colors = new Set<string>();
  for (const [name, theme] of [
    ["Green", "green"],
    ["Warm peach", "peach"],
    ["Lavender", "lavender"],
    ["Soft blue", "blue"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    colors.add(
      await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      animations: "disabled",
      path: `test-results/theme-${theme}-desktop.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: `test-results/theme-${theme}-mobile.png`,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(colors.size).toBe(4);
  await page.reload();
  await settings(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "blue");
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  await expect(page.locator(".urgent .countdown").first()).toHaveCSS(
    "color",
    "rgb(120, 96, 52)",
  );
});

test("account sync rejects invalid preference enums, duplicate categories, cyclic redirects and built-in deletion", async ({
  request,
}) => {
  const headers = { ...auth(crypto.randomUUID()), "If-Match": "0" };
  const records = {
    schemaVersion: 1,
    revision: 0,
    products: [],
    items: [],
    settings: {
      soonDays: 7,
      notifications: {
        requested: false,
        expirationDay: false,
        leadDays: 7,
        time: "09:00",
        quietStart: "21:00",
        quietEnd: "08:00",
        timezone: "UTC",
      },
    },
  };
  for (const preferences of [
    { theme: "arbitrary-css" },
    { categoryRules: [{ name: "Tea" }, { name: "tea" }] },
    {
      categoryRules: [
        { name: "A", replacement: "B" },
        { name: "B", replacement: "A" },
      ],
    },
    { categoryRules: [{ name: "Food", replacement: "" }] },
    {
      categoryRules: Array.from({ length: 201 }, (_, n) => ({
        name: `Category ${n}`,
      })),
    },
  ])
    expect(
      (
        await request.put("/api/sync", {
          headers,
          data: {
            ...records,
            settings: { ...records.settings, ...preferences },
          },
        })
      ).status(),
    ).toBe(400);
  expect(
    (await (await request.get("/api/sync", { headers })).json()).records,
  ).toBe(null);
});
