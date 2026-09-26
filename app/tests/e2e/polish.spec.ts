import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "polish@example.test",
  }),
);
test("history-only shelf is empty, historical labels are honest, and help preserves input", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const name = page.getByLabel("Product name *");
  await name.fill("History sample");
  expect((await name.boundingBox())!.y).toBeLessThan(
    (await page
      .getByRole("button", { name: "Scan barcode", exact: true })
      .boundingBox())!.y,
  );
  await expect(page.getByLabel("Barcode", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Help: Printed date", exact: true })
    .click();
  await expect(page.getByRole("note")).toContainText("printed on the packaging");
  await page.keyboard.press("Escape");
  await expect(name).toHaveValue("History sample");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByRole("button", { name: "Mark one as used", exact: true }).click();
  await expect(page.getByText("No items yet", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "History", exact: true }).click();
  const card = page.locator(".item-card");
  await expect(card.locator(".countdown")).toHaveText("Used");
  await expect(card.locator(".footer-quantity")).toHaveCount(0);
  await expect(card).not.toContainText("unopened");
  await expect(card).not.toContainText("on your shelf");
  await expect(card).not.toContainText("Add a date");
  await page.getByRole("button", { name: "View History sample" }).click();
  await expect(page.locator(".detail-countdown")).toHaveText("Used");
  await expect(
    page.getByText("Historical record.", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('button',{name:'Add again',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add item',exact:true}).click();
  await page.getByLabel('Product name *').fill('Discard sample');
  await page.getByRole('button',{name:'Add item',exact:true}).last().click();
  await page.getByRole('tab',{name:/All items/}).click();
  await page.getByRole('button',{name:'View Discard sample'}).click();
  await page.getByRole('button',{name:'Discard one',exact:true}).click();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('tab',{name:'History',exact:true}).click();
  const discarded=page.locator('.item-card').filter({hasText:'Discard sample'});
  await expect(discarded.locator('.countdown')).toHaveText('Discarded');
  await expect(discarded).not.toContainText('unopened');
  await expect(discarded).not.toContainText('on your shelf');
});
test("long filter values keep stable mobile grid and desktop views identify current mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.addStyleTag({content:':root { --safe-top: 59px; }'});
  expect((await page.getByRole('link',{name:'Until',exact:true}).boundingBox())!.y).toBeGreaterThanOrEqual(59);
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  const row = page.locator(".filter-row"),
    before = await row.boundingBox();
  for (const status of ["Needs a Date", "Unopened", "Discarded", "Active"]) {
    await page.getByLabel("Status Filter", { exact: true }).click();
    await page.getByRole("option", { name: status, exact: true }).click();
    const after = await row.boundingBox();
    expect(after!.height).toBe(before!.height);
  }
  await page.getByLabel("Sort Items", { exact: true }).click();
  await page
    .getByRole("option", { name: "Recently Opened", exact: true })
    .click();
  expect((await row.boundingBox())!.height).toBe(before!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/polish-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("link", { name: "Until", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Show list" })).toHaveText(
    "Grid",
  );
  await page.getByRole("button", { name: "Show list" }).click();
  await expect(page.getByRole("button", { name: "Show grid" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".cards.as-list .item-card")).toHaveCount(9);
  await page.screenshot({
    path: "test-results/polish-desktop.png",
    fullPage: true,
  });
});
test("scanner supports torch cleanup, decodes a real barcode and lookup failure never blocks creation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let draw = () => {};
    const state = { changes: [] as boolean[], stops: 0 };
    Object.assign(window, { cameraState: state, drawBarcode: () => draw() });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const c = canvas.getContext("2d")!;
        c.fillStyle = "white";
        c.fillRect(0, 0, 640, 480);
        draw = () => {
          const L = [
            "0001101",
            "0011001",
            "0010011",
            "0111101",
            "0100011",
            "0110001",
            "0101111",
            "0111011",
            "0110111",
            "0001011",
          ];
          const G = [
            "0100111",
            "0110011",
            "0011011",
            "0100001",
            "0011101",
            "0111001",
            "0000101",
            "0010001",
            "0001001",
            "0010111",
          ];
          const code = "3017620422003";
          const parity = [
            "LLLLLL",
            "LLGLGG",
            "LLGGLG",
            "LLGGGL",
            "LGLLGG",
            "LGGLLG",
            "LGGGLL",
            "LGLGLG",
            "LGLGGL",
            "LGGLGL",
          ][+code[0]];
          let bits = "101";
          for (let i = 1; i < 7; i++)
            bits += (parity[i - 1] === "L" ? L : G)[+code[i]];
          bits += "01010";
          for (let i = 7; i < 13; i++)
            bits += L[+code[i]]
              .split("")
              .map((x) => (x === "0" ? "1" : "0"))
              .join("");
          bits += "101";
          c.fillStyle = "black";
          [...bits].forEach((b, i) => {
            if (b === "1") c.fillRect(130 + i * 4, 100, 4, 260);
          });
        };
        const stream = canvas.captureStream(30),
          track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => {
          state.stops++;
          stop();
        };
        track.getCapabilities = () =>
          ({ torch: true }) as MediaTrackCapabilities;
        track.applyConstraints = async (constraints) => {
          state.changes.push(
            (constraints?.advanced?.[0] as { torch: boolean }).torch,
          );
        };
        return stream;
      },
    });
  });
  await page.route("**/api/lookup?*", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Product name *").fill("My entered name");
  await page.getByRole("button", { name: "Scan barcode", exact: true }).click();
  await page
    .getByRole("button", { name: "Turn light on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Turn light off", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    (window as unknown as { drawBarcode: () => void }).drawBarcode();
  });
  await page
    .getByRole("button", { name: "Look up scanned barcode", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByLabel("Product name *")).toHaveValue(
    "My entered name",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { cameraState: { stops: number } }).cameraState
            .stops,
      ),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { cameraState: { changes: boolean[] } })
          .cameraState.changes,
    ),
  ).toContain(false);
  await page.unroute("**/api/lookup?*");
  await page.route("**/api/lookup?*", (route) =>
    route.fulfill({
      json: {
        name: "Found product",
        brand: "Test brand",
        category: "Food",
        size: "200 g",
        barcode: "3017620422003",
        source: "Test provider",
        completeness: 0.75,
      },
    }),
  );
  await page
    .getByRole("button", { name: "Look up scanned barcode", exact: true })
    .click();
  await expect(page.getByLabel("Product name *")).toHaveValue(
    "My entered name",
  );
  await page
    .getByRole("button", { name: "Use these details", exact: true })
    .click();
  await expect(page.getByLabel("Product name *")).toHaveValue("Found product");
  await expect(page.getByLabel("Printed date", { exact: true })).toHaveText(
    "Add a date",
  );
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByRole("tab", { name: /All items/ }).click();
  await page.getByRole("button", { name: "View Found product" }).click();
  await expect(page.getByText("3017620422003", { exact: true })).toBeVisible();
});
