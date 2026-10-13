import {test,expect,type Page} from '@playwright/test';

async function issue(page:Page,reason=''){
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  if(reason)await page.getByLabel('指挥意图（选填）').fill(reason);
  await page.getByRole('button',{name:'下达记录任务',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.locator('.team-task')).toContainText('记录任务已登记');
}

test('CR06 signed command and literal original reason replace the disabled form and remain readable in history',async({page})=>{
  const reason='先记录原件 <script>不执行</script>，保留这个原始理由。';
  await issue(page,reason);
  await expect(page.getByRole('heading',{name:'已签发任务',exact:true})).toBeVisible();
  await expect(page.getByTestId('frozen-command')).toContainText(reason);
  await expect(page.getByLabel('目的地')).toHaveCount(0);
  await page.getByLabel('推进至秒').fill('47');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock')).toContainText('任务完成');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('回看时刻（秒）').fill('0');await page.getByRole('button',{name:'查看当时情况',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();
  await expect(page.getByTestId('frozen-command')).toContainText(reason);
  await expect(page.getByTestId('frozen-command').locator('script')).toHaveCount(0);
});

test('CR06 omitted reason is shown as unfilled, without inventing an intent',async({page})=>{
  await issue(page);await expect(page.getByTestId('frozen-command')).toContainText('未填写');await expect(page.getByLabel('指挥意图（选填）')).toHaveCount(0);
});

test('CR04 opening and reading a record detail keeps the command clock running',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.locator('.log-lines > div').first().getByRole('button',{name:'凭证详情',exact:true}).click();await expect(page.getByRole('dialog',{name:'记录详情'})).toBeVisible();
  const at=await page.locator('.clock strong').innerText();await expect.poll(()=>page.locator('.clock strong').innerText()).not.toBe(at);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
});

test('CR04 sent detail names the actual send time and full result text stays available',async({page})=>{
  await issue(page);await page.getByRole('button',{name:'态势地图',exact:true}).click();await page.getByLabel('推进至秒').fill('0.001');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:00.001');
  await page.locator('.log-lines > div').first().getByRole('button',{name:'凭证详情',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'记录详情'})).toContainText('总部发送时间');await page.keyboard.press('Escape');
  await page.getByLabel('推进至秒').fill('47');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock')).toContainText('任务完成');
  await page.locator('.log-lines > div').first().getByRole('button',{name:'凭证详情',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'记录详情'})).toContainText('原始记录全文');await expect(page.getByRole('dialog',{name:'记录详情'})).toContainText('成果 artifact-');
});

test('CR05 Move page exposes key and complete nodes, including two commits at the same time',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByLabel('演练任务').selectOption('FB01-ENG-MOVE');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.locator('.team-task')).toContainText('命令已登记');
  await page.getByLabel('推进至秒').fill('1.5');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:01.500');
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await expect(page.getByLabel('回看节点').locator('option')).toHaveCount(4);await page.getByLabel('展开完整提交记录').check();await expect(page.getByLabel('回看节点').locator('option')).toHaveCount(5);
  for(const revision of ['3','4']){await page.getByLabel('回看节点').selectOption(revision);await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:01.500');await expect(page.getByText(`正在查看记录 ${revision}。`,{exact:true})).toBeVisible();await expect(page.getByTestId('position')).toContainText('50.00');}
});

for(const size of [{width:1366,height:768},{width:1920,height:1080}])test(`CR04 record credentials fit their row and full detail is keyboard reachable at ${size.width}`,async({page},testInfo)=>{
  await page.setViewportSize(size);await issue(page);
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await page.getByLabel('推进至秒').fill('7');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:07');
  const rows=page.locator('.log-lines > div');
  for(const row of await rows.all()){
    const box=await row.boundingBox();
    for(const item of await row.locator('time,span,p,small,button').all()){
      const bounds=await item.boundingBox();if(bounds&&box){expect(bounds.y).toBeGreaterThanOrEqual(box.y);expect(bounds.y+bounds.height).toBeLessThanOrEqual(box.y+box.height+1);}
    }
  }
  await page.screenshot({path:testInfo.outputPath('record-rows.png')});
  const detail=rows.first().getByRole('button',{name:'凭证详情',exact:true});await detail.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'记录详情'});await expect(dialog).toBeVisible();await expect(dialog).toContainText('本次记录任务');await expect(dialog).toContainText('观察时间');await expect(dialog).toContainText('00:06');await expect(dialog).toContainText('总部收到');await expect(dialog).toContainText('00:07');
  await page.screenshot({path:testInfo.outputPath('record-detail.png')});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(detail).toBeFocused();
});

test('CR05 key records omit quiet advances while full navigation preserves same-time commits',async({page})=>{
  await page.goto('/');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByLabel('推进至秒').fill('0.1');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:00.100');
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看记录预案',exact:true}).click();await page.getByRole('button',{name:'下达记录任务',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.locator('.team-task')).toContainText('记录任务已登记');
  for(const to of ['1','1.5']){await page.getByLabel('推进至秒').fill(to);await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText(to==='1'?'00:01':'00:01.500');}
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();
  await expect(page.getByLabel('回看节点').locator('option')).toHaveCount(5);
  await page.getByLabel('展开完整提交记录').check();await expect(page.getByLabel('回看节点').locator('option')).toHaveCount(7);
  await page.getByLabel('回看节点').selectOption('5');await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:01.500');await expect(page.getByText('正在查看记录 5。',{exact:true})).toBeVisible();
  await page.getByLabel('回看节点').selectOption('6');await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:01.500');await expect(page.getByText('正在查看记录 6。',{exact:true})).toBeVisible();
});
