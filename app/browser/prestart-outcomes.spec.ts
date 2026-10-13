import {test,expect} from '@playwright/test';

test('CR13 a selected fixed message condition queues the request and keeps the original completion visible while awaiting refusal',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');
  await page.getByLabel('消息条件').selectOption('hq_short_outage');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();
  await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command')).toContainText('近联络点 N');
  await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
  await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
  await page.getByLabel('推进至秒').fill('22.9');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:22.900');
  await expect(page.locator('.task-aside')).toContainText('等待指令结果与收尾回报');await expect(page.locator('.clock')).not.toContainText('任务完成');
  await page.getByLabel('推进至秒').fill('24');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:24');
  await expect(page.locator('.clock')).toContainText('任务完成');await page.getByRole('button',{name:'指挥记录',exact:true}).click();await expect(page.locator('.content-view')).toContainText('原任务继续');
});

test('CR15 a scene without received terminal reports ends at the public limit without claiming a received deadline report',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');
  await page.getByLabel('消息条件').selectOption('reports_unconfirmed');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();
  await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command')).toContainText('近联络点 N');
  await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
  await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
  await page.getByLabel('推进至秒').fill('610');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('10:10');
  await expect(page.locator('.task-aside')).not.toContainText('已收到截止回报');await expect(page.locator('.task-aside')).toContainText('公开行动窗口已结束');
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await expect(page.getByTestId('position')).toContainText('50.00');
});

for(const [case_ref,to,expected] of [['hq_expiry_outage','122','未发送且已过期'],['hq_result_unconfirmed','142.9','替代结果未确认']] as const){
  test(`CR14/15 ${case_ref} keeps the visible control outcome distinct from the original completed N task`,async({page},testInfo)=>{
    await page.goto('/');await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');
    await page.getByLabel('消息条件').selectOption(case_ref);await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
    await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();
    await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command')).toContainText('近联络点 N');
    await page.getByLabel('推进至秒').fill('2');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');
    await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
    await page.getByLabel('推进至秒').fill(to);await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.task-aside')).toContainText(expected);await expect(page.locator('.clock')).toContainText('任务完成');
    await page.getByRole('button',{name:'态势地图',exact:true}).click();await expect(page.getByTestId('position')).toContainText('110.00');
    await page.screenshot({path:testInfo.outputPath('completed-N-control-outcome.png'),fullPage:true});
  });
}
