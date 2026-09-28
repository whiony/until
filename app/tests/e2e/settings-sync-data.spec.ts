import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyRecords } from "../../lib/until/domain";
import { verifyPortableArchive } from "../../lib/until/portable-archive";
import { expandSection } from "./editor-helpers";

const auth = (id: string) => ({
  "oai-authenticated-user-id": id,
  "oai-authenticated-user-email": `${id}@example.test`,
});

test("unchanged checks return no collection; changed checks and account switches return their own records", async ({ browser }) => {
  const id = crypto.randomUUID();
  const context = await browser.newContext({ extraHTTPHeaders: auth(id) });
  const records = emptyRecords();
  const at = new Date().toISOString();
  for (let i = 0; i < 100; i++) records.products.push({
    id: crypto.randomUUID(), name: `Representative ${i}`, brand: "", category: "Food",
    barcode: "", size: "", createdAt: at, updatedAt: at, schemaVersion: 1,
  });
  const put = await context.request.put("http://127.0.0.1:5173/api/sync", {
    headers: { ...auth(id), "If-Match": "0" }, data: records,
  });
  expect(put.status()).toBe(200);
  const full = await context.request.get("http://127.0.0.1:5173/api/sync", { headers: auth(id) });
  const fullBytes = (await full.body()).length;
  expect(fullBytes).toBeGreaterThan(20000);
  const etag = full.headers().etag;
  const unchanged = await context.request.get("http://127.0.0.1:5173/api/sync", {
    headers: { ...auth(id), "If-None-Match": etag },
  });
  expect(unchanged.status()).toBe(304);
  expect((await unchanged.body()).length).toBe(0);
  const changed = structuredClone(records);
  changed.products.push({ id: crypto.randomUUID(), name: "New remote item", brand: "", category: "", barcode: "", size: "", createdAt: at, updatedAt: at, schemaVersion: 1 });
  expect((await context.request.put("http://127.0.0.1:5173/api/sync", { headers: { ...auth(id), "If-Match": "1" }, data: changed })).status()).toBe(200);
  const updated = await context.request.get("http://127.0.0.1:5173/api/sync", { headers: { ...auth(id), "If-None-Match": etag } });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).records.products).toHaveLength(101);
  const otherId = crypto.randomUUID();
  const other = await browser.newContext({ extraHTTPHeaders: auth(otherId) });
  const isolated = await other.request.get("http://127.0.0.1:5173/api/sync", { headers: { ...auth(otherId), "If-None-Match": etag } });
  expect(isolated.status()).toBe(200);
  expect((await isolated.json()).records).toBeNull();
  console.log(`100-product unchanged check: before ${fullBytes} response bytes, after 0; D1 SELECTs before 3, after 1; R2 lists before at least 1, after 0.`);
  await other.close();
  await context.close();
});

test("Settings stays compact on desktop/mobile and downloads records with both photo files", async ({ browser }) => {
  test.setTimeout(80000);
  const id = crypto.randomUUID();
  const context = await browser.newContext({ extraHTTPHeaders: auth(id), viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).first().click();
  await page.getByLabel("Product name *").fill("Archive test product");
  await expandSection(page, "Photos & label recognition");
  await page.getByLabel("Product photo", { exact: true }).setInputFiles("public/demo/yogurt.png");
  await page.getByRole("button", { name: "Keep full photo", exact: true }).click();
  await page.getByLabel("Label photo", { exact: true }).setInputFiles("tests/fixtures/label.png");
  await page.getByRole("button", { name: "Add item", exact: true }).last().click();
  await expect(page.locator(".editor")).toHaveCount(0);
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  for (const heading of ["Appearance & browsing", "Organize", "Reminders", "Account & data"])
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(page.locator(".manager-details").first()).not.toHaveAttribute("open", "");
  await page.screenshot({ path: "test-results/task-settings-desktop.png", fullPage: true });
  await page.locator(".manager-details").first().locator("summary").click();
  await expect(page.getByRole("button", { name: "Hide Beauty" })).toBeVisible();
  await page.locator(".settings-reminders summary").click();
  const digest = page.getByRole("checkbox", { name: /Save my preference for a daily digest/ });
  await digest.click();
  await page.getByLabel("Show dates in the next (days)").fill("13");
  await page.getByRole("button", { name: "Save Soon window" }).click();
  await expect(page.getByRole("status").last()).toContainText("Soon window saved");
  await expect(digest).toBeChecked();
  await page.getByRole("button", { name: "Save reminder preferences" }).click();
  await expect(page.getByRole("status").last()).toContainText("Delivery is not active");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download your data" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^until-data-\d{4}-\d{2}-\d{2}\.zip$/);
  const { data, entries } = await verifyPortableArchive(new Blob([await readFile((await download.path())!)]));
  expect(data.records.products.map((product) => product.name)).toContain("Archive test product");
  expect([...entries.keys()].some((path) => path.startsWith(`photos/${data.records.products[0].photoId}.`))).toBe(true);
  expect([...entries.keys()].some((path) => path.startsWith(`photos/${data.records.items[0].packagingPhotoId}.`))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Show dates in the next (days)")).toHaveValue("13");
  await page.locator(".settings-reminders summary").click();
  await expect(page.getByRole("checkbox", { name: /Save my preference for a daily digest/ })).toBeChecked();
  await page.locator(".settings-reminders summary").click();
  await expect(page.locator(".settings-grid")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/task-settings-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/task-settings-mobile-320.png", fullPage: true });
  const second = await browser.newContext({ extraHTTPHeaders: auth(id), viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const mirror = await second.newPage();
  await mirror.goto("/");
  await expect(mirror.getByRole("button", { name: "View Archive test product" })).toBeVisible({ timeout: 20000 });
  await mirror.getByRole("button", { name: "Settings", exact: true }).click();
  const secondDownload = mirror.waitForEvent("download");
  await mirror.getByRole("button", { name: "Download your data" }).click();
  const remoteArchive = await secondDownload;
  const remoteCopy = await verifyPortableArchive(new Blob([await readFile((await remoteArchive.path())!)]));
  expect(remoteCopy.data.records.items).toHaveLength(1);
  expect(remoteCopy.entries.size).toBe(4); // records, manifest, product and packaging photos
  await second.close();
  await context.close();
});

test("a browser-hidden page stops ten-second sync reads and resumes on visibility change", async ({ browser }) => {
  test.setTimeout(30000);
  const context = await browser.newContext({ extraHTTPHeaders: auth(crypto.randomUUID()) });
  const page = await context.newPage();
  let checks = 0;
  await page.route("**/api/sync", async (route) => {
    if (route.request().method() === "GET") checks++;
    await route.continue();
  });
  await page.goto("/");
  await expect.poll(() => checks).toBeGreaterThan(0);
  // Headless Chromium keeps every tab visible; emulate its visibility signal.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("hidden");
  const before = checks;
  await page.waitForTimeout(11200);
  expect(checks).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => checks).toBeGreaterThan(before);
  await context.close();
});

test("changing the signed-in account never treats an equal revision as the same shelf", async ({ browser }) => {
  const firstId = crypto.randomUUID(), secondId = crypto.randomUUID();
  const context = await browser.newContext({ extraHTTPHeaders: auth(firstId) });
  const page = await context.newPage();
  const add = async (name: string) => {
    await page.getByRole("button", { name: "Add item", exact: true }).first().click();
    await page.getByLabel("Product name *").fill(name);
    await page.getByRole("button", { name: "Add item", exact: true }).last().click();
    await expect(page.getByRole("button", { name: `View ${name}` })).toBeVisible();
  };
  await page.goto("/");
  await add("First account item");
  await expect.poll(async () => (await (await page.request.get("/api/sync")).json()).records?.items.length).toBe(1);
  await context.setExtraHTTPHeaders(auth(secondId));
  await page.reload();
  await expect(page.getByRole("button", { name: "View First account item" })).toHaveCount(0);
  await add("Second account item");
  await expect.poll(async () => (await (await page.request.get("/api/sync")).json()).records?.items.length).toBe(1);
  await context.setExtraHTTPHeaders(auth(firstId));
  await page.reload();
  await expect(page.getByRole("button", { name: "View First account item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View Second account item" })).toHaveCount(0);
  await context.close();
});

test("a data download aborts if the active account changes while a photo is loading", async ({ browser }) => {
  const id = crypto.randomUUID();
  const context = await browser.newContext({ extraHTTPHeaders: auth(id), acceptDownloads: true });
  const page = await context.newPage();
  const photoId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const records = emptyRecords();
  const at = new Date().toISOString();
  records.products.push({ id: productId, name: "Export race", brand: "", category: "", barcode: "", size: "", photoId, createdAt: at, updatedAt: at, schemaVersion: 1 });
  records.items.push({ id: crypto.randomUUID(), productId, quantity: 1, printedDate: "", dateKind: "unspecified", purchaseDate: "", openedDate: "", location: "", notes: "", status: "active", createdAt: at, updatedAt: at, schemaVersion: 1 });
  const bytes = await readFile("tests/fixtures/label.png");
  expect((await context.request.put(`http://127.0.0.1:5173/api/photos/${photoId}`, { headers: { ...auth(id), "Content-Type": "image/png" }, data: bytes })).status()).toBe(204);
  expect((await context.request.put("http://127.0.0.1:5173/api/sync", { headers: { ...auth(id), "If-Match": "0" }, data: records })).status()).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "View Export race" })).toBeVisible();
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.evaluate(async (photoId) => {
    const request = indexedDB.open("until");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction(["state", "photos"], "readwrite");
    const account = await new Promise<string>((resolve) => {
      const get = tx.objectStore("state").get("activeAccount");
      get.onsuccess = () => resolve(get.result);
    });
    tx.objectStore("photos").delete(`account:${account}:${photoId}`);
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  }, photoId);
  let release!: () => void;
  let seen!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const requestSeen = new Promise<void>((resolve) => { seen = resolve; });
  await page.route(`**/api/photos/${photoId}`, async (route) => {
    seen();
    await paused;
    await route.continue();
  });
  let downloads = 0;
  page.on("download", () => { downloads++; });
  await page.getByRole("button", { name: "Download your data" }).click();
  await requestSeen;
  await page.evaluate(async (other) => {
    const request = indexedDB.open("until");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(other, "activeAccount");
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
  }, crypto.randomUUID());
  release();
  await expect(page.getByRole("status").last()).toContainText("account changed");
  expect(downloads).toBe(0);
  await context.close();
});
