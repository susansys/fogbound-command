import { test, expect } from "@playwright/test";
import type { Envelope, Receipt, PlayerView } from "../src/contracts";
type Capture = {
  worker: Worker | null;
  order: Envelope | null;
  replies: Array<{
    request_id: string;
    ok: boolean;
    receipt?: Receipt;
    view?: PlayerView;
  }>;
};
test("S04/S05/S07 real Worker movement, delayed completion, ledger and original-ID retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const capture: Capture = { worker: null, order: null, replies: [] };
    (window as unknown as { capture: Capture }).capture = capture;
    const Native = window.Worker;
    window.Worker = new Proxy(Native, {
      construct(Target, args) {
        const worker = Reflect.construct(Target, args) as Worker;
        capture.worker = worker;
        return new Proxy(worker, {
          get(target, key) {
            const value = Reflect.get(target, key, target);
            if (key === "postMessage")
              return (input: unknown) => {
                const message = input as { kind?: string; envelope?: Envelope };
                if (
                  message.kind === "operate" &&
                  message.envelope?.intent.kind === "issue"
                )
                  capture.order = structuredClone(message.envelope);
                target.postMessage(input);
              };
            return typeof value === "function" ? value.bind(target) : value;
          },
          set(target, key, value) {
            if (key === "onmessage") {
              target.onmessage = (event: MessageEvent) => {
                capture.replies.push(event.data);
                (value as (event: MessageEvent) => void)(event);
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
  await page.getByRole("button", { name: "下达通行命令", exact: true }).click();
  await page.getByRole("button", { name: "确认下达", exact: true }).click();
  await expect(
    page.getByText("命令已登记，尚未收到编组接令回报", { exact: true }),
  ).toBeVisible();
  const issuedReceipt = await page.evaluate(() => {
    const c = (window as unknown as { capture: Capture }).capture;
    return c.replies.find((x) => x.receipt?.kind === "issue")!.receipt!;
  });
  async function advance(to: number, clock: string) {
    await page.getByLabel("推进至秒").fill(String(to/1000));
    await page.getByRole("button", { name: "推进时间", exact: true }).click();
    await expect(page.locator(".clock strong")).toHaveText(clock);
  }
  await advance(1000, "00:01");
  await expect(
    page.getByText("命令已登记，尚未收到编组接令回报", { exact: true }),
  ).toBeVisible();
  await advance(2000, "00:02");
  await expect(
    page.getByText("编组已接令并开始行动，尚未收到抵达回报", { exact: true }),
  ).toBeVisible();
  await advance(7000, "00:07");
  await expect(page.getByTestId("position")).toHaveText("68.87, 150.00");
  await advance(32000, "00:32");
  await expect(page.getByTestId("position")).toHaveText("163.21, 150.00");
  await advance(32800, "00:32.800");
  await expect(page.getByText("任务完成", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("position")).toHaveText("163.21, 150.00");
  await advance(33800, "00:33.800");
  await expect(page.getByText("任务完成", { exact: true })).toBeVisible();
  await expect(page.getByTestId("position")).toHaveText("170.00, 150.00");
  await page.evaluate(() => {
    const c = (window as unknown as { capture: Capture }).capture;
    c.worker!.postMessage({
      kind: "operate",
      request_id: "original-retry",
      envelope: c.order,
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { capture: Capture }).capture.replies.some(
          (x) => x.request_id === "original-retry",
        ),
      ),
    )
    .toBe(true);
  const repeated = await page.evaluate(
    () =>
      (window as unknown as { capture: Capture }).capture.replies.find(
        (x) => x.request_id === "original-retry",
      )!,
  );
  expect(repeated.ok).toBe(true);
  expect(repeated.receipt).toEqual(issuedReceipt);
  expect(repeated.view?.resources).toMatchObject({
    equipment_energy: 8,
    equipment_wear: 92,
    movement_energy: 18,
  });
});
