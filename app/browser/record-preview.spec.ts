import {test,expect} from '@playwright/test';

test('FB02-S03 reads the archive original, previews and cancels a fixed-station draft without starting work',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'查看原件',exact:true}).click();
  await expect(page.locator('.report-detail')).toContainText('档案 A');
  await expect(page.locator('.report-detail')).toContainText('未知');
  await page.getByRole('button',{name:'拟定记录任务',exact:true}).click();
  await expect(page.getByLabel('目的地',{exact:true})).toHaveValue('工位 H · 档案 A');
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await expect(page.locator('.task-main')).toContainText('预计准备5秒、记录40秒');
  await page.getByLabel('指挥意图（选填）').fill('按档案登记内容记录，完成后回报');
  await page.getByRole('button',{name:'取消预案',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00');
  await expect(page.locator('.task-aside')).toContainText('尚未下达');
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await expect(page.getByLabel('指挥意图（选填）')).toHaveValue('按档案登记内容记录，完成后回报');
  await expect(page.locator('.task-main')).not.toContainText('120 图上米');
});
