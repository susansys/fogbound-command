import {test,expect} from '@playwright/test';
test('real browser reload resumes the latest same-run snapshot paused, then receives one completion with the baseline costs',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位联络点T',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByText('命令已登记，尚未收到编组接令回报',{exact:true})).toBeVisible();
  await page.getByLabel('推进至秒').fill('17');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:17');
  await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存至 00:17 · 记录序号');
  await page.getByLabel('推进至秒').fill('22');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:22');
  await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:22');await expect(page.locator('.clock')).toContainText('已暂停');await expect(page.getByTestId('position')).toHaveText('125.47, 150.00');
  await page.getByLabel('推进至秒').fill('33.8');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.getByText('任务完成',{exact:true})).toBeVisible();
  await expect(page.locator('.bottom-log').getByText(/抵达回报已收到/)).toHaveCount(1);await expect(page.getByTestId('position')).toHaveText('170.00, 150.00');await expect(page.getByText('联络器电量 8 / 16',{exact:false})).toBeVisible();
});
