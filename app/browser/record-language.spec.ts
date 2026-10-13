import {expect,test} from '@playwright/test';

test('Record pages describe only received task state, with readable times and senders',async({page})=>{
  const internal=/\bms\b|artifact-|\.accept\.0|\.record\.0|\.complete\.0/;
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();
  await expect(page.locator('.task-aside')).toContainText('尚未下达');
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await page.getByRole('button',{name:'下达记录任务',exact:true}).click();
  await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.locator('.task-aside')).toContainText('记录任务已登记');
  await expect(page.locator('.task-aside')).not.toContainText('尚未下达');
  await expect(page.locator('.bottom-log')).toContainText('总部指挥席');
  for(const [at,state] of [['2','已接令'],['6','已接令'],['7','开始记录'],['46','开始记录'],['47','记录成果回报']]){
    await page.getByLabel('推进至秒').fill(at);
    await page.getByRole('button',{name:'推进时间',exact:true}).click();
    await expect(page.locator('.clock strong')).toHaveText(`00:${at.padStart(2,'0')}`);
    await expect(page.locator('.task-aside')).toContainText(state);
    for(const name of ['态势地图','情报中心','指挥记录','行动复盘','任务调度']){
      await page.getByRole('button',{name,exact:true}).click();
      expect(await page.locator('body').innerText()).not.toMatch(internal);
    }
    await expect(page.locator('.inspector')).not.toContainText('抵达');
  }
});

test('Record replay selects confirmed registration and subsequent advance nodes without changing the live run',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await page.getByRole('button',{name:'下达记录任务',exact:true}).click();
  await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.locator('.task-aside')).toContainText('记录任务已登记');
  await page.getByLabel('推进至秒').fill('0.999');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00.999');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();
  await page.getByLabel('回看节点').selectOption('2');
  await page.getByRole('button',{name:'查看当时情况',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00');
  await expect(page.locator('.inspector')).toContainText('总部电量 16 / 16');
  await expect(page.locator('.bottom-log')).not.toContainText('总部已发送');
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00.999');
  await page.getByLabel('回看节点').selectOption('3');
  await page.getByRole('button',{name:'查看当时情况',exact:true}).click();
  await expect(page.locator('.inspector')).toContainText('总部电量 15 / 16');
  await expect(page.locator('.bottom-log')).toContainText('总部已发送');
});

test('FB02-S15 command Record reading, intent editing and confirmation continue the actual clock',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'情报中心',exact:true}).click();
  const read=await page.locator('.clock strong').innerText();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(read);
  await page.getByRole('button',{name:'拟定记录任务',exact:true}).click();
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await page.getByLabel('指挥意图（选填）').fill('收到成果回报后核对记录');
  const editing=await page.locator('.clock strong').innerText();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(editing);
  await page.getByRole('button',{name:'下达记录任务',exact:true}).click();
  const confirming=await page.locator('.clock strong').innerText();
  await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(confirming);
  await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.locator('.bottom-log')).toContainText('记录任务');
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();
});
