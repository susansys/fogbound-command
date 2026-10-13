import { test, expect } from "@playwright/test";
test("S03 map/report selection, marker drag, anchored zoom and cancelled preview keep known state", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByLabel("时间方式").selectOption("research");
  await page.getByRole("button", { name: "开始演练", exact: true }).click();
  const map = page.getByRole("region", { name: "公开态势地图" });
  await expect(
    page.getByRole("button", { name: "联络点T", exact: true }),
  ).toBeVisible();
  await map.focus();
  await page.keyboard.press("t");
  await page.getByRole("button", { name: "查看通行预案", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待下达预案" })).toBeVisible();
  await page.getByLabel("指挥意图（选填）").fill("保留未签草案");
  const marker = await page
    .getByRole("button", { name: "编组R最后确认位置", exact: true })
    .boundingBox();
  expect(marker).not.toBeNull();
  await page.mouse.move(marker!.x + 18, marker!.y + 18);
  await page.mouse.down();
  await page.mouse.move(marker!.x + 45, marker!.y + 35);
  await page.mouse.up();
  await expect(page.getByText("当前选择：T", { exact: true })).toBeVisible();
  await expect(page.getByLabel("指挥意图（选填）")).toHaveValue("保留未签草案");
  await page.mouse.move(marker!.x + 18, marker!.y + 18);
  await page.mouse.down();
  await map.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(page.getByText("当前选择：T", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-1366.png") });
  const rect = await map.boundingBox();
  const camera = (await map.getAttribute("data-camera"))!
    .split(",")
    .map(Number);
  const anchor = { x: rect!.width * 0.45, y: rect!.height * 0.45 };
  const before = [
    (anchor.x - camera[0]) / camera[2],
    (anchor.y - camera[1]) / camera[2],
  ];
  await page.mouse.move(rect!.x + anchor.x, rect!.y + anchor.y);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(() => map.getAttribute("data-camera"))
    .not.toBe(camera.join(","));
  const after = (await map.getAttribute("data-camera"))!.split(",").map(Number);
  expect(Math.abs((anchor.x - after[0]) / after[2] - before[0])).toBeLessThan(
    0.1,
  );
  expect(Math.abs((anchor.y - after[1]) / after[2] - before[1])).toBeLessThan(
    0.1,
  );
  await page.getByRole("button", { name: "取消预案", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待下达预案" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("position")).toHaveText("50.00, 150.00");
  await page.getByRole("button", { name: "查看原件", exact: true }).click();
  await page
    .getByRole("button", { name: "定位联络点T", exact: true })
    .first()
    .click();
  await expect(map).toBeVisible();
  await page.getByRole("button", { name: "图例 展开", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "起点H", exact: true }),
  ).toBeVisible();
});
test("S03 large viewport and doubled text retain reachable controls and distinct co-located labels", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByLabel("时间方式").selectOption("research");
  await page.getByRole("button", { name: "开始演练", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "公开态势地图" }).locator("canvas"),
  ).toHaveCount(1);
  const h = await page
      .getByRole("button", { name: "起点H", exact: true })
      .boundingBox(),
    r = await page
      .getByRole("button", { name: "编组R最后确认位置", exact: true })
      .boundingBox();
  expect(h!.y + h!.height).toBeLessThan(r!.y);
  await page.screenshot({ path: testInfo.outputPath("map-1920.png") });
  // A text-only accessibility probe: double every element's existing computed font size.
  // This is deliberately recorded separately from browser/page zoom or DPR.
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("*"));
    const sizes = elements.map((e) => parseFloat(getComputedStyle(e).fontSize));
    elements.forEach((e, i) => {
      if (Number.isFinite(sizes[i])) e.style.fontSize = `${sizes[i] * 2}px`;
    });
  });
  await page.getByRole("button", { name: "定位联络点T", exact: true }).click();
  await page.getByRole("button", { name: "查看通行预案", exact: true }).click();
  await expect(page.getByRole("heading", { name: "待下达预案" })).toBeVisible();
  await page.getByRole("button", { name: "取消预案", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("text-double-1920.png") });
});
