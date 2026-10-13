import {expect,test} from '@playwright/test';

type WorkerState={gameWorker:Worker;knownView?:{run_id:string;source_run:string|null;sim_time:number;artifacts?:unknown[];revision:number;paused:boolean}};
async function issueRecord(page:import('@playwright/test').Page){
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'拟定记录任务',exact:true}).click();
  await page.getByRole('button',{name:'查看记录预案',exact:true}).click();
  await page.getByRole('button',{name:'下达记录任务',exact:true}).click();
  await page.getByRole('button',{name:'确认下达',exact:true}).click();
  await expect(page.locator('.task-aside')).toContainText('记录任务已登记');
}

test('FB02-S13 real browser resumes a mid-work Record run paused, then completes exactly once',async({page})=>{
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await issueRecord(page);
  await page.getByLabel('推进至秒').fill('26');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:26');
  await expect(page.locator('body')).not.toContainText('成果 artifact-');
  await page.getByRole('button',{name:'保存记录',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('已保存至 00:26');
  await page.reload();
  await page.getByRole('button',{name:'接手这场演练',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:26');
  await expect(page.locator('.clock')).toContainText('已暂停');
  await expect(page.locator('body')).not.toContainText('成果 artifact-');
  await page.getByLabel('推进至秒').fill('47');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('任务完成');
  await expect(page.locator('section').filter({hasText:'已收到的装备状态'})).toContainText('成果 artifact-record');
  await expect(page.locator('.bottom-log').getByText(/记录成果回报已收到/)).toHaveCount(1);
  await expect(page.getByText('记录能量 13 / 17',{exact:false})).toBeVisible();
});

test('FB02-S14 Record history is read-only and does not backfill future artifacts before their receipt',async({page})=>{
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;(window as unknown as WorkerState).gameWorker=worker;worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)(window as unknown as WorkerState).knownView=event.data.view;});return worker;}});});
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await issueRecord(page);
  await page.getByLabel('推进至秒').fill('47');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('任务完成');
  const run=await page.evaluate(()=>(window as unknown as WorkerState).knownView!.run_id);
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();
  await page.getByLabel('回看时刻（秒）').fill('46');
  await page.getByRole('button',{name:'查看当时情况',exact:true}).click();
  await expect(page.getByText('历史记录 · 只读',{exact:true})).toBeVisible();
  await expect(page.locator('.clock strong')).toHaveText('00:46');
  await expect(page.locator('body')).not.toContainText('成果 artifact-');
  const code=await page.evaluate((runId)=>new Promise<string>(resolve=>{const worker=(window as unknown as WorkerState).gameWorker;const request_id='record-history-write';const handler=(event:MessageEvent)=>{if(event.data.request_id===request_id){worker.removeEventListener('message',handler);resolve(event.data.code);}};worker.addEventListener('message',handler);worker.postMessage({kind:'operate',request_id,envelope:{run_id:runId,operation_id:'historical-record-save',expected_revision:4,intent:{kind:'save'}}});}),run);
  expect(code).toBe('HISTORY_READ_ONLY');
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('任务完成');
  await expect(page.locator('section').filter({hasText:'已收到的装备状态'})).toContainText('成果 artifact-record');
});

test('FB02-S14 same Record restart keeps the previous run as isolated read-only history and returns to the new run',async({page})=>{
  await page.addInitScript(()=>{const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;(window as unknown as WorkerState).gameWorker=worker;worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)(window as unknown as WorkerState).knownView=event.data.view;});return worker;}});});
  await page.goto('/');
  await page.getByLabel('时间方式').selectOption('research');
  await issueRecord(page);
  await page.getByLabel('推进至秒').fill('47');
  await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('任务完成');
  const old=await page.evaluate(()=>(window as unknown as WorkerState).knownView!.run_id);
  await page.getByRole('button',{name:'重开行动',exact:true}).click();
  await page.getByRole('button',{name:'确认重开',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00');
  await expect(page.locator('.contextbar')).toContainText('档案 A');
  const fresh=await page.evaluate(()=>(window as unknown as WorkerState).knownView!);
  expect(fresh.run_id).not.toBe(old);
  expect(fresh.source_run).toBe(old);
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();
  await page.getByRole('button',{name:'查看上一场记录',exact:true}).click();
  await expect(page.getByText('历史记录 · 只读',{exact:true})).toBeVisible();
  await expect(page.locator('.clock')).toContainText('任务完成');
  await expect(page.locator('section').filter({hasText:'已收到的装备状态'})).toContainText('成果 artifact-record');
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
  await expect(page.locator('.clock strong')).toHaveText('00:00');
  await expect(page.locator('body')).not.toContainText('成果 artifact-record');
  await page.getByRole('button',{name:'更换演练',exact:true}).click();
  await expect(page.getByText(/已保存的演练记录 · 工位记录/)).toHaveCount(1);
  await page.getByRole('button',{name:'查看记录',exact:true}).click();
  await expect(page.locator('.clock')).toContainText('历史记录 · 只读');
});
