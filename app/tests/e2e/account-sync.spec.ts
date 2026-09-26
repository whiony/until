import { expandSection, setDate } from "./editor-helpers";
import { test, expect, type Page, type Browser } from "@playwright/test";
const auth = (id: string) => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": `${id}@example.test`,
});
async function session(browser: Browser, id: string, mobile = false) {
  return browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    extraHTTPHeaders: auth(id),
    reducedMotion: "reduce",
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  });
}
async function all(page: Page) {
  const mobile = page.viewportSize()!.width < 760;
  await page
    .getByRole(mobile ? "button" : "tab", {
      name: mobile ? "All" : /All items/,
      exact: mobile,
    })
    .click();
}
async function add(page: Page, name: string) {
  const mobile = page.viewportSize()!.width < 760;
  await page
    .getByRole("button", {
      name: mobile ? "Add item" : "Add item",
      exact: true,
    })
    .click();
  await page.getByLabel("Product name *").fill(name);
  await setDate(page, "Printed date", "2029-04-15");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await all(page);
  await expect(
    page.getByRole("button", { name: `View ${name}` }),
  ).toBeVisible();
}
async function remoteCount(page: Page, count: number) {
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/sync");
      return (await r.json()).records?.items.length || 0;
    })
    .toBe(count);
}
test("two independent account sessions sync creates, edits, status, offline changes and photos", async ({
  browser,
}) => {
  test.setTimeout(100000);
  const id = crypto.randomUUID();
  const phone = await session(browser, id, true),
    desktop = await session(browser, id);
  const a = await phone.newPage(),
    b = await desktop.newPage();
  await a.goto("/");
  await b.goto("/");
  await expect(a.getByText("No items yet")).toBeVisible();
  await add(a, "Phone cream");
  await remoteCount(a, 1);
  await all(b);
  await expect(b.getByRole("button", { name: "View Phone cream" })).toBeVisible(
    { timeout: 16000 },
  );
  await b.getByRole("button", { name: "View Phone cream" }).click();
  await b.getByRole("button", { name: "Edit details", exact: true }).click();
  await b.getByLabel("Product name *").fill("Desktop cream");
  await expandSection(b, "More details");
  await b.getByLabel("Category", { exact: true }).click();
  await b.getByRole("option", { name: "Beauty", exact: true }).click();
  await expandSection(b, "More details");
  await b.getByLabel("Location", { exact: true }).click();
  await b.getByRole("option", { name: "Bathroom", exact: true }).click();
  await expandSection(b, "Photos & label recognition");
  await b
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  await expect(
    b.getByRole("heading", { name: "Crop product photo" }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Use crop", exact: true }).click();
  await b.getByRole("button", { name: "Save changes", exact: true }).click();
  await b.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    a.getByRole("button", { name: "View Desktop cream" }),
  ).toBeVisible({ timeout: 16000 });
  await expect(
    a.getByRole("img", { name: "Desktop cream", exact: true }),
  ).toBeVisible();
  await expect(a.getByText("Beauty", { exact: false }).first()).toBeVisible();
  await phone.setOffline(true);
  await add(a, "Offline vitamins");
  await add(b, "Desktop tea");
  await remoteCount(b, 2);
  await phone.setOffline(false);
  await expect(
    b.getByRole("button", { name: "View Offline vitamins" }),
  ).toBeVisible({ timeout: 20000 });
  await expect(a.getByRole("button", { name: "View Desktop tea" })).toBeVisible(
    { timeout: 20000 },
  );
  await remoteCount(a, 3);
  await a.getByRole("button", { name: "View Desktop cream" }).click();
  await a
    .getByRole("button", { name: "Mark one as used", exact: true })
    .click();
  await a.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    b.getByRole("button", { name: "View Desktop cream" }),
  ).toHaveCount(0, { timeout: 16000 });
  await b.reload();
  await all(b);
  await expect(
    b.getByRole("button", { name: "View Offline vitamins" }),
  ).toBeVisible();
  await phone.close();
  await desktop.close();
});
test("account APIs enforce isolation, compare-and-swap, origins and upload type", async ({
  request,
}) => {
  const a = auth(crypto.randomUUID()),
    b = auth(crypto.randomUUID());
  const pull = await (await request.get("/api/sync", { headers: a })).json();
  const records = {
    schemaVersion: 1,
    revision: 0,
    products: [],
    items: [],
    settings: {
      theme: "lavender",
      categoryRules: [{ name: "Beauty", hidden: true }],
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
  expect(
    (
      await request.put("/api/sync", {
        headers: { ...a, "If-Match": "0", "X-Until-Account": pull.account },
        data: records,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.put("/api/sync", {
        headers: { ...a, "If-Match": "0" },
        data: records,
      })
    ).status(),
  ).toBe(409);
  expect((await request.get("/api/sync")).status()).toBe(401);
  expect(
    (await (await request.get("/api/sync", { headers: b })).json()).records,
  ).toBe(null);
  expect(
    (
      await request.put("/api/sync", {
        headers: { ...a, "If-Match": "1", Origin: "https://evil.test" },
        data: records,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.put("/api/sync", {
        headers: { ...b, "If-Match": "1", "X-Until-Account": pull.account },
        data: records,
      })
    ).status(),
  ).toBe(401);
  const image = await (await request.get("/icons/icon-192.png")).body(),
    id = crypto.randomUUID();
  expect(
    (
      await request.put(`/api/photos/${id}`, {
        headers: { ...a, "Content-Type": "image/png" },
        data: image,
      })
    ).status(),
  ).toBe(204);
  expect(
    (await request.get(`/api/photos/${id}`, { headers: a })).status(),
  ).toBe(200);
  expect(
    (await request.get(`/api/photos/${id}`, { headers: b })).status(),
  ).toBe(404);
  expect(
    (
      await request.put(`/api/photos/${crypto.randomUUID()}`, {
        headers: { ...a, "Content-Type": "image/png" },
        data: '<svg onload="alert(1)"></svg>',
      })
    ).status(),
  ).toBe(415);
});
test("existing IndexedDB records migrate once, defaults remain selectable and no account data leaks", async ({
  browser,
}) => {
  const context = await session(browser, crypto.randomUUID());
  const page = await context.newPage();
  // Seed the legacy database before app code can create an account namespace.
  await page.route("**/__legacy-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Legacy fixture</title>",
    }),
  );
  await page.goto("/__legacy-fixture");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("until", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("state");
        request.result.createObjectStore("photos");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").delete("legacyOwner");
    tx.objectStore("state").delete("activeAccount");
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    tx.objectStore("state").put(
      {
        schemaVersion: 1,
        revision: 1,
        products: [
          {
            id,
            name: "Existing custom item",
            brand: "",
            category: "Cosmetic",
            barcode: "",
            size: "20 ml",
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
        items: [
          {
            id: crypto.randomUUID(),
            productId: id,
            quantity: 1,
            printedDate: "2029-04-15",
            dateKind: "unspecified",
            purchaseDate: "",
            openedDate: "",
            location: "Bedroom",
            notes: "",
            status: "active",
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
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
      },
      "records",
    );
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  });
  await page.goto("/");
  await all(page);
  await expect(
    page.getByRole("button", { name: "View Existing custom item" }),
  ).toBeVisible({ timeout: 16000 });
  await remoteCount(page, 1);
  await page.reload();
  await remoteCount(page, 1);
  await all(page);
  await page.getByRole("button", { name: "View Existing custom item" }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await expandSection(page, "More details");
  await page.getByLabel("Category", { exact: true }).click();
  for (const name of [
    "Food",
    "Beauty",
    "Medicine",
    "Supplements",
    "Household",
    "Pet",
    "Cosmetic",
  ])
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await context.setExtraHTTPHeaders(auth(crypto.randomUUID()));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "View Existing custom item" }),
  ).toHaveCount(0);
  await context.close();
});
test("mobile editor, keyboard-size viewport, crop and replacement survive reload", async ({
  browser,
}) => {
  const context = await session(browser, crypto.randomUUID(), true);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Product name *")
    .fill("Haruharu wonder Black Rice Bakuchiol Eye Cream 20ml");
  await setDate(page, "Printed date", "2029-04-15");
  await expandSection(page, "More details");
  await page.getByLabel("Category", { exact: true }).click();
  await page.getByRole("option", { name: "Beauty", exact: true }).click();
  await expandSection(page, "Photos & label recognition");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  await page.getByRole("button", { name: "Use crop" }).click();
  await expect(page.locator(".crop-dialog")).toHaveCount(0);
  await expandSection(page, "More details");
  await page.getByLabel("Package size", { exact: true }).fill("2 × 100 g");
  await page.setViewportSize({ width: 390, height: 440 });
  await page.getByLabel("Package size", { exact: true }).focus();
  await expect
    .poll(
      async () => (await page.locator(".editor.modal").boundingBox())?.height,
    )
    .toBe(844);
  const editorBox = await page.locator(".editor.modal").boundingBox();
  expect(editorBox!.x).toBe(0);
  expect(editorBox!.y).toBe(0);
  expect(editorBox!.width).toBe(390);
  expect(editorBox!.height).toBe(844);
  const save = page.getByRole("button", { name: "Add item", exact: true });
  await expect(page.locator("html")).toHaveClass(/keyboard-open/);
  await expect(page.locator(".editor .form-footer")).toBeHidden();
  await expect(page.getByRole("button", { name: "Done typing" })).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel("Package size", { exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile-keyboard-height.png" });
  await page.getByLabel("Package size", { exact: true }).blur();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(save).toBeVisible();
  await expect(save).toBeInViewport();
  await expect(page.getByLabel("Package size", { exact: true })).toHaveValue(
    "2 × 100 g",
  );
  await page.screenshot({ path: "test-results/mobile-editor.png" });
  await save.click();
  await all(page);
  await expect(
    page.getByRole("img", {
      name: "Haruharu wonder Black Rice Bakuchiol Eye Cream 20ml",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await all(page);
  await expect(
    page.getByRole("img", {
      name: "Haruharu wonder Black Rice Bakuchiol Eye Cream 20ml",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /View Haruharu/ }).click();
  const buttons = page.locator(".detail-actions button");
  const box0 = await buttons.nth(0).boundingBox(),
    box1 = await buttons.nth(1).boundingBox();
  expect(box0!.width).toBeCloseTo(box1!.width, 0);
  await expect(page.locator(".detail.modal")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/mobile-detail.png" });
  await page.getByRole("button", { name: "Edit details" }).click();
  await expandSection(page, "Photos & label recognition");
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  await page.getByRole("button", { name: "Cancel crop" }).click();
  await expect(page.getByLabel("Product name *")).toHaveValue(
    "Haruharu wonder Black Rice Bakuchiol Eye Cream 20ml",
  );
  await page.getByRole("button", { name: "Crop photo", exact: true }).click();
  await page.getByRole("button", { name: "Use crop" }).click();
  await expect(page.locator(".crop-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  await expandSection(page, "Photos & label recognition");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("public/icons/icon-192.png");
  await page.getByRole("button", { name: "Use crop" }).click();
  await expect(page.locator(".crop-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".editor.modal")).toHaveCount(0);
  await page.reload();
  await all(page);
  const image = page.getByRole("img", {
    name: "Haruharu wonder Black Rice Bakuchiol Eye Cream 20ml",
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((e: HTMLImageElement) => e.naturalWidth))
    .toBe(192);
  await context.close();
});
