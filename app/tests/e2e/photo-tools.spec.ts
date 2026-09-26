import { test, expect, type Locator } from "@playwright/test";
import { expandSection } from "./editor-helpers";

test.beforeEach(async ({ context, page }) => {
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "photo-tools@example.test",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
});

async function bytes(image: Locator) {
  return image.evaluate(async (el: HTMLImageElement) => {
    const data = await (await fetch(el.src)).arrayBuffer();
    return Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    ).join(",");
  });
}

test("zero, label-only, product-only and both photos use full mobile columns and compact options", async ({
  page,
}) => {
  const product = page.getByRole("region", {
    name: "Product photo tools",
    exact: true,
  });
  const label = page.getByRole("region", {
    name: "Label photo tools",
    exact: true,
  });
  const name = page.getByLabel("Product name *");
  await name.fill(
    "A long item title that stays readable on the narrowest mobile screen",
  );
  await expect(product.locator("img")).toHaveCount(0);
  await expect(label.locator("img")).toHaveCount(0);
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 844 });
    const a = await product.boundingBox(),
      b = await label.boundingBox();
    expect(a!.x).toBe(b!.x);
    expect(a!.width).toBeGreaterThan(width - 50);
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    await page.screenshot({ path: `test-results/photos-zero-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  await expect(label.locator("img")).toBeVisible();
  await expect(product.locator("img")).toHaveCount(0);
  await expect(label.locator(".recognition-options")).not.toHaveAttribute(
    "open",
  );
  await label
    .getByRole("button", { name: "Read date from photo", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/photos-label-only-390.png" });
  // Close without saving, then create a product-only draft.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await name.fill("Another long product title for a useful mobile preview");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("public/demo/yogurt.png");
  await page
    .getByRole("button", { name: "Keep full photo", exact: true })
    .click();
  await expect(product.locator("img")).toBeVisible();
  await expect(label.locator("img")).toHaveCount(0);
  await expect(product.locator(".recognition-options")).not.toHaveAttribute(
    "open",
  );
  await product
    .getByRole("button", { name: "Recognize product", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/photos-product-only-390.png" });
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  for (const width of [320, 390, 760, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const panel of [product, label]) {
      const photo = panel.locator(".photo");
      await expect
        .poll(async () => Math.round((await photo.boundingBox())!.height))
        .toBe(220);
      const preview = await photo.boundingBox(),
        box = await panel.boundingBox();
      expect(preview!.width).toBe(box!.width);
      expect(preview!.height).toBe(220);
      await expect(photo.locator("img")).toHaveCSS("object-fit", "contain");
      const image = await photo.locator("img").boundingBox();
      expect(image!.height).toBeLessThanOrEqual(preview!.height + 1);
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await panel
        .getByRole("button", {
          name:
            panel === product ? "Recognize product" : "Read date from photo",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/photos-both-${panel === product ? "product" : "label"}-${width}.png`,
      });
    }
    await expect(page.locator(".editor .form-footer")).toBeInViewport();
  }
});

test("options, OCR failure, crop and replacement preserve independent photos and draft fields", async ({
  page,
}) => {
  await page.route("**/ocr/**", (route) => route.abort());
  const name = page.getByLabel("Product name *");
  await name.fill("Preserved draft");
  await expandSection(page, "More details");
  await page.getByLabel("Brand", { exact: true }).fill("Test brand");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Keep both photos and this note");
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("public/demo/yogurt.png");
  await page
    .getByRole("button", { name: "Keep full photo", exact: true })
    .click();
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  const product = page.getByRole("region", {
    name: "Product photo tools",
    exact: true,
  });
  const label = page.getByRole("region", {
    name: "Label photo tools",
    exact: true,
  });
  const productImage = product.locator("img"),
    labelImage = label.locator("img");
  await expect(labelImage).toBeVisible();
  const productBefore = await bytes(productImage),
    labelBefore = await bytes(labelImage);
  for (const [panel, summary, field] of [
    [product, "Product recognition options", "Product text area"],
    [label, "Label recognition options", "Date text area"],
  ] as const) {
    await panel.locator("summary").filter({ hasText: summary }).click();
    await page.getByLabel(field, { exact: true }).click();
    await page.getByRole("option", { name: "Top half", exact: true }).click();
    await panel.locator("summary").filter({ hasText: summary }).click();
    await panel.locator("summary").filter({ hasText: summary }).click();
    await expect(page.getByLabel(field, { exact: true })).toContainText(
      "Top half",
    );
    await panel.locator("summary").filter({ hasText: summary }).click();
  }
  await product
    .getByRole("button", { name: "Recognize product", exact: true })
    .click();
  await expect(product.getByRole("status")).toContainText(
    "Recognition unavailable",
    { timeout: 10000 },
  );
  expect(await bytes(productImage)).toBe(productBefore);
  expect(await bytes(labelImage)).toBe(labelBefore);
  await product
    .getByRole("button", { name: "Crop photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Use crop", exact: true }).click();
  await expect(page.locator(".crop-dialog")).toHaveCount(0);
  expect(await bytes(labelImage)).toBe(labelBefore);
  const cropped = await bytes(productImage);
  expect(cropped).not.toBe(productBefore);
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("public/demo/yogurt.png");
  await expect.poll(() => bytes(labelImage)).not.toBe(labelBefore);
  expect(await bytes(productImage)).toBe(cropped);
  const replacementLabel = await bytes(labelImage);
  await page
    .getByLabel("Product photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  await page
    .getByRole("button", { name: "Keep full photo", exact: true })
    .click();
  await expect.poll(() => bytes(productImage)).not.toBe(cropped);
  expect(await bytes(labelImage)).toBe(replacementLabel);
  await expect(name).toHaveValue("Preserved draft");
  await expect(page.getByLabel("Brand", { exact: true })).toHaveValue(
    "Test brand",
  );
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "Keep both photos and this note",
  );
  await page
    .locator(".editor .form-footer")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/sync")).json()).records?.items
          ?.length,
    )
    .toBe(1);
  const { records } = await (await page.request.get("/api/sync")).json();
  expect(records.items[0]).toMatchObject({
    quantity: 3,
    notes: "Keep both photos and this note",
  });
  expect(records.products[0]).toMatchObject({
    name: "Preserved draft",
    brand: "Test brand",
  });
  expect(records.items[0].packagingPhotoId).not.toBe(
    records.products[0].photoId,
  );
});

test("successful product recognition keeps the draft until its editable result is explicitly applied", async ({
  page,
}) => {
  test.setTimeout(90000);
  const name = page.getByLabel("Product name *");
  await name.fill("Manual title stays until confirmation");
  await expandSection(page, "More details");
  await page.getByLabel("Brand", { exact: true }).fill("Test manufacturer");
  await page.getByLabel("Notes", { exact: true }).fill("Unchanged note");
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  const label = page.getByRole("region", {
    name: "Label photo tools",
    exact: true,
  });
  const labelBytes = await bytes(label.locator("img"));
  // Generated text fixture, never a personal photo or external upload.
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1024, 768);
    ctx.fillStyle = "black";
    ctx.font = "bold 90px Arial";
    ctx.fillText("PLAIN OAT MILK", 100, 360);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Product photo", { exact: true }).setInputFiles({
    name: "synthetic-product.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByRole("button", { name: "Keep full photo", exact: true })
    .click();
  const product = page.getByRole("region", {
    name: "Product photo tools",
    exact: true,
  });
  const productBytes = await bytes(product.locator("img"));
  await product
    .getByRole("button", { name: "Recognize product", exact: true })
    .click();
  const suggested = page.getByLabel("Suggested product name", { exact: true });
  await expect(suggested).toHaveValue(/OAT MILK/i, { timeout: 75000 });
  await expect(name).toHaveValue("Manual title stays until confirmation");
  await expect(suggested).toHaveAttribute(
    "name",
    "until-recognized-product-title",
  );
  await expect(suggested).toHaveAttribute("autocomplete", "off");
  await suggested.fill("Edited recognized title");
  await product
    .getByRole("button", { name: "Use suggested name", exact: true })
    .click();
  await expect(name).toHaveValue("Edited recognized title");
  await expect(page.getByLabel("Brand", { exact: true })).toHaveValue(
    "Test manufacturer",
  );
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
    "Unchanged note",
  );
  expect(await bytes(product.locator("img"))).toBe(productBytes);
  expect(await bytes(label.locator("img"))).toBe(labelBytes);
});
