import {test,expect} from '@playwright/test';

test('B23 target, public deadline and late-work warning stay readable without treating receipt grace as work time',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const target=page.getByTestId('intelligence-target');await expect(target).toContainText('本批目标');await expect(target).toContainText('实体截止15:00');await expect(target).toContainText('截止后10秒只接收既有回报');
  await page.getByRole('button',{name:'下达R前往A',exact:true}).press('Enter');
  const advance=async(time:string,clock:string)=>{await page.getByLabel('推进到时刻（秒）').fill(time);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.locator('.clock strong')).toHaveText(clock);};
  await advance('32','00:32');await advance('854.001','14:14.001');
  await expect(page.getByRole('button',{name:'下达A处记录',exact:true})).toBeEnabled();await expect(page.getByTestId('intelligence-field')).toContainText('晚于实体截止1毫秒');
  await page.getByRole('button',{name:'下达A处记录',exact:true}).press('Enter');await advance('900','15:00');await expect(target).toContainText('A：等待成果回报');await expect(page.getByTestId('intelligence-artifacts')).not.toContainText('回报称现场已生成');
  await advance('901','15:01');await expect(page.getByTestId('intelligence-field')).toContainText('截止回报已收到');await expect(target).toContainText('A：等待成果回报');await expect(page.getByRole('alert')).toHaveCount(0);
});
