import {test,expect} from '@playwright/test';

test('CR07/08/09/10 the explicit preparation scene supports one N-to-T replacement through real Worker and public reports',async({page},testInfo)=>{
  await page.goto('/');await expect(page.getByLabel('演练任务').locator('option[value="ENG-PRESTART-REPLACE"]')).toHaveCount(1);
  await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'定位近联络点N',exact:true}).click();await expect(page.locator('.inspector .facts')).toContainText('110.00, 150.00');
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await expect(page.locator('.plan')).toContainText('R → N');
  await page.screenshot({path:testInfo.outputPath('original-N.png'),fullPage:true});
  await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command')).toContainText('近联络点 N');
  await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
  await page.getByRole('button',{name:'请求改到T',exact:true}).click();await expect(page.locator('.plan')).toContainText('R → T');
  await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
  await page.getByLabel('推进至秒').fill('4');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:04');await expect(page.locator('.task-aside')).toContainText('替代已确认');
  await page.screenshot({path:testInfo.outputPath('replacement-confirmed.png'),fullPage:true});
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await page.getByLabel('推进至秒').fill('21.9');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:21.900');await expect(page.getByTestId('position')).toContainText('87.74');
  await page.screenshot({path:testInfo.outputPath('old-event-skipped.png'),fullPage:true});
  await page.getByLabel('推进至秒').fill('120');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:40.800');await expect(page.locator('.clock')).toContainText('任务完成');await expect(page.getByTestId('position')).toContainText('170.00');await expect(page.locator('.inspector')).toContainText('行进储备 18 / 20');
  await page.screenshot({path:testInfo.outputPath('replacement-completed.png'),fullPage:true});
});
