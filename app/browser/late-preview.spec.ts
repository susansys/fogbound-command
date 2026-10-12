import { test, expect } from "@playwright/test";
type Hooks = { hold: boolean; deliver: (() => void) | null };
test("cancelled preview discards a late Transport failure and preserves editable reason", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const hooks: Hooks = { hold: false, deliver: null };
    (window as unknown as { latePreview: Hooks }).latePreview = hooks;
    const Native = window.Worker;
    window.Worker = new Proxy(Native, {
      construct(Target, args) {
        const worker = Reflect.construct(Target, args) as Worker;
        return new Proxy(worker, {
          get(target, key) {
            const value = Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, key, value) {
            if (key === "onmessage") {
              const listener = value as (event: MessageEvent) => void;
              target.onmessage = (event: MessageEvent) => {
                if (hooks.hold && event.data.plan) {
                  hooks.hold = false;
                  hooks.deliver = () =>
                    listener(
                      new MessageEvent("message", {
                        data: {
                          request_id: event.data.request_id,
                          ok: false,
                          code: "STALE_REVISION",
                        },
                      }),
                    );
                } else listener(event);
              };
              return true;
            }
            return Reflect.set(target, key, value, target);
          },
        });
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("时间方式").selectOption("research");
  await page.getByRole("button", { name: "开始演练", exact: true }).click();
  await page.getByRole("button", { name: "定位联络点T", exact: true }).click();
  await page.getByRole("button", { name: "查看通行预案", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待下达预案" })).toBeVisible();
  await page.getByLabel("指挥意图（选填）").fill("仍保留理由");
  await page.evaluate(() => {
    (window as unknown as { latePreview: Hooks }).latePreview.hold = true;
  });
  await page.getByRole("button", { name: "查看通行预案", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!(window as unknown as { latePreview: Hooks }).latePreview.deliver,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "取消预案", exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { latePreview: Hooks }).latePreview.deliver!();
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看通行预案", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "查看通行预案", exact: true }).click();
  await expect(page.getByLabel("指挥意图（选填）")).toHaveValue("仍保留理由");
});
test("scrolling the legend and layer menu does not zoom the map", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("时间方式").selectOption("research");
  await page.getByRole("button", { name: "开始演练", exact: true }).click();
  const map = page.getByRole("region", { name: "公开态势地图" });
  await expect(map.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "图例 展开", exact: true }).click();
  await page.getByRole("button", { name: "地图图层", exact: true }).click();
  const before = await map.getAttribute("data-camera");
  for (const menu of [
    page.locator(".map-legend"),
    page.locator(".map-layers"),
  ]) {
    const box = await menu.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, 120);
    await expect(map).toHaveAttribute("data-camera", before!);
  }
});
