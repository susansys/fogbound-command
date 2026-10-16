import {test,expect} from '@playwright/test';

test('B23 saving a preparation draft through the real Worker does not queue work or commit repair packs',async({page})=>{
  await page.addInitScript(()=>{
    const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);if(String(args[0]).includes('/assets/worker-'))worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)Reflect.set(window,'__b23WorkView',event.data.view);});return worker;}});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
  await page.getByLabel('准备目的').fill('取得B处记录');await page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-plan')).toContainText('草案第1版');await expect(page.getByTestId('intelligence-plan')).toContainText('尚未提交准备申请');
  const view=await page.evaluate(()=>Reflect.get(window,'__b23WorkView'));
  expect(view).toMatchObject({sim_time:0,plan:{purpose:'取得B处记录',ref:{version:1}},processing:{energy_confirmed:20,energy_reserved:0,queue:[]},supply_commitments:[]});
  await page.reload();await page.getByRole('button',{name:'查看记录',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-plan')).toContainText('取得B处记录');await expect(page.getByRole('button',{name:'保存准备草案',exact:true})).toBeDisabled();
});

test('B23 E11 preparation requires an explicit request and remains queued until the one public seat is free',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('准备目的').fill('取得B处记录');await page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter');
  const apply=page.getByRole('button',{name:'提交准备申请',exact:true});await expect(apply).toBeVisible();await apply.press('Enter');
  await expect(page.getByTestId('intelligence-plan')).toContainText('准备审查中，尚未批准');await expect(page.getByTestId('intelligence-processing')).toContainText('准备待处理');await expect(page.getByTestId('intelligence-processing')).toContainText('已预留 6');
  await page.getByLabel('推进到时刻（秒）').fill('84.999');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.locator('.clock strong')).toHaveText('01:24.999');await expect(page.getByTestId('intelligence-processing')).toContainText('准备待处理');
  await page.getByLabel('推进到时刻（秒）').fill('85');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-processing')).toContainText('准备中');await expect(page.getByTestId('intelligence-processing')).toContainText('开始 01:25');
  await expect(page.getByTestId('intelligence-plan')).toContainText('尚未批准');
  await page.getByLabel('推进到时刻（秒）').fill('145');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.locator('.clock strong')).toHaveText('02:25');
  await expect(page.getByTestId('intelligence-plan')).toContainText('尚未批准');
  await page.getByLabel('推进到时刻（秒）').fill('146');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-plan')).toContainText('准备批准已收到');await expect(page.getByTestId('intelligence-supply-commitments')).toContainText('W 维修包 · 总部计划已预留 2');
  await expect(page.getByTestId('intelligence-processing')).toContainText('处理能量最后确认 14');
  await expect(page.getByRole('region',{name:'总部最后确认的编组'})).toContainText('维修包 2');
});

test('B23 E17 raw evidence, processing completion and received validation remain distinct in the real interface',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('推进到时刻（秒）').fill('86');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  const green=page.getByTestId('intelligence-source-R3');await expect(green).toContainText('绿色凭证原文');
  const request=green.getByRole('button',{name:'请求核实这份原文',exact:true});await expect(request).toBeVisible();await request.press('Enter');
  await expect(page.getByTestId('intelligence-processing')).toContainText('核实中');await expect(page.getByTestId('intelligence-processing')).toContainText('已预留 2');
  await page.getByLabel('推进到时刻（秒）').fill('106');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-assessments')).toContainText('尚未收到核实产品');await expect(page.getByTestId('intelligence-processing')).toContainText('处理能量最后确认 18');
  await page.getByLabel('推进到时刻（秒）').fill('107');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-assessments')).toContainText('绿色凭证已核实');await expect(page.getByTestId('intelligence-assessments')).toContainText('完成 01:46');await expect(page.getByTestId('intelligence-assessments')).toContainText('收到 01:47');
  await expect(page.locator('.workspacebar .outline-tag')).toContainText('绿色凭证已核实');
  await expect(green).toContainText('核实结论已收到');
  await green.getByRole('button',{name:'展开原文及递交',exact:true}).press('Enter');await expect(green).toContainText('原文称：B处访问凭证为绿色。');
});
