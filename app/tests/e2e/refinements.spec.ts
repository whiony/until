import { expandSection, setDate } from "./editor-helpers";
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import sharp from "sharp";
const auth = (id = crypto.randomUUID()) => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": "refinements@example.test",
});
async function add(page: Page, name: string, photo = false) {
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill(name);
  if (photo) {
    await expandSection(page, "Photos & label recognition");
    await page
      .getByLabel("Product photo", { exact: true })
      .setInputFiles("public/demo/yogurt.png");
    await page.getByRole("button", { name: "Use crop" }).click();
  }
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
}
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(auth()));
test("demo is visibly isolated from real records, cloud, exports and reload", async ({
  page,
}) => {
  await page.goto("/");
  await add(page, "My real oats");
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          .length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Try demo" }).click();
  await expect(page.getByText("Demo mode · read-only")).toBeVisible();
  await page.getByRole("tab", { name: /All items/ }).click();
  await expect(page.locator(".demo-tag")).toHaveCount(9);
  await expect(page.locator(".section-heading > span")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /All items/ })).toContainText(
    "16",
  );
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "View Greek yogurt", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "More", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export JSON/ }).click();
  const download = await downloadPromise;
  const data = JSON.parse(await fs.readFile((await download.path())!, "utf8"));
  expect(data.products.map((p: { name: string }) => p.name)).toEqual([
    "My real oats",
  ]);
  expect(
    (await (await page.request.get("/api/sync")).json()).records.items,
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Back to my items" }).click();
  await expect(
    page.getByRole("heading", { name: "My real oats", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Demo mode · read-only")).toHaveCount(0);
  await page.getByRole("button", { name: "Try demo" }).click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await expect(page.locator(".demo-tag")).toHaveCount(9);
  await page.screenshot({
    path: "test-results/demo-desktop.png",
    fullPage: true,
  });
});
test("name-only and name plus photo survive reload and transfer to a second account session", async ({
  browser,
}) => {
  test.setTimeout(50000);
  const headers = auth(),
    a = await browser.newContext({ extraHTTPHeaders: headers }),
    b = await browser.newContext({ extraHTTPHeaders: headers });
  const phone = await a.newPage(),
    desktop = await b.newPage();
  await phone.goto("http://127.0.0.1:5173");
  await desktop.goto("http://127.0.0.1:5173");
  await add(phone, "Name only");
  await add(phone, "Name with photo", true);
  await expect(
    desktop.getByRole("heading", { name: "Name only", exact: true }),
  ).toBeVisible({ timeout: 16000 });
  await expect(
    desktop.getByRole("img", { name: "Name with photo", exact: true }),
  ).toBeVisible({ timeout: 16000 });
  await phone.reload();
  await expect(
    phone.getByRole("img", { name: "Name with photo", exact: true }),
  ).toBeVisible();
  await expect(phone.locator(".item-card")).toHaveCount(2);
  await a.close();
  await b.close();
});
test("invalid submission focuses the relevant field and retains typed name and photo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Product name *")).toBeFocused();
  await expect(
    page.getByText("Add a product name.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Product name *").fill("Keep my photo");
  await expandSection(page, "Photos & label recognition");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("public/demo/yogurt.png");
  await page.getByRole("button", { name: "Use crop" }).click();
  await expandSection(page, "More details");
  await page.getByLabel("Quantity", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Quantity", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Product name *")).toHaveValue("Keep my photo");
  await expect(
    page.getByRole("img", { name: "Keep my photo", exact: true }),
  ).toBeVisible();
  await expandSection(page, "More details");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await expandSection(page, "More details");
  await setDate(page, "Purchase date", "2199-01-01");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Purchase date", { exact: true })).toBeFocused();
  await expect(
    page.getByText(
      "Purchase date must not be in the future or after opening.",
      { exact: true },
    ),
  ).toBeVisible();
  await setDate(page, "Purchase date", "");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await expect(
    page.locator(".footer-quantity").filter({ hasText: "×2 unopened" }),
  ).toBeVisible();
});
test("real product OCR suggests text only after explicit action and confirmation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("My original name");
  await expandSection(page, "Photos & label recognition");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("public/demo/yogurt.png");
  await page.getByRole("button", { name: "Use crop" }).click();
  await expect(page.getByText("Recognized product text")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Recognize product", exact: true })
    .click();
  await expect(page.getByText("Recognized product text")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByLabel("Product name *")).toHaveValue(
    "My original name",
  );
  await expect(page.locator(".product-recognition pre")).toContainText(
    /YOGURT/i,
  );
  await page.getByLabel("Suggested product name").fill("Greek yogurt");
  await page.getByRole("button", { name: "Use suggested name" }).click();
  await expect(page.getByLabel("Product name *")).toHaveValue("Greek yogurt");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Greek yogurt", exact: true }),
  ).toBeVisible();
});
test("unavailable product OCR keeps manual entry and the photo", async ({
  page,
}) => {
  await page.route("**/ocr/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("Manual label");
  await expandSection(page, "Photos & label recognition");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("public/demo/yogurt.png");
  await page.getByRole("button", { name: "Use crop" }).click();
  await page
    .getByRole("button", { name: "Recognize product", exact: true })
    .click();
  await expect(page.getByText(/Recognition unavailable/)).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByLabel("Product name *")).toHaveValue("Manual label");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("img", { name: "Manual label", exact: true }),
  ).toBeVisible();
});
test("PWA metadata serves opaque versioned icons at correct sizes and types", async ({
  page,
}) => {
  await page.goto("/");
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .first()
    .getAttribute("href");
  expect(apple).toContain("v=5");
  const icon = await page.request.get(apple!);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/png");
  const metadata = await sharp(await icon.body()).metadata();
  expect(metadata.width).toBe(180);
  expect(metadata.height).toBe(180);
  const pixels = await sharp(await icon.body())
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (pixels.info.channels === 4) expect(pixels.data[3]).toBe(255);
  const manifest = await (
    await page.request.get("/manifest.webmanifest?v=5")
  ).json();
  for (const entry of manifest.icons) {
    const response = await page.request.get(entry.src);
    const meta = await sharp(await response.body()).metadata();
    expect(`${meta.width}x${meta.height}`).toBe(entry.sizes);
  }
});

test("empty states, filtered quantity counts, summary and toolbar placement remain accurate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("No items yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try demo" }).click();
  await expect(page.locator(".heads-up")).toContainText("12");
  await page.getByLabel("Search items").fill("no such item");
  await expect(
    page.getByText("No matching items", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByLabel("Search items").fill("yogurt");
  await expect(
    page.locator(".section-heading > span").filter({ hasText: /^2 items$/ }),
  ).toBeVisible();
  const sort = await page
      .getByLabel("Sort Items", { exact: true })
      .boundingBox(),
    toggle = await page
      .getByRole("button", { name: "Show list" })
      .boundingBox();
  expect(toggle!.x - sort!.x - sort!.width).toBeLessThan(24);
  await page.getByRole("button", { name: "Show list" }).click();
  await expect(page.locator(".cards.as-list .item-card")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/desktop-toolbar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Exit demo" }).click();
  await add(page, "Awaiting a date");
  await expect(
    page.getByText("Nothing expiring soon", { exact: true }),
  ).toBeVisible();
});
