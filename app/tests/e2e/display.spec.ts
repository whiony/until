import { expandSection } from "./editor-helpers";
import { test, expect } from "@playwright/test";
test("aligned grid, compact list, invariant mobile cards and expired details", async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "display@example.test",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  const cards = page.locator(".cards").first().locator(".item-card");
  await expect(cards.first()).toBeVisible();
  const row = await cards.evaluateAll((els) =>
    els.map((el) => ({
      top: el.getBoundingClientRect().top,
      status: el.querySelector(".countdown")!.getBoundingClientRect().top,
      bottom: el.querySelector(".card-bottom")!.getBoundingClientRect().top,
    })),
  );
  for (const x of row) {
    expect(x.bottom - x.status).toBeLessThan(120);
  }
  expect((await cards.first().boundingBox())!.height).toBeLessThan(300);
  await expect(cards.first().locator(".date-caption")).toContainText(
    /\d{2} [A-Z][a-z]{2} \d{4}/,
  );
  await page.screenshot({
    path: "test-results/display-grid.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View Cat food", exact: true })
    .click();
  await expect(page.locator(".detail")).toHaveClass(/detail-expired/);
  await expect(page.locator(".detail")).toHaveCSS(
    "background-color",
    "rgb(252, 241, 233)",
  );
  await expect(page.locator(".detail dd")).toContainText([
    "best before",
    "unopened",
    "4 units",
  ]);
  const edit = await page
    .getByRole("button", { name: "Edit details", exact: true })
    .boundingBox();
  const actions = await page.locator(".detail-actions").boundingBox();
  expect(Math.abs(edit!.width - actions!.width)).toBeLessThan(3);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/display-detail.png",
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Show list", exact: true }).click();
  await expect(page.locator(".cards.as-list").first()).toHaveCSS(
    "max-width",
    "none",
  );
  await page.screenshot({
    path: "test-results/display-list.png",
    fullPage: true,
  });
  for (const width of [800, 1024, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Search items").fill("Cat food");
    await expect(page.locator(".item-card")).toHaveCount(1);
    expect(
      (await page.locator(".item-card").boundingBox())!.height,
    ).toBeLessThan(300);
    await page.getByLabel("Search items").fill("");
  }
  for (const width of [320, 390, 760]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".view-toggle")).toBeHidden();
    const before = await cards.first().locator(".photo").boundingBox();
    await page.evaluate(() =>
      document.querySelector(".cards")?.classList.remove("as-list"),
    );
    expect(await cards.first().locator(".photo").boundingBox()).toEqual(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/display-mobile.png",
    fullPage: true,
  });
});
test("public application assets have current U references and correct image bytes", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("/favicon.svg?v=5");
  expect(html).toContain("/apple-touch-icon.png?v=5");
  const manifest = await (
    await request.get("/manifest.webmanifest?v=5")
  ).json();
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const data = await response.body();
    expect(new DataView(new Uint8Array(data).buffer).getUint32(16)).toBe(
      Number(icon.sizes.split("x")[0]),
    );
  }
  const svg = await (await request.get("/favicon.svg?v=5")).text();
  expect(svg).toContain("<path");
  expect(svg).not.toContain("<circle");
});

test("field help clears controls and optional sections remain usable", async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "spacing@example.test",
  });
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", {
        name: width > 760 ? "Add item" : "Add item",
        exact: true,
      })
      .first()
      .click();
    const help = await page
      .getByRole("button", { name: "Help: Printed date", exact: true })
      .boundingBox();
    const input = await page
      .getByLabel("Printed date", { exact: true })
      .boundingBox();
    expect(input!.y - (help!.y + help!.height)).toBeGreaterThanOrEqual(4);
    for (const name of [
      "After opening",
      "Photos & label recognition",
      "More details",
    ])
      await expandSection(page, name);
    expect(
      await page
        .locator(".editor")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/form-${width}.png`,
      animations: "disabled",
    });
  }
});
