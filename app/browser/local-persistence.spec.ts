import {test,expect} from '@playwright/test';

test('PC02/PC11 the recent-run entry explains latest progress rather than a fixed manual save point',async({page})=>{
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByLabel('推进至秒').fill('7');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:07');
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('已保存至 00:07');
  await page.getByLabel('推进至秒').fill('9');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:09');
  await page.getByRole('button',{name:'更换演练',exact:true}).click();
  await expect(page.getByRole('button',{name:'接手这场演练',exact:true})).toBeVisible();
  await expect(page.getByText(/最新进度.*手动保存/)).toBeVisible();
  await page.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:09');
  await expect(page.locator('.clock')).toContainText('已暂停');
});

test('PC11 saving from task scheduling announces the committed result without switching to the map',async({page})=>{
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();
  await page.getByRole('button',{name:'保存记录',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'任务调度',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('已保存至 00:00');
});
