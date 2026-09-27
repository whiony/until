import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { emptyRecords } from "../../lib/until/domain";

async function seed(page: Page) {
  const records = emptyRecords();
  const stamp = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  const names = [
    "Both",
    "Category only",
    "Location only",
    "Neither",
    "Opened",
    "Expired",
    "History",
    "Long labels",
  ];
  records.products = names.map((name, n) => ({
    id: crypto.randomUUID(),
    name,
    brand: "",
    category:
      n === 7
        ? "Supplements and everyday nutritional essentials"
        : n === 2 || n === 3
          ? ""
          : n === 0
            ? "Supplements"
            : "Food",
    size: "",
    barcode: "",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1,
  }));
  records.items = records.products.map((p, n) => ({
    id: crypto.randomUUID(),
    productId: p.id,
    quantity: 2,
    printedDate: n === 5 ? "2020-01-01" : n === 0 || n === 4 ? tomorrow : "",
    dateKind: "unspecified",
    openedDate: n === 4 ? new Date().toISOString().slice(0, 10) : "",
    purchaseDate: "",
    location:
      n === 7
        ? "Upper pantry shelf beside the kitchen cabinet"
        : n === 1 || n === 3
          ? ""
          : "Pantry",
    notes: "",
    status: n === 6 ? "used" : "active",
    createdAt: stamp,
    updatedAt: stamp,
    schemaVersion: 1,
  }));
  const current = await (await page.request.get("/api/sync")).json();
  expect(
    (
      await page.request.put("/api/sync", {
        headers: { "If-Match": String(current.revision || 0) },
        data: records,
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
}
async function view(page: Page, section: string, width: number) {
  if (width <= 760)
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: section, exact: true })
      .click();
  else
    await page
      .getByRole("tab", { name: section === "All" ? /All items/ : /^History/ })
      .click();
}
test.beforeEach(async ({ context }) =>
  context.setExtraHTTPHeaders({
    "oai-authenticated-user-id": crypto.randomUUID(),
    "oai-authenticated-user-email": "card-ui@example.test",
  }),
);

test("neutral card borders and top accents stay unchanged on body/action hover and keyboard focus in Grid and List", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await seed(page);
  const surface = (card: ReturnType<Page["locator"]>) =>
    card.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        bg: s.backgroundColor,
        shadow: s.boxShadow,
        transform: s.transform,
        borders: [
          s.borderTopWidth,
          s.borderBottomWidth,
          s.borderLeftWidth,
          s.borderRightWidth,
        ],
        colors: [
          s.borderTopColor,
          s.borderBottomColor,
          s.borderLeftColor,
          s.borderRightColor,
        ],
      };
    });
  for (const mode of ["grid", "list"]) {
    for (const name of ["Both", "Expired", "History"]) {
      await view(page, name === "History" ? "History" : "All", 1440);
      const toggle = page.getByRole("button", {
        name: mode === "grid" ? "Show grid" : "Show list",
        exact: true,
      });
      if (await toggle.isVisible()) await toggle.click();
      const main = page.getByRole("button", {
        name: `View ${name}`,
        exact: true,
      });
      const card = main.locator("..");
      const action = card.locator(".card-bottom button");
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await action.evaluate((el: HTMLElement) => el.blur());
      const before = (await card.boundingBox())!;
      const actionBefore = await action.boundingBox();
      const normal = await surface(card);
      expect(normal.borders).toEqual([
        name === "Both" ? "3px" : name === "Expired" ? "4px" : "1px",
        "1px",
        "1px",
        "1px",
      ]);
      const colors = await card.evaluate((el) => {
        const probe = document.createElement("div");
        el.appendChild(probe);
        const result = ["--border", "--upcoming-ink", "--passed-ink"].map(
          (variable) => {
            probe.style.color = `var(${variable})`;
            return getComputedStyle(probe).color;
          },
        );
        probe.remove();
        return result;
      });
      expect(normal.colors).toEqual([
        name === "Both"
          ? colors[1]
          : name === "Expired"
            ? colors[2]
            : colors[0],
        colors[0],
        colors[0],
        colors[0],
      ]);
      const capture = async (state: string) => {
        const box = (await card.boundingBox())!;
        await page.screenshot({
          animations: "disabled",
          clip: {
            x: box.x - 7,
            y: box.y - 7,
            width: box.width + 14,
            height: box.height + 14,
          },
          path: `test-results/correction-${mode}-${name}-${state}.png`,
        });
      };
      await capture("normal");
      await main.hover();
      await expect.poll(() => surface(card)).toEqual(normal);
      expect(await card.boundingBox()).toEqual(before);
      await capture("body-hover");
      await action.hover();
      await expect(action).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect.poll(() => surface(card)).toEqual(normal);
      expect(await card.boundingBox()).toEqual(before);
      expect(await action.boundingBox()).toEqual(actionBefore);
      await capture("action-hover");
      await page.mouse.move(0, 0);
      await page.keyboard.press("Tab");
      await main.focus();
      await expect(card).toHaveCSS("outline-style", "solid");
      expect(await surface(card)).toEqual(normal);
      expect(await card.boundingBox()).toEqual(before);
      await capture("body-focus");
      await page.keyboard.press("Tab");
      await expect(action).toBeFocused();
      await expect(action).toHaveCSS("outline-style", "solid");
      expect(await surface(card)).toEqual(normal);
      expect(await action.boundingBox()).toEqual(actionBefore);
      await capture("action-focus");
    }
  }
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const tab = await touch.newPage();
  await tab.goto("/");
  await tab.getByRole("button", { name: "Try demo", exact: true }).click();
  const card = tab.locator(".item-card").first();
  const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  await card.locator(".card-main").tap();
  await tab.locator('.detail [data-slot="dialog-close"]').click();
  await expect(card).toHaveCSS("background-color", bg);
  expect(
    await tab.evaluate(
      () => matchMedia("(hover: hover) and (pointer: fine)").matches,
    ),
  ).toBe(false);
  await touch.close();
});

test("conditional green metadata and aligned active/history actions in Grid, List and narrow viewports", async ({
  page,
}) => {
  await seed(page);
  await page.addStyleTag({
    content:
      ".until-actions-menu { animation: none !important; transition: none !important; }",
  });
  for (const [width, height] of [
    [1440, 844],
    [390, 844],
    [375, 667],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      (width) =>
        document.documentElement.style.setProperty(
          "--safe-bottom",
          width <= 760 ? "34px" : "0px",
        ),
      width,
    );
    await view(page, "All", width);
    for (const mode of ["grid", "list"]) {
      const toggle = page.getByRole("button", {
        name: mode === "grid" ? "Show grid" : "Show list",
        exact: true,
      });
      if (await toggle.isVisible()) await toggle.click();
      for (const [name, text, count] of [
        ["Both", "Supplements · Pantry", 1],
        [
          "Long labels",
          "Supplements and everyday nutritional essentials · Upper pantry shelf beside the kitchen cabinet",
          1,
        ],
        ["Category only", "Food", 0],
        ["Location only", "Pantry", 0],
        ["Neither", "Unclassified", 0],
      ] as const) {
        const main = page.getByRole("button", {
          name: `View ${name}`,
          exact: true,
        });
        const meta = main.locator(".item-metadata");
        await expect(meta).toHaveText(text);
        await expect(meta.locator(".metadata-separator")).toHaveCount(count);
        if (count)
          await expect(meta.locator(".metadata-separator")).toHaveCSS(
            "background-color",
            "rgb(111, 134, 46)",
          );
        const card = main.locator("..");
        if (count) {
          const dot = meta.locator(".metadata-separator");
          await expect(dot).toHaveCSS("border-radius", "50%");
          const circle = (await dot.boundingBox())!;
          expect(circle.width).toBeCloseTo(circle.height, 1);
          expect(circle.width).toBeGreaterThanOrEqual(3);
        }
        expect(
          await meta.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await card.screenshot({
          animations: "disabled",
          path: `test-results/correction-metadata-${width}-${mode}-${name.replaceAll(" ", "-")}.png`,
        });
        await main.click();
        const description = page.locator(
          '.detail [data-slot="dialog-description"]',
        );
        await expect(description.locator(".metadata-separator")).toHaveCount(
          count,
        );
        await page.locator('.detail [data-slot="dialog-close"]').click();
      }
    }
    for (const name of ["Both", "Opened", "Expired", "History"]) {
      await view(page, name === "History" ? "History" : "All", width);
      await page
        .getByRole("button", { name: `View ${name}`, exact: true })
        .click();
      const detail = page.locator(".detail");
      const buttons = detail.locator(".detail-actions > button");
      if (width === 320 && name === "Opened") {
        // Exercise wrapped English labels without changing product copy.
        await buttons.nth(1).evaluate((el) => {
          const label = Array.from(el.childNodes).find(
            (n) => n.nodeType === Node.TEXT_NODE,
          );
          if (label) label.textContent = " Discard one unopened unit";
        });
      }
      await buttons.last().scrollIntoViewIfNeeded();
      const boxes = await buttons.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        }),
      );
      if (width <= 760) {
        if (name !== "History") {
          expect(boxes[0].y).toBeLessThan(boxes[1].y);
          expect(boxes[0].x).toBeCloseTo(boxes[1].x, 0);
          expect(boxes[0].right).toBeCloseTo(boxes[2].right, 0);
        }
        const secondary = boxes[name === "History" ? 0 : 1],
          more = boxes.at(-1)!;
        expect(secondary.y).toBeCloseTo(more.y, 0);
        expect(secondary.h).toBeCloseTo(more.h, 0);
        expect(more.bottom).toBeLessThanOrEqual(height - 34 - 12);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await detail.screenshot({
        animations: "disabled",
        path: `test-results/v17-detail-${width}-${name}.png`,
      });
      await detail.getByRole("button", { name: "More", exact: true }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toHaveCSS("animation-name", "none");
      const m = (await menu.boundingBox())!,
        trigger = (await detail
          .locator(".actions-menu-trigger")
          .boundingBox())!;
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(width);
      expect(m.y + m.height).toBeLessThanOrEqual(height);
      expect(
        m.y + m.height <= trigger.y || m.y >= trigger.y + trigger.height,
      ).toBe(true);
      await page.screenshot({
        animations: "disabled",
        path: `test-results/v17-menu-${width}-${name}.png`,
      });
      await page.keyboard.press("Escape");
      await detail.locator('[data-slot="dialog-close"]').click();
    }
  }
});

test("served v7 icons sit between the v5 and v6 artwork at every size and bypass cached old URLs", async ({
  page,
}) => {
  await page.goto("/");
  const hrefs = await page
    .locator('link[rel="icon"],link[rel="apple-touch-icon"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
  const manifest = await (
    await page.request.get("/manifest.webmanifest?v=7")
  ).json();
  const urls = [
    ...hrefs.filter((h) => h.endsWith(".png")),
    ...manifest.icons.map((i: { src: string }) => i.src),
  ];
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const oldBytes = await (
    await page.request.get("/icons/apple-touch-icon-v5.png")
  ).body();
  await page.evaluate(async (bytes) => {
    const cache = await caches.open("until-legacy-icons");
    await cache.put(
      "/icons/apple-touch-icon-v5.png",
      new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": "image/png" },
      }),
    );
    await cache.put("/favicon.svg?v=5", new Response("legacy-favicon"));
  }, Array.from(oldBytes));
  const cachedOld = Buffer.from(
    await page.evaluate(async () =>
      Array.from(
        new Uint8Array(
          await (await fetch("/icons/apple-touch-icon-v5.png")).arrayBuffer(),
        ),
      ),
    ),
  );
  expect(cachedOld).toEqual(oldBytes);
  for (const url of urls) {
    expect(url).toContain("-v7.png");
    const bytes = Buffer.from(
      await page.evaluate(
        async (url) =>
          Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
        url,
      ),
    );
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bounds = async (input: Buffer) => {
      const { data, info } = await sharp(input)
        .resize(infoWidth, infoWidth)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let top = info.height,
        bottom = 0;
      for (let y = 0; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels;
          if (data[i] < 100 && data[i + 1] < 130) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      return (top + bottom) / 2;
    };
    const infoWidth = info.width;
    const low = await bounds(
      await (await page.request.get("/icons/icon-512-v5.png")).body(),
    );
    const high = await bounds(
      await (await page.request.get("/icons/icon-512-v6.png")).body(),
    );
    const current = await bounds(bytes);
    expect(current).toBeGreaterThanOrEqual(high);
    expect(current).toBeLessThanOrEqual(low);
    expect(Math.abs(current - (low + high) / 2)).toBeLessThanOrEqual(1);
    expect(Array.from(data.subarray(0, 3))).toEqual([227, 235, 197]);
    const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
    expect(
      pixels.every((value, index) => index % 4 !== 3 || value === 255),
    ).toBe(true);
  }
  const root = await page.request.get("/apple-touch-icon.png");
  const apple = await page.request.get("/icons/apple-touch-icon-v7.png");
  expect(await root.body()).toEqual(await apple.body());
  expect(await apple.body()).not.toEqual(oldBytes);
  await page.context().setOffline(true);
  const offline = Buffer.from(
    await page.evaluate(async () =>
      Array.from(
        new Uint8Array(
          await (await fetch("/icons/apple-touch-icon-v7.png")).arrayBuffer(),
        ),
      ),
    ),
  );
  expect(offline).toEqual(await apple.body());
  await page.context().setOffline(false);
});

test("capture exported Home Screen and browser-tab icons at their displayed sizes", async ({
  page,
}) => {
  await page.goto("/");
  await page.setViewportSize({ width: 720, height: 560 });
  await page.setContent(`<!doctype html><html lang="en"><style>
    body { margin: 32px; font: 14px system-ui; background: #f3f2eb; color: #29372c; }
    section { display: flex; align-items: end; gap: 30px; margin: 20px 0 36px; }
    figure { margin: 0; text-align: center; } figcaption { margin-top: 12px; }
    .home { width: 60px; height: 60px; border-radius: 22%; }
    </style><h2>Home Screen · 60px</h2><section>
    ${[5, 6, 7].map((v) => `<figure><img class="home" src="/icons/apple-touch-icon-v${v}.png"><figcaption>v${v}</figcaption></figure>`).join("")}
    <figure><img class="home" src="/icons/icon-192-v7.png"><figcaption>PWA 192</figcaption></figure>
    <figure><img class="home" src="/icons/icon-512-v7.png"><figcaption>PWA 512</figcaption></figure>
    </section><h2>Browser tab · 16px / 32px</h2><section>
    ${[16, 32].flatMap((size) => [6, 7].map((v) => `<figure><img width="${size}" height="${size}" src="/favicon-${size}-v${v}.png"><figcaption>v${v} · ${size}px</figcaption></figure>`)).join("")}
    <figure><img width="16" height="16" src="/favicon-v7.svg"><figcaption>SVG · 16px</figcaption></figure>
    </section></html>`);
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every(
            (img) =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/correction-icon-sizes.png" });
});
