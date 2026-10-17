import {test,expect} from '@playwright/test';

test('B23 retained history after reload stays read-only until explicit takeover, while active history returns to its live run',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('推进到时刻（秒）').fill('31');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-source-R1')).toContainText('2次递交');
  await page.getByLabel('历史节点').selectOption('1');await page.getByRole('button',{name:'查看历史节点',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-source-R1')).toContainText('2次递交');
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeEnabled();
  await page.reload();await page.getByRole('button',{name:'查看记录',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-source-R1')).toContainText('2次递交');
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();
  await expect(page.getByTestId('intelligence-source-R3')).toHaveCount(0);
  await page.getByRole('button',{name:'返回演练入口',exact:true}).press('Enter');
  await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeEnabled();
  await page.getByLabel('推进到时刻（秒）').fill('41');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-source-R1')).toContainText('3次递交');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('B23 E08 keyboard source expansion and historical node expose only deliveries received then',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');
  await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
  for(const [time,count] of [['21','1'],['31','2'],['41','3']]){
    await page.getByLabel('推进到时刻（秒）').fill(time);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
    await expect(page.getByTestId('intelligence-source-R1')).toContainText(count+'次递交');
  }
  const expand=page.getByRole('button',{name:'展开原文及递交',exact:true});await expand.focus();await page.keyboard.press('Enter');
  await expect(page.getByTestId('intelligence-source-R1')).toContainText('来源时点不详');
  await expect(page.getByTestId('intelligence-deliveries-R1').locator('li')).toHaveCount(3);
  await page.getByLabel('历史节点').selectOption({label:'31秒 · 记录 3'});await page.getByRole('button',{name:'查看历史节点',exact:true}).press('Enter');
  await expect(page.getByTestId('intelligence-source-R1')).toContainText('2次递交');
  await expect(page.getByTestId('intelligence-deliveries-R1').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('intelligence-deliveries-R1')).not.toContainText('00:41');
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();
});

test('B23 manual pause still commits after real clock revisions advance while its request is delayed',async({page})=>{
  await page.addInitScript(()=>{
    const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);if(String(args[0]).includes('/assets/worker-')){
      const post=worker.postMessage.bind(worker);let delayed=false;
      worker.postMessage=(message:Record<string,unknown>)=>{const intent=(message.envelope as {intent?:{kind:string}}|undefined)?.intent;
        if(!delayed&&(message.kind==='operate'&&intent?.kind==='pause'||message.kind==='management_pause'&&message.reason==='manual')){delayed=true;Reflect.set(window,'__b23DelayedPause',true);setTimeout(()=>post(message),600);}else post(message);};
      Reflect.set(window,'__b23PauseWorker',worker);worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)Reflect.set(window,'__b23PauseView',event.data.view);});
    }return worker;}});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('command');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停行动',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>Reflect.get(window,'__b23DelayedPause'))).toBe(true);
  const actual=await page.evaluate(()=>new Promise<Record<string,unknown>>((resolve,reject)=>{const worker=Reflect.get(window,'__b23PauseWorker') as Worker,current=Reflect.get(window,'__b23PauseView'),request_id=crypto.randomUUID(),timer=setTimeout(()=>reject(Error('Actual pause view timeout')),10000);const read=(event:MessageEvent)=>{if(event.data.request_id===request_id){clearTimeout(timer);worker.removeEventListener('message',read);resolve(event.data.view);}};worker.addEventListener('message',read);worker.postMessage({kind:'view',run_id:current.run_id,request_id});}));
  expect(actual).toMatchObject({scenario_kind:'play_intelligence',paused:true});
});

for(const variant of ['cross_run','report_as_delivery','future','unknown_actor']){test('B23 E06 real Worker rejects '+variant+' without changing the committed view',async({page})=>{
  await page.addInitScript(()=>{
    const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);if(String(args[0]).includes('/assets/worker-')){Reflect.set(window,'__b23Worker',worker);worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)Reflect.set(window,'__b23View',event.data.view);});}return worker;}});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
  const result=await page.evaluate(async variant=>{
    const worker=Reflect.get(window,'__b23Worker') as Worker,before=structuredClone(Reflect.get(window,'__b23View'));
    const send=(input:Record<string,unknown>)=>new Promise<Record<string,unknown>>((resolve,reject)=>{const request_id=crypto.randomUUID(),timer=setTimeout(()=>reject(Error('Public Worker reply timeout')),10000);const handler=(event:MessageEvent)=>{if(event.data.request_id!==request_id)return;clearTimeout(timer);worker.removeEventListener('message',handler);resolve(event.data);};worker.addEventListener('message',handler);worker.postMessage({...input,request_id});});
    const basis={run_id:variant==='cross_run'?'other-run':before.run_id,kind:variant==='report_as_delivery'?'report':'report_delivery',id:variant==='future'?'D3':'D1',version:1};
    const reply=await send({kind:variant==='unknown_actor'?'issue_activity':'request_source_validation',envelope:{run_id:before.run_id,operation_id:'b23-invalid-worker-input',expected_revision:before.revision,intent:variant==='unknown_actor'?{kind:'issue_activity',actor_ref:{run_id:before.run_id,kind:'actor',id:'UnknownActor',version:1},activity_ref:{run_id:before.run_id,kind:'activity',id:'R-to-A',version:1},authority_ref:{run_id:before.run_id,kind:'authority',id:'HQ-field-authority',version:1},basis_delivery_refs:[]}:{kind:'request_source_validation',basis_delivery_refs:[basis]}}});
    const after=await send({kind:'view',run_id:before.run_id});return {before,reply,after};
  },variant);
  expect(result.reply).toMatchObject({ok:false,code:variant==='unknown_actor'?'UNSUPPORTED':'INVALID_REQUEST'});expect(result.after.view).toEqual(result.before);
});}

test('B23 E08 the public map and source panel retain usable side-by-side space at 1366px',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const map=page.getByRole('region',{name:'公开态势地图'}),panel=page.getByRole('complementary',{name:'总部已收原始资料'});
  await expect(map).toBeVisible();const bounds=await map.boundingBox(),sources=await panel.boundingBox();
  expect(bounds!.height).toBeGreaterThan(300);expect(bounds!.width).toBeGreaterThan(400);expect(sources!.x).toBeGreaterThanOrEqual(bounds!.x+bounds!.width-1);
});

test('B23 E01 initial actor and shared seat confirmations are visible without invented fixed-terminal balances',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');
  await expect(page.getByRole('heading',{name:'核对原始情报，组织两处记录',exact:true})).toBeVisible();
  await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const initial=page.getByRole('region',{name:'总部最后确认的编组'});
  await expect(initial).toContainText('R · 记录组 · 3人');await expect(initial).toContainText('记录能量 20 · 耐久 100 · 记录包 2');
  await expect(initial).toContainText('W · 作业组 · 3人');await expect(initial).toContainText('维修能量 24 · 耐久 100 · 维修包 2');
  await expect(page.getByTestId('intelligence-processing')).toContainText('一个处理席位');await expect(page.getByTestId('intelligence-processing')).toContainText('01:25');
  await expect(page.getByRole('region',{name:'总部已知的任务前提'})).toContainText('B需维修');
  await expect(page.getByRole('region',{name:'总部已知的任务前提'})).toContainText('开局公开条件');
  await expect(page.getByRole('button',{name:'R · 记录组',exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText('总部能量');
});
