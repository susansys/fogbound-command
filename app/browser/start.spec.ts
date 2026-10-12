import { test, expect } from "@playwright/test";
test("S01 real Worker commits to IndexedDB and refuses a second live writer", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("开局模式").selectOption("research");
  await page.getByRole("button", { name: "开始工程局", exact: true }).click();
  await expect(page.getByText("源时点：未知", { exact: true })).toBeVisible();
  await expect(page.getByTestId("position")).toHaveText("50.00, 150.00");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "开始工程局", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText("WRITER_BUSY");
  await page.reload();
  await expect(page.getByText(/已保存工程局/)).toBeVisible();
});
test("malformed Worker input is rejected without killing the channel or accepting an identity override", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "开始工程局", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(1);
  const workerUrl = page.workers()[0].url();
  const replies = await page.evaluate(async (url) => {
    const worker = new Worker(url, { type: "module" });
    const ask = (input: unknown) =>
      new Promise<{ ok: boolean; code?: string }>((resolve) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.postMessage(input);
      });
    const one = await ask({
      request_id: "bad-1",
      kind: "create",
      mode: "research",
      operation_id: { forged: true },
    });
    const two = await ask({
      request_id: "bad-2",
      kind: "view",
      run_id: "anything",
      commander: "HQ",
    });
    const three = await ask(null);
    const four = await ask({ request_id: "list-1", kind: "list" });
    worker.terminate();
    return [one, two, three, four];
  }, workerUrl);
  expect(replies.slice(0, 3).map((x) => x.code)).toEqual([
    "INVALID_INPUT",
    "INVALID_INPUT",
    "INVALID_INPUT",
  ]);
  expect(replies[3].ok).toBe(true);
});
