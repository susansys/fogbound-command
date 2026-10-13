import {test,expect} from '@playwright/test';

test('CR01 selected public place has its own coordinates and labels the associated team separately',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位联络点T',exact:true}).click();
  await expect(page.locator('.inspector .facts')).toContainText('地点坐标');
  await expect(page.locator('.inspector .facts')).toContainText('170.00, 150.00');
  await expect(page.locator('.inspector')).toContainText('关联编组 R');
  await expect(page.getByTestId('position')).toContainText('50.00, 150.00');
});

test('CR02 a historical view never carries the later current-operation notification',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位联络点T',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.getByText('命令已登记，尚未收到编组接令回报',{exact:true})).toBeVisible();
  await page.getByLabel('推进至秒').fill('33.8');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock')).toContainText('任务完成');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('回看时刻（秒）').fill('7');await page.getByRole('button',{name:'查看当时情况',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:07');
  await expect(page.locator('.inspector [role="status"]')).toHaveCount(0);
  await expect(page.getByTestId('position')).toContainText('68.87');
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.locator('.clock')).toContainText('任务完成');await expect(page.getByTestId('position')).toContainText('170.00');
});
