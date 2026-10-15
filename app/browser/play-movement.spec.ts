import {test,expect} from '@playwright/test';

test.use({viewport:{width:1366,height:768},deviceScaleFactor:1});
test('PG10 real UI confirms a route, advances research time and changes HQ position only on received payload',async({page},info)=>{
  await page.addInitScript(()=>{const Native=window.Worker,requests:unknown[]=[],responses:unknown[]=[];class Observer extends Native{constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('/assets/worker-')){const post=this.postMessage.bind(this);this.postMessage=(value:unknown)=>{requests.push(structuredClone(value));post(value);};this.addEventListener('message',e=>responses.push(structuredClone(e.data)));}}}window.Worker=Observer;Object.assign(window,{__b21Movement:{requests,responses}});});
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});
  await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).click();
  await page.getByRole('button',{name:'下达移动任务',exact:true}).click();await expect(page.getByRole('dialog',{name:'确认移动任务'})).toContainText('接令和抵达须等待回报');
  await page.getByRole('button',{name:'确认并下达',exact:true}).click();await expect(page.getByTestId('movement-status')).toContainText('已签发，等待回执');
  await expect(page.getByTestId('issued-plan-line')).toBeVisible();await expect(page.getByText('已下达计划，不表示实际进度',{exact:true})).toBeVisible();
  for(const [seconds,status,position] of [['2','接令已知','50.00, 150.00'],['30.5','接令已知','50.00, 150.00'],['31.5','抵达已知','150.00, 150.00']]){
    await page.getByLabel('推进到时刻（秒）').fill(seconds);await page.getByRole('button',{name:'推进到该时刻',exact:true}).click();await expect(page.getByTestId('movement-status')).toContainText(status);await expect(page.getByTestId('scope-detail')).toContainText(position);
  }
  await expect(page.getByTestId('movement-status')).toContainText('移动抵达不代表完整行动成功');
  await expect(page.getByText('便携链路能量 14 · 耐久 98',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'指挥记录',exact:true}).click();await expect(page.getByTestId('received-report')).toHaveCount(2);await expect(page.getByTestId('received-report').last()).toContainText('观察 00:30');await expect(page.getByTestId('received-report').last()).toContainText('收到 00:31');
  const observation=await page.evaluate(()=>Reflect.get(window,'__b21Movement'));
  await info.attach('actual-public-worker-messages',{body:JSON.stringify(observation),contentType:'application/json'});await page.screenshot({path:info.outputPath('received-terminal.png'),fullPage:true});
});

test('PG10 command refresh preserves the edited confirmation and natural movement waits for its received terminal report',async({page},info)=>{
  test.setTimeout(65000);
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});
  await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).click();await page.getByRole('button',{name:'下达移动任务',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'确认移动任务'});await dialog.getByLabel('理由（可选）').fill('保留填写内容，等待确认');
  await page.waitForTimeout(1250);await expect(dialog).toBeVisible();await expect(dialog.getByLabel('理由（可选）')).toHaveValue('保留填写内容，等待确认');
  await dialog.getByRole('button',{name:'确认并下达',exact:true}).click();await expect(page.getByTestId('movement-status')).toContainText('已签发，等待回执');
  await expect(page.getByTestId('movement-status')).toContainText('接令已知',{timeout:8000});await expect(page.getByTestId('scope-detail')).toContainText('50.00, 150.00');
  await page.getByRole('button',{name:'放大地图',exact:true}).click();
  await expect(page.getByTestId('movement-status')).toContainText('抵达已知',{timeout:40000});await expect(page.getByTestId('scope-detail')).toContainText('150.00, 150.00');
  await page.getByRole('button',{name:'暂停行动',exact:true}).click();await page.getByRole('button',{name:'指挥记录',exact:true}).click();await expect(page.getByTestId('received-report')).toHaveCount(2);
  await page.screenshot({path:info.outputPath('natural-command-received.png'),fullPage:true});
});

test('PG10 pending confirmation cannot silently issue after the route is cancelled during a genuinely delayed public preview',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker,control={held:false,release:()=>{},requests:[] as Array<{kind:string}>};let previews=0;
    class Observer extends Native{constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('/assets/worker-')){
      const post=this.postMessage.bind(this);this.postMessage=(value:unknown)=>{control.requests.push(structuredClone(value) as {kind:string});post(value);};
      this.addEventListener('message',event=>{if(event.data?.plan?.kind==='corridor_move'&&++previews===2){event.stopImmediatePropagation();control.held=true;const data=structuredClone(event.data);control.release=()=>{control.held=false;this.dispatchEvent(new MessageEvent('message',{data}));};}});
    }}}
    window.Worker=Observer;Object.assign(window,{__b21PendingConfirm:control});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});
  await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).click();await page.getByRole('button',{name:'下达移动任务',exact:true}).click();
  await page.getByRole('button',{name:'确认并下达',exact:true}).click();await page.waitForFunction(()=>Reflect.get(window,'__b21PendingConfirm')?.held===true);
  await expect(page.getByRole('button',{name:'返回编辑',exact:true})).toBeDisabled();await expect(page.getByLabel('理由（可选）')).toBeDisabled();
  await page.getByRole('button',{name:'取消路线',exact:true}).click();await page.evaluate(()=>Reflect.get(window,'__b21PendingConfirm').release());
  await expect(page.getByRole('dialog',{name:'确认移动任务'})).toHaveCount(0);await expect(page.getByTestId('movement-status')).toContainText('可拟定移动任务');
  // Read the real public channel after a roundtrip, rather than relying on a sleep.
  await page.getByRole('button',{name:'保存行动',exact:true}).click();await expect(page.getByRole('status')).toContainText('行动已保存');
  const commands=await page.evaluate(()=>Reflect.get(window,'__b21PendingConfirm').requests.filter((r:{kind:string;envelope?:{intent:{kind:string}}})=>r.kind==='operate_corridor'&&r.envelope?.intent.kind==='issue'));
  expect(commands).toEqual([]);
});
