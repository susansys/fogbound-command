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
