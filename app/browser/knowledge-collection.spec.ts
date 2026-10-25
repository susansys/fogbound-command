import {test,expect} from '@playwright/test';
// @ts-expect-error Existing source-pinned JavaScript observer is separately verified.
import {observe,publicView} from '../verification/outcome-native-recovery.mjs';

test('KA-E31 a player can start the text collection package through its normal Workbench entry',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('option',{name:'文字采集与知识',exact:true})).toHaveCount(1);
  await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'文字采集与知识',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'请求 R 采集',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'请求 W 检查',exact:true})).toBeEnabled();
  await expect(page.getByRole('region',{name:'综合现场地图',exact:true})).toBeVisible();
  await expect(page.getByText('文字资料；媒体附件暂不支持',{exact:true})).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('行动时间',{exact:true})).toBeVisible();await expect(page.getByRole('banner').getByRole('button',{name:'保存当前记录',exact:true})).toBeVisible();
  const rail=page.getByRole('navigation');await expect(rail.getByRole('button',{name:'当时所知',exact:true})).toBeVisible();
  await page.getByRole('region',{name:'综合现场地图',exact:true}).evaluate(element=>Reflect.set(window,'__kaOriginalMapNode',element));await rail.getByRole('button',{name:'情报报告',exact:true}).click();
  await expect(page.getByRole('region',{name:'报告列表',exact:true})).toBeVisible();expect(await page.evaluate(()=>Reflect.get(window,'__kaOriginalMapNode').isConnected)).toBe(true);await page.getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.getByRole('region',{name:'综合现场地图',exact:true})).toBeVisible();
});

test('KA-E31 a player completes both actual collection and return chains through the normal Workbench',async({page},info)=>{
  await observe(page);await page.goto('/');
  await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'文字采集与知识',exact:true})).toBeVisible();
  const at=async(second:number)=>{await page.getByLabel('推进至（秒）',{exact:true}).fill(String(second));await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(second*1000);};
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await at(32);
  let view=await publicView(page);expect(view.reports).toMatchObject([{source_actor:'R',observed_time:{kind:'known',value:30000},generated_at:31000}]);expect(view.deliveries).toMatchObject([{received_at:32000}]);
  await page.getByRole('button',{name:'安排 R 返回',exact:true}).click();await at(59);
  await page.getByRole('button',{name:'请求 W 检查',exact:true}).click();await at(93);
  view=await publicView(page);expect(view.reports.find((report:{source_actor:string})=>report.source_actor==='W')).toMatchObject({observed_time:{kind:'known',value:90000},generated_at:92000});
  expect(view.deliveries.some((delivery:{received_at:number})=>delivery.received_at===93000)).toBe(true);
  await page.getByRole('button',{name:'安排 W 返回',exact:true}).click();
  await page.getByLabel('推进至（秒）',{exact:true}).fill('400');await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect(page.getByRole('region',{name:'行动结果',exact:true})).toContainText('成功');await expect(page.getByRole('region',{name:'行动结果',exact:true})).toContainText('已确认安全 6 人');
  await expect(page.getByRole('status')).toContainText('目标已确认');await expect(page.getByTestId('collection-outcome-summary')).toBeInViewport();
  await expect(page.getByRole('complementary',{name:'文字采集工作台'})).not.toContainText('总部尚未收到本局采集报告');
  view=await publicView(page);expect(view).toMatchObject({scenario_kind:'play_knowledge_collection',sim_time:365429,finished:true,result:{outcome:'success',safe_people:6,missing_records:[]}});
  await page.screenshot({path:info.outputPath('knowledge-normal-complete.png'),fullPage:true});await info.attach('actual-public-final-view.json',{body:JSON.stringify(view),contentType:'application/json'});
});
