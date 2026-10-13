import {test,expect} from '@playwright/test';
test('the central task workspace previews, cancels while preserving intent, explicitly issues, and returns to the legal map',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();await page.getByRole('button',{name:'拟定任务',exact:true}).click();
  await expect(page.getByRole('heading',{name:'派谁、去哪里、做什么',exact:true})).toBeVisible();await expect(page.getByLabel('编组',{exact:true})).toBeVisible();await expect(page.getByLabel('目的地',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await expect(page.getByRole('heading',{name:'待下达预案',exact:true})).toBeVisible();await page.getByLabel('指挥意图（选填）').fill('核对联络点，等待编组正式回报');
  await page.getByRole('button',{name:'取消预案',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:00');await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await expect(page.getByLabel('指挥意图（选填）')).toHaveValue('核对联络点，等待编组正式回报');
  await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.locator('.task-aside')).toContainText('命令已登记，尚未收到编组接令回报');await page.getByRole('button',{name:'返回态势地图',exact:true}).click();await expect(page.getByRole('region',{name:'公开态势地图'})).toBeVisible();await expect(page.getByTestId('position')).toHaveText('50.00, 150.00');
  await page.getByLabel('推进至秒').fill('33.8');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock')).toContainText('任务完成');
});
