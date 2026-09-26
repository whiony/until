import {expandSection,setDate} from "./editor-helpers";
import { test, expect } from "@playwright/test";
// Local test harness emulates the identity asserted by Sites dispatch, not a mocked API.
test.use({
  extraHTTPHeaders: {
    "oai-authenticated-user-id": "journeys-v2",
    "oai-authenticated-user-email": "journeys@example.test",
  },
});

const localDate = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
test("real item lifecycle, reload, mobile layout and manual barcode fallback", async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "journeys@example.test",
  });
  await page.goto("/");
  await expect(page.getByText("No items yet")).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("Greek yogurt");
  await setDate(page, "Printed date", localDate(3));
  await expandSection(page, "More details");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await expandSection(page, "After opening");
  await page.getByLabel("Use within after opening", {exact:true}).fill("2");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Greek yogurt" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Greek yogurt" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Greek yogurt" }).click();
  await page.getByRole("button", { name: "Open one", exact: true }).click();
  await expect(page.getByText("2 · active")).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Greek yogurt" }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Mark one as used", exact: true })
    .first()
    .click();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "Greek yogurt" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add again" }).click();
  await setDate(page, "Printed date", localDate(15));
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await expect(
    page.getByRole("button", { name: "View Greek yogurt" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(page.getByLabel("Barcode", { exact: true })).toHaveCount(0);
  await page.getByLabel("Product name *").fill("Hand cream");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /Soon/ }).click();
  await expect(
    page.getByRole("heading", { name: /Needs a date/ }),
  ).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const nav = await page.getByRole("tab", { name: "History" }).boundingBox();
  expect(nav!.height).toBeLessThan(60);
  expect(nav!.y).toBeGreaterThan(100);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
test("no fake notification enablement", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "journeys@example.test",
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(
    page.getByText("Notifications are not active.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check reminder availability" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reminders are not available" }),
  ).toBeVisible();
});
test("offline shell reload and offline edit persist", async ({
  page,
  context,
}) => {
  await page.context().setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "journeys@example.test",
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(async () => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("No items yet")).toBeVisible();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("Offline oats");
  await setDate(page, "Printed date", localDate(2));
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Offline oats" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Offline oats" }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("actual photo OCR exposes text and requires confirmation", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.context().setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "journeys@example.test",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("Label test");
  await expandSection(page, "Photos & label recognition");
  await page
    .getByLabel("Label photo", { exact: true })
    .setInputFiles("tests/fixtures/label.png");
  await expect(
    page.getByRole("button", { name: "Read date from photo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Read date from photo" }).click();
  await expect(page.getByText(/Extracted text/)).toBeVisible({
    timeout: 75000,
  });
  await expect(page.getByLabel("Printed date", { exact: true })).toHaveText(
    "Add a date",
  );
  await page
    .getByRole("button", { name: "Confirm 12 Aug 2027", exact: true })
    .click();
  await expect(page.getByLabel("Printed date", { exact: true })).toHaveText(
    "12 Aug 2027",
  );
  await page
    .getByRole("button", { name: "Confirm 7 days", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByRole("button", { name: "View Label test" }).click();
  await expect(
    page.getByRole("img", { name: "Original packaging label" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByRole("button", { name: "View Label test" }).click();
  await expect(
    page.getByRole("img", { name: "Original packaging label" }),
  ).toBeVisible();
});

test("camera denial retains manual creation", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "journeys@example.test",
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("button", { name: "Scan barcode", exact: true }).click();
  await expect(
    page.getByText("Camera could not start.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.getByLabel("Product name *")).toBeEditable();
});
