import {test,expect,type Page} from '@playwright/test';
import type {PlayerView} from '../src/contracts';
type Observed={view?:PlayerView;worker:Worker};
async function observe(page:Page){await page.addInitScript(()=>{const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;(window as unknown as Observed).worker=worker;worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)(window as unknown as Observed).view=event.data.view;});return worker;}});});}
async function start(page:Page){
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('ENG-PRESTART-REPLACE');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await page.getByRole('button',{name:'查看通行预案',exact:true}).click();await page.getByLabel('指挥意图（选填）').fill('原N理由原字保留');await page.getByRole('button',{name:'下达通行命令',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(1);
  await step(page,'2','00:02');await page.getByRole('button',{name:'请求改到T',exact:true}).click();await page.getByLabel('指挥意图（选填）').fill('替代T理由原字保留');await page.getByRole('button',{name:'下达替代请求',exact:true}).click();await page.getByRole('button',{name:'确认下达',exact:true}).click();await expect(page.getByTestId('frozen-command').locator('article')).toHaveCount(2);
}
async function step(page:Page,to:string,clock:string){await page.getByLabel('推进至秒').fill(to);await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText(clock);}

for(const point of [{seconds:'2',clock:'00:02'},{seconds:'2.5',clock:'00:02.500'},{seconds:'3',clock:'00:03'}])test(`CR23/24 real Worker restores replacement stage ${point.seconds}s without unseen acceptance`,async({page},testInfo)=>{
  await start(page);if(point.seconds!=='2')await step(page,point.seconds,point.clock);
  const original=await page.evaluate(()=>(window as unknown as Observed).view!);expect(original.replacement).toBeUndefined();
  await page.getByRole('button',{name:'态势地图',exact:true}).click();await page.getByRole('button',{name:'保存记录',exact:true}).click();await expect(page.getByRole('status')).toContainText('已保存');
  await page.reload();await page.getByRole('button',{name:'接手这场演练',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText(point.clock);await expect(page.locator('.clock')).toContainText('已暂停');
  const restored=await page.evaluate(()=>(window as unknown as Observed).view!);expect(restored.run_id).toBe(original.run_id);expect(restored.resources).toEqual(original.resources);expect(restored.issued_orders).toEqual(original.issued_orders);expect(restored.replacement).toBeUndefined();
  await step(page,'120','00:40.800');await expect(page.locator('.clock')).toContainText('任务完成');
  const final=await page.evaluate(()=>(window as unknown as Observed).view!);expect(final.log.filter(entry=>entry.kind==='replace_receipt')).toHaveLength(1);expect(final.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(1);expect(final.resources).toMatchObject({hq_energy:14,equipment_energy:6,movement_energy:18});
  await page.screenshot({path:testInfo.outputPath('restored-completed.png'),fullPage:true});
});

test('CR25/26 real page history keeps original facts and reasons, then restarts a distinct run with one new replacement slot',async({page},testInfo)=>{
  await start(page);const registered=await page.evaluate(()=>(window as unknown as Observed).view!);await step(page,'120','00:40.800');const final=await page.evaluate(()=>(window as unknown as Observed).view!);
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('展开完整提交记录').check();await page.getByLabel('回看节点').selectOption(String(registered.revision));await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:02');await expect(page.locator('.clock')).toContainText('历史记录 · 只读');
  await page.getByRole('button',{name:'任务调度',exact:true}).click();await expect(page.getByTestId('frozen-command')).toContainText('原N理由原字保留');await expect(page.getByTestId('frozen-command')).toContainText('替代T理由原字保留');await expect(page.getByRole('button',{name:'请求改到T',exact:true})).toHaveCount(0);await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:40.800');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('回看时刻（秒）').fill('21.9');await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:21.900');
  const historical=await page.evaluate(()=>(window as unknown as Observed).view!);expect(historical.finished).toBe(false);expect(historical.position.x).toBe(87.74);
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();await page.getByRole('button',{name:'重开行动',exact:true}).click();await page.getByRole('button',{name:'确认重开',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:00');
  const fresh=await page.evaluate(()=>(window as unknown as Observed).view!);expect(fresh.run_id).not.toBe(final.run_id);expect(fresh.source_run).toBe(final.run_id);expect(fresh.issued_orders).toEqual([]);expect(fresh.can_issue).toBe(true);
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByRole('button',{name:'查看上一场记录',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:40.800');await expect(page.locator('.clock')).toContainText('历史记录 · 只读');
  await page.getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.locator('.clock strong')).toHaveText('00:00');await page.screenshot({path:testInfo.outputPath('new-run-old-readonly.png'),fullPage:true});
});
