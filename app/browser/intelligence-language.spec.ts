import {test,expect} from '@playwright/test';

test('B23 HQ preparation and verification show their public deadline gap before a legal late attempt',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const advance=async(time:string,clock:string)=>{await page.getByLabel('推进到时刻（秒）').fill(time);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.locator('.clock strong')).toHaveText(clock);};
  await page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'提交准备申请',exact:true})).toBeEnabled();await advance('840.001','14:00.001');
  await expect(page.getByTestId('intelligence-plan')).toContainText('预计晚于实体截止1毫秒');await expect(page.getByRole('button',{name:'提交准备申请',exact:true})).toBeEnabled();
  await advance('880.001','14:40.001');const source=page.getByTestId('intelligence-source-R3');await expect(source).toContainText('预计晚于实体截止1毫秒');await expect(source.getByRole('button',{name:'请求核实这份原文',exact:true})).toBeEnabled();
  await source.getByRole('button',{name:'请求核实这份原文',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-processing')).toContainText('核实中');await expect(page.getByRole('alert')).toHaveCount(0);
});

test('B23 intelligence marker retains the approved demo natural symbol size',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const marker=page.locator('.unit-marker[data-marker="R"]');await expect(marker).toBeVisible();const box=await marker.boundingBox();expect(Math.abs(box!.width-53.4375)).toBeLessThanOrEqual(1);expect(Math.abs(box!.height-38)).toBeLessThanOrEqual(1);
});

test('B23 target, public deadline and late-work warning stay readable without treating receipt grace as work time',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await expect(page.locator('main.start')).toContainText('R、W两支编组');await expect(page.locator('main.start')).not.toContainText('只指挥一支编组');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const target=page.getByTestId('intelligence-target');await expect(target).toContainText('本批目标');await expect(target).toContainText('实体截止15:00');await expect(target).toContainText('截止后10秒只接收既有回报');
  await page.getByRole('button',{name:'下达R前往A',exact:true}).press('Enter');
  const advance=async(time:string,clock:string)=>{await page.getByLabel('推进到时刻（秒）').fill(time);const button=page.getByRole('button',{name:'推进到该时刻',exact:true});await expect(button).toBeEnabled();await button.press('Enter');await expect(page.locator('.clock strong')).toHaveText(clock);};
  await advance('32','00:32');await advance('854.001','14:14.001');
  await expect(page.getByRole('button',{name:'下达A处记录',exact:true})).toBeEnabled();await expect(page.getByTestId('intelligence-field')).toContainText('晚于实体截止1毫秒');
  await page.getByRole('button',{name:'下达A处记录',exact:true}).press('Enter');await advance('900','15:00');await expect(target).toContainText('A：等待成果回报');await expect(page.getByTestId('intelligence-artifacts')).not.toContainText('回报称现场已生成');
  await advance('901','15:01');await expect(page.getByTestId('intelligence-field')).toContainText('截止回报已收到');await expect(target).toContainText('A：等待成果回报');await expect(page.getByRole('alert')).toHaveCount(0);
});
