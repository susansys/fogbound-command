import {test,expect} from '@playwright/test';
test('player pages use plain Chinese instead of project IDs, internal field names and raw error codes',async({page,context})=>{
  const internal=/FB01|T0[1-7]|PlayerView|World|Seam|revision|commit|Report|Delivery|energy|wear|\bms\b|WRITER_BUSY|CHANNEL_UNCERTAIN|STORAGE_UNCONFIRMED|OPERATION_CONFLICT/;
  await page.goto('/');expect(await page.locator('body').innerText()).not.toMatch(internal);
  await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByTestId('position')).toBeVisible();expect(await page.locator('body').innerText()).not.toMatch(internal);
  for(const name of ['任务调度','情报中心','指挥记录','行动复盘','态势地图']){await page.getByRole('button',{name,exact:true}).click();expect(await page.locator('body').innerText()).not.toMatch(internal);}
  await page.getByRole('button',{name:'重开行动',exact:true}).click();expect(await page.locator('dialog').innerText()).not.toMatch(internal);await page.getByRole('button',{name:'保留当前行动',exact:true}).click();
  const other=await context.newPage();await other.goto('/');await other.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await other.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(other.getByRole('alert')).toBeVisible();expect(await other.locator('body').innerText()).not.toMatch(internal);
});
