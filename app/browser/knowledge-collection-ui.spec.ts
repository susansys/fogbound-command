import {test,expect} from '@playwright/test';
// @ts-expect-error Existing source-pinned public observer is separately verified.
import {observe,publicView} from '../verification/outcome-native-recovery.mjs';

test('KA-E33 original reading preserves source age, advance draft, selection and return focus without a Game operation',async({page},info)=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await page.getByLabel('推进至（秒）',{exact:true}).fill('32');await page.getByRole('button',{name:'推进时间',exact:true}).click();
  await expect.poll(async()=>(await publicView(page)).sim_time).toBe(32000);
  await page.getByRole('button',{name:'选择W组',exact:true}).click();await page.getByLabel('推进至（秒）',{exact:true}).fill('59');
  const before=await publicView(page),original=page.getByRole('button',{name:'查看 R 采集原文',exact:true});await expect(original).toBeVisible();await page.setViewportSize({width:760,height:900});await original.click();
  const reading=page.getByRole('region',{name:'原文阅读',exact:true});await expect(reading).toContainText('观察时点：本局 30 秒');await expect(reading).toContainText('形成时点：本局 31 秒');await expect(reading).toContainText('总部收到：本局 32 秒');await expect(reading).toContainText('来源自报时点：时间未知');await expect(reading).toContainText('有限');await expect(reading).toContainText('媒体附件暂不支持');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('knowledge-original-reading.png'),fullPage:true});await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
  await expect(page.getByLabel('推进至（秒）',{exact:true})).toHaveValue('59');await expect(page.getByRole('region',{name:'当前行动',exact:true})).toContainText('当前对象：W');await expect(original).toBeFocused();
  expect((await publicView(page)).revision).toBe(before.revision);
});

test('KA-E34 research uses manual advancement and never offers an unusable continue control',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByLabel('推进至（秒）',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'明确继续',exact:true})).toHaveCount(0);
  await page.getByLabel('推进至（秒）',{exact:true}).fill('1');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(1000);
  const snapshot=await publicView(page);await page.waitForTimeout(350);expect((await publicView(page)).revision).toBe(snapshot.revision);
});

test('KA-E34 actual command clock continues during original reading and resumes only after an explicit confirmed continue',async({page})=>{
  test.setTimeout(90000);
  await observe(page);await page.addInitScript(()=>{const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker,requests=new Map<string,string>();let dropped=false;worker.postMessage=new Proxy(worker.postMessage,{apply(Target,thisArg,args){requests.set(args[0].request_id,args[0].kind);return Reflect.apply(Target,thisArg,args);}});worker.addEventListener('message',event=>{if(!dropped&&event.data.ok&&requests.get(event.data.request_id)==='management_pause'){dropped=true;Reflect.set(window,'__kaDroppedPauseACK',structuredClone(event.data));event.stopImmediatePropagation();}},{capture:true});return worker;}});});await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('button',{name:'暂停行动',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停行动',exact:true}).click();
  await expect(page.getByRole('button',{name:'核对暂停状态',exact:true})).toBeVisible({timeout:15000});expect(await page.evaluate(()=>Reflect.get(window,'__kaDroppedPauseACK'))).toMatchObject({ok:true,view:{paused:true}});
  await page.getByRole('button',{name:'核对暂停状态',exact:true}).click();await expect(page.getByRole('button',{name:'明确继续',exact:true})).toBeEnabled();await expect.poll(async()=>(await publicView(page)).paused).toBe(true);
  await expect(page.getByLabel('推进速度',{exact:true})).toBeVisible();await page.getByLabel('推进速度',{exact:true}).selectOption('4');await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await page.getByRole('button',{name:'明确继续',exact:true}).click();
  const original=page.getByRole('button',{name:'查看 R 采集原文',exact:true});await expect(original).toBeVisible({timeout:15000});await original.click();
  const reading=page.getByRole('region',{name:'原文阅读',exact:true});await expect(reading).toBeVisible();const readAt=await publicView(page);expect(readAt.paused).toBe(false);
  await expect.poll(async()=>(await publicView(page)).sim_time).toBeGreaterThan(readAt.sim_time+1000);
  await page.getByRole('button',{name:'暂停行动',exact:true}).click();await expect.poll(async()=>(await publicView(page)).paused).toBe(true);const paused=await publicView(page);
  // A bounded stability sample across several real timer intervals, not a wait gate.
  await page.waitForTimeout(350);expect((await publicView(page)).sim_time).toBe(paused.sim_time);
  await page.getByRole('button',{name:'明确继续',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{
    const trace=Reflect.get(window,'__b24FullTrace') as Array<{request?:{kind:string;request_id:string;envelope?:{intent:{kind:string}}};response?:{request_id:string;view?:{sim_time:number;paused:boolean}}}>;
    const request=[...trace].reverse().find(row=>row.request?.kind==='operate_knowledge_collection'&&row.request.envelope?.intent.kind==='continue')?.request;
    return request?trace.find(row=>row.response?.request_id===request.request_id)?.response?.view:null;
  })).toMatchObject({sim_time:paused.sim_time,paused:false});
  await expect.poll(async()=>(await publicView(page)).sim_time).toBeGreaterThan(paused.sim_time);await expect(reading).toBeVisible();await page.getByRole('button',{name:'暂停行动',exact:true}).click();await expect.poll(async()=>(await publicView(page)).paused).toBe(true);
});

test('KA-E33 later qualified evidence and history never rewrite the saved40s judgment or discard its new draft',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const at=async(second:number)=>{await page.getByLabel('推进至（秒）',{exact:true}).fill(String(second));await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(second*1000);};
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await at(32);
  await expect(page.getByLabel('依据：R 采集原文',{exact:true})).toBeVisible();await page.getByLabel('依据：R 采集原文',{exact:true}).check();await at(40);
  await page.getByLabel('设施状况研判',{exact:true}).selectOption('faulted');await page.getByLabel('研判理由（可选）',{exact:true}).fill('40秒时仅有有限资料，暂按故障处置');await page.getByRole('button',{name:'保存研判',exact:true}).click();
  await expect.poll(async()=>(await publicView(page)).assessments.length).toBe(1);const judged=await publicView(page),original=structuredClone(judged.assessments[0]);
  expect(original).toMatchObject({recorded_at:40000,conclusion:'faulted',reason:{kind:'recorded',text:'40秒时仅有有限资料，暂按故障处置'}});
  await page.getByLabel('研判理由（可选）',{exact:true}).fill('尚未提交的新判断');await at(59);await page.getByRole('button',{name:'请求 W 检查',exact:true}).click();await at(93);
  await expect(page.getByRole('region',{name:'当前设施认知',exact:true})).toContainText('观察时设施可用');expect((await publicView(page)).assessments[0]).toEqual(original);
  await page.getByLabel('推进至（秒）',{exact:true}).fill('100');await page.getByLabel('历史节点',{exact:true}).selectOption(String(judged.revision));await page.getByRole('button',{name:'查看历史节点',exact:true}).click();
  await expect(page.getByText('历史记录 · 只读',{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'当前设施认知',exact:true})).toContainText('尚未确认');await expect(page.getByRole('button',{name:'查看 W 检查原文',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'保存研判',exact:true})).toBeDisabled();let view=await publicView(page);expect(view).toMatchObject({sim_time:40000,correction_records:[],assessments:[original]});
  await page.getByRole('button',{name:'返回当前记录',exact:true}).click();await expect(page.getByRole('region',{name:'当前设施认知',exact:true})).toContainText('观察时设施可用');
  await expect(page.getByLabel('研判理由（可选）',{exact:true})).toHaveValue('尚未提交的新判断');await expect(page.getByLabel('推进至（秒）',{exact:true})).toHaveValue('100');await expect(page.getByRole('button',{name:'查看历史节点',exact:true})).toBeFocused();
  view=await publicView(page);expect(view).toMatchObject({sim_time:93000,assessments:[original],correction_records:[{recorded_at:93000}]});
});

test('KA-E31 source variant separates five deliveries, three originals and later public independence proof',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('资料情景').selectOption('KA-SOURCE3-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const at=async(second:number)=>{await page.getByLabel('推进至（秒）',{exact:true}).fill(String(second));await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(second*1000);};
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await at(59);await page.getByRole('button',{name:'请求 W 检查',exact:true}).click();await at(100);
  await expect(page.getByRole('region',{name:'公开来源关系',exact:true})).toContainText('独立来源：未知');
  await page.getByRole('button',{name:'请求 R 读取历史调查',exact:true}).click();await at(105);
  let view=await publicView(page);expect(view.source_relationships).toMatchObject({content_delivery_count:5,report_identity_count:3,global_independence:{kind:'unknown'}});
  await page.getByRole('button',{name:'查看 S 历史原文',exact:true}).click();await expect(page.getByRole('region',{name:'原文阅读',exact:true})).toContainText('开局前 60 秒');await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
  await page.getByRole('button',{name:'请 R 转发已读来源凭证',exact:true}).click();await at(110);view=await publicView(page);expect(view.source_relationships.global_independence).toMatchObject({kind:'confirmed',count:3});
  await expect(page.getByRole('region',{name:'公开来源关系',exact:true})).toContainText('已证明独立来源：3');expect(view.source_credentials).toHaveLength(3);
  const historicalObservation=structuredClone(view.reports.find((report:{body:{kind:string}})=>report.body.kind==='historical_survey').observed_time);expect(historicalObservation).toMatchObject({kind:'known',value:-60000});
  await page.getByLabel('依据：S 历史原文',{exact:true}).check();await page.getByRole('button',{name:'加工选定原文',exact:true}).click();await at(130);
  await expect(page.getByRole('region',{name:'总部资料加工',exact:true})).toContainText('原观察：开局前 60 秒');expect((await publicView(page)).hq_products.at(-1).source_observation_times).toEqual([historicalObservation]);
});

test('KA-E32 cancellation and explicit termination show bounded safe cleanup without invented success',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await page.getByRole('button',{name:'请求 W 检查',exact:true}).click();await expect(page.getByRole('button',{name:'请求撤回 W 采集',exact:true})).toBeVisible();await page.getByRole('button',{name:'请求撤回 W 采集',exact:true}).click();
  await page.getByLabel('推进至（秒）',{exact:true}).fill('3');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(3000);
  let view=await publicView(page);expect(view.collection_requests[1].status).toBe('cancelled');expect(view.collection_requests[1].local_receipt).toMatchObject({kind:'cancelled_before_send',remote_task_created:false});expect(view.reports).toHaveLength(0);
  await page.getByRole('button',{name:'终止本次任务',exact:true}).click();await expect(page.getByRole('dialog',{name:'确认终止任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'继续当前任务',exact:true}).click();expect((await publicView(page)).termination).toBeNull();
  await page.getByRole('button',{name:'终止本次任务',exact:true}).click();await page.getByRole('button',{name:'确认终止并收整',exact:true}).click();await expect.poll(async()=>(await publicView(page)).status).toBe('terminating');
  await page.getByLabel('推进至（秒）',{exact:true}).fill('400');await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect(page.getByRole('region',{name:'行动结果',exact:true})).toContainText('已中止');view=await publicView(page);expect(view.result).toMatchObject({outcome:'aborted',safe_people:6,missing_records:['R','W']});expect(view.verification_records).toHaveLength(0);
  await expect(page.getByRole('button',{name:'查看 R 收整原文',exact:true})).toBeVisible();await page.getByRole('button',{name:'查看 R 收整原文',exact:true}).click();await expect(page.getByRole('region',{name:'原文阅读',exact:true})).toContainText('实际收整确认 3 人');await expect(page.getByRole('region',{name:'原文阅读',exact:true})).toContainText('不等于实体已交接或核验通过');await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
});

test('KA-E33 cancelling a dirty departure preserves the draft, selection, scroll and return focus',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'选择W组',exact:true}).click();await page.getByLabel('研判理由（可选）',{exact:true}).fill('离开前尚未保存的判断');
  const side=page.getByRole('complementary',{name:'文字采集工作台',exact:true});await side.evaluate(element=>{element.scrollTop=120;});const scroll=await side.evaluate(element=>element.scrollTop);expect(scroll).toBeGreaterThan(0);
  const before=await publicView(page);await page.getByRole('button',{name:'更换演练任务',exact:true}).click();await expect(page.getByRole('dialog',{name:'保留未提交草稿',exact:true})).toBeVisible();await page.getByRole('button',{name:'留在当前记录',exact:true}).click();await expect.poll(()=>side.evaluate(element=>element.scrollTop)).toBe(scroll);
  await page.getByRole('button',{name:'更换演练任务',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'保留未提交草稿',exact:true})).toHaveCount(0);await expect.poll(()=>side.evaluate(element=>element.scrollTop)).toBe(scroll);
  await expect(page.getByLabel('研判理由（可选）',{exact:true})).toHaveValue('离开前尚未保存的判断');await expect(page.getByRole('button',{name:'选择W组',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'更换演练任务',exact:true})).toBeFocused();expect((await publicView(page)).revision).toBe(before.revision);
});

test('KA-E31 HQ preparation and processing use the real shared queue and retain the original observation age',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const at=async(second:number)=>{await page.getByLabel('推进至（秒）',{exact:true}).fill(String(second));await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(second*1000);};
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await at(32);await page.getByLabel('依据：R 采集原文',{exact:true}).check();
  await page.getByRole('button',{name:'登记总部资料准备',exact:true}).click();await page.getByRole('button',{name:'加工选定原文',exact:true}).click();await expect.poll(async()=>(await publicView(page)).hq_work.map((job:{status:string})=>job.status)).toEqual(['processing','queued']);let view=await publicView(page);
  await page.getByRole('button',{name:'撤回排队加工',exact:true}).click();await at(52);view=await publicView(page);expect(view.hq_work).toMatchObject([{status:'completed',used_ms:20000},{status:'cancelled',used_ms:0}]);
  await page.getByRole('button',{name:'加工选定原文',exact:true}).click();await at(72);view=await publicView(page);expect(view.hq_products).toMatchObject([{kind:'preparation',completed_at:52000},{kind:'processing',completed_at:72000,source_observation_times:[{kind:'known',value:30000}]}]);
  await expect(page.getByRole('region',{name:'总部资料加工',exact:true})).toContainText('本局 30 秒');expect(view.facility_knowledge).toBeNull();
});

test('KA-E31 actual late position forward keeps the newer position and the old report original age',async({page})=>{
  await observe(page);await page.goto('/');await page.getByLabel('演练任务').selectOption('KA-TEXT-KNOWLEDGE-01');await page.getByLabel('资料情景').selectOption('KA-LATE-POSITION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const at=async(second:number)=>{await page.getByLabel('推进至（秒）',{exact:true}).fill(String(second));await page.getByRole('button',{name:'推进时间',exact:true}).click();await expect.poll(async()=>(await publicView(page)).sim_time).toBe(second*1000);};
  await page.getByRole('button',{name:'请求 R 采集',exact:true}).click();await at(32);await page.getByRole('button',{name:'安排 R 返回',exact:true}).click();await at(88);await page.getByRole('button',{name:'请求 R 自报当前位置',exact:true}).click();await at(91);
  let view=await publicView(page);expect(view.actors[0].position).toMatchObject({point:[201.55,150],observed_at:90000,received_at:91000});const position=structuredClone(view.actors[0].position);
  await at(118);await page.getByRole('button',{name:'请 R 转发采集后位置原文',exact:true}).click();await at(120);view=await publicView(page);expect(view.actors[0].position).toEqual(position);
  await page.getByRole('button',{name:'查看 R 采集后位置原文',exact:true}).click();await expect(page.getByRole('region',{name:'原文阅读',exact:true})).toContainText('观察时点：本局 30 秒');await expect(page.getByRole('region',{name:'原文阅读',exact:true})).toContainText('总部收到：本局 120 秒');
});
