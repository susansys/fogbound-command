import {test,expect} from '@playwright/test';
test.use({viewport:{width:1366,height:768}});

test('B24 E33/E36 distinct actual Delivery contexts of the same report keep unsaved retrospective drafts separate through original-record switching',async({page},info)=>{
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{const Native=Worker,trace:unknown[]=[];Reflect.set(window,'__b24DeliveryDraftTrace',trace);window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args),post=worker.postMessage.bind(worker);worker.postMessage=(request:unknown)=>{trace.push({request:structuredClone(request)});post(request);};worker.addEventListener('message',(event:MessageEvent)=>{trace.push({response:structuredClone(event.data)});if(event.data.ok&&event.data.view)Reflect.set(window,'__b24DeliveryDraftView',structuredClone(event.data.view));if(event.data.ok&&event.data.debrief_answer?.layer==='known_then')Reflect.set(window,'__b24DeliveryDraftAnswer',structuredClone(event.data.debrief_answer));if(event.data.ok&&event.data.evidence_resolution)Reflect.set(window,'__b24DeliveryDraftOriginal',structuredClone(event.data.evidence_resolution));});return worker;}});});
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('推进到时刻（秒）').fill('910');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-result')).toContainText('任务未完成');const final=await page.evaluate(()=>Reflect.get(window,'__b24DeliveryDraftView'));
  await page.getByRole('button',{name:'查看复盘',exact:true}).press('Enter');await page.getByText('查看当时依据与引用',{exact:true}).press('Enter');await page.getByRole('button',{name:'查询当时依据',exact:true}).press('Enter');
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24DeliveryDraftAnswer')?.actor)).toBe('HQ');const answer=await page.evaluate(()=>Reflect.get(window,'__b24DeliveryDraftAnswer'));
  const first=answer.entries.findIndex((e:any)=>e.ref.kind==='report'&&e.ref.id==='R1'&&e.ref.received_at.evidence==='D1'),second=answer.entries.findIndex((e:any)=>e.ref.kind==='report'&&e.ref.id==='R1'&&e.ref.received_at.evidence==='D2');expect(first).toBeGreaterThanOrEqual(0);expect(second).toBeGreaterThanOrEqual(0);
  const d1=answer.entries[first].ref,d2=answer.entries[second].ref;expect(d1.source_digest).toBe(d2.source_digest);expect(d1.received_at).toEqual({kind:'known',value:21000,evidence:'D1'});expect(d2.received_at).toEqual({kind:'known',value:31000,evidence:'D2'});
  async function open(index:number,delivery:string){
    await page.getByTestId('debrief-evidence-entry').nth(index).getByRole('button',{name:'定位原始记录',exact:true}).press('Enter');
    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24DeliveryDraftOriginal')?.entry.ref.received_at.evidence)).toBe(delivery);
    const original=page.getByTestId('debrief-original-record');await expect(original.getByRole('heading',{name:'只读原始记录',exact:true})).toBeFocused();
    await original.getByText('补充事后说明',{exact:true}).press('Enter');const editor=original.getByLabel('事后说明正文',{exact:true});await expect(editor).toBeEnabled();return editor;
  }
  let editor=await open(first,'D1');await expect(editor).toHaveValue('');await editor.fill('第一份送达上下文的未提交草稿。');
  editor=await open(second,'D2');await expect(editor).toHaveValue('');await editor.fill('第二份送达上下文的独立未提交草稿。');
  editor=await open(first,'D1');await expect(editor).toHaveValue('第一份送达上下文的未提交草稿。');
  editor=await open(second,'D2');await expect(editor).toHaveValue('第二份送达上下文的独立未提交草稿。');
  const trace=await page.evaluate(()=>Reflect.get(window,'__b24DeliveryDraftTrace'));expect(trace.some((e:any)=>e.request?.kind==='append_outcome_inference'||e.request?.kind==='request_outcome_truth')).toBe(false);expect(await page.evaluate(()=>Reflect.get(window,'__b24DeliveryDraftView'))).toEqual(final);await expect(page.getByRole('alert')).toHaveCount(0);
  await import('node:fs/promises').then(fs=>fs.writeFile(info.outputPath('actual-distinct-delivery-drafts.json'),JSON.stringify({d1,d2,trace,final,scope:'same-running UI draft navigation; not unsubmitted draft process recovery'},null,2),{flag:'wx'}));
});

test('B24 E34/E36 real local evidence opens its original committed node and a separate read-only HQ history, never backfilling HQ before delivery',async({page},info)=>{
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{const Native=Worker,trace:unknown[]=[];Reflect.set(window,'__b24EvidenceTrace',trace);window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args),post=worker.postMessage.bind(worker);worker.postMessage=(request:unknown)=>{trace.push({request:structuredClone(request)});post(request);};worker.addEventListener('message',(event:MessageEvent)=>{trace.push({response:structuredClone(event.data)});if(event.data.ok&&event.data.view)Reflect.set(window,'__b24EvidenceView',structuredClone(event.data.view));if(event.data.ok&&event.data.debrief_answer)Reflect.set(window,'__b24EvidenceAnswer',structuredClone(event.data.debrief_answer));if(event.data.ok&&event.data.evidence_resolution)Reflect.set(window,'__b24EvidenceResolution',structuredClone(event.data.evidence_resolution));});return worker;}});});
  const view=()=>page.evaluate(()=>Reflect.get(window,'__b24EvidenceView'));
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await page.getByRole('button',{name:'下达R前往A',exact:true}).press('Enter');
  await expect.poll(async()=>(await view()).revision).toBe(2);await page.getByLabel('推进到时刻（秒）').fill('31');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect.poll(async()=>(await view()).sim_time).toBe(31000);const arrival=await view();
  await page.getByLabel('推进到时刻（秒）').fill('910');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-result')).toContainText('任务未完成');const final=await view();await page.getByRole('button',{name:'查看复盘',exact:true}).press('Enter');
  await page.getByText('查看当时依据与引用',{exact:true}).press('Enter');await page.getByLabel('依据记录节点').fill(String(arrival.revision));await page.getByRole('button',{name:'查询当时依据',exact:true}).press('Enter');
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24EvidenceAnswer')?.actor)).toBe('HQ');const hq=await page.evaluate(()=>Reflect.get(window,'__b24EvidenceAnswer'));expect(hq.entries.some((entry:any)=>entry.record.phase==='completed')).toBe(false);
  await page.getByLabel('依据所属角色').selectOption('R');await page.getByRole('button',{name:'查询当时依据',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24EvidenceAnswer')?.actor)).toBe('R');
  const local=await page.evaluate(()=>Reflect.get(window,'__b24EvidenceAnswer')),original=local.entries.find((entry:any)=>entry.record.phase==='completed');expect(original).toMatchObject({ref:{kind:'local_observation',recorded_at:{kind:'known',value:30500},received_at:{kind:'unknown'}}});
  await page.getByTestId('debrief-evidence-entry').filter({hasText:'当地观察'}).filter({hasText:'00:30'}).getByRole('button',{name:'定位原始记录',exact:true}).press('Enter');await expect(page.getByTestId('debrief-original-record')).toContainText('只读原始记录');
  expect(await page.evaluate(()=>Reflect.get(window,'__b24EvidenceResolution'))).toMatchObject({status:'answered',history:{run_id:final.run_id,revision:arrival.revision,at:31000,actor:'R',layer:'known_then',read_only:true}});
  await page.getByRole('button',{name:'转到该时点总部记录',exact:true}).press('Enter');await expect.poll(async()=>(await view()).revision).toBe(arrival.revision);expect(await view()).toMatchObject({can_issue:false,actors:arrival.actors,field_reports:arrival.field_reports});await expect(page.getByRole('button',{name:'揭示终局事实',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await expect.poll(async()=>(await view()).revision).toBe(final.revision);expect(await view()).toEqual(final);
  const trace=await page.evaluate(()=>Reflect.get(window,'__b24EvidenceTrace'));expect(trace.some((entry:any)=>entry.request?.kind==='request_outcome_truth')).toBe(false);await import('node:fs/promises').then(fs=>fs.writeFile(info.outputPath('local-reference-original-node-evidence.json'),JSON.stringify({arrival,final,hq,local,trace,not_full_process_recovery:true},null,2),{flag:'wx'}));
});

test('B24 E35 actual keyboard-accessible closed topic selection retains original records and explicitly marks gaps without advancing the finished run',async({page},info)=>{
  page.setDefaultTimeout(8000);
  await page.addInitScript(()=>{const Native=Worker,trace:unknown[]=[];Reflect.set(window,'__b24TopicTrace',trace);window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);worker.addEventListener('message',(event:MessageEvent)=>{trace.push(structuredClone(event.data));if(event.data.ok&&event.data.view)Reflect.set(window,'__b24TopicView',structuredClone(event.data.view));if(event.data.ok&&event.data.debrief_answer)Reflect.set(window,'__b24TopicAnswer',structuredClone(event.data.debrief_answer));});return worker;}});});
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await page.getByRole('button',{name:'下达R前往A',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24TopicView')?.revision)).toBe(2);
  await page.getByLabel('推进到时刻（秒）').fill('910');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('outcome-result')).toContainText('任务未完成');const final=await page.evaluate(()=>Reflect.get(window,'__b24TopicView'));
  await page.getByRole('button',{name:'查看复盘',exact:true}).press('Enter');await page.getByText('查看当时依据与引用',{exact:true}).press('Enter');
  const answers:unknown[]=[];
  for(const topic of ['when_known','evidence','when_delivered','why_wait','cost','contradiction','handover_gap','outcome_vs_evaluation']){
    await page.getByLabel('依据主题').selectOption(topic);await page.getByRole('button',{name:'查询当时依据',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24TopicAnswer')?.topic)).toBe(topic);
    const answer=await page.evaluate(()=>Reflect.get(window,'__b24TopicAnswer'));expect(['answered','insufficient_record']).toContain(answer.status);answers.push(answer);
    if(topic==='cost')await expect(page.getByRole('region',{name:'当时依据查询结果'})).toContainText('资源账目');
    if(answer.status==='insufficient_record')await expect(page.getByRole('region',{name:'当时依据查询结果'})).toContainText('没有这个主题的必要记录');
  }
  await page.getByLabel('依据所属角色').selectOption('R');await page.getByLabel('依据主题').selectOption('cost');await page.getByRole('button',{name:'查询当时依据',exact:true}).press('Enter');
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24TopicAnswer')?.actor)).toBe('R');const localCost=await page.evaluate(()=>Reflect.get(window,'__b24TopicAnswer'));expect(localCost.status).toBe('answered');expect(localCost.entries.every((e:any)=>e.ref.actor_scope==='R'&&e.ref.layer==='known_then'&&e.ref.kind==='ledger')).toBe(true);answers.push(localCost);
  await page.getByTestId('debrief-evidence-entry').first().getByRole('button',{name:'定位原始记录',exact:true}).press('Enter');await expect(page.getByTestId('debrief-original-record').getByRole('heading',{name:'只读原始记录',exact:true})).toBeFocused();await expect(page.getByTestId('debrief-original-record')).toContainText('R · 当时认知');
  expect(await page.evaluate(()=>Reflect.get(window,'__b24TopicView'))).toEqual(final);await expect(page.getByTestId('outcome-truth-facts')).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
  const trace=await page.evaluate(()=>Reflect.get(window,'__b24TopicTrace'));await import('node:fs/promises').then(fs=>fs.writeFile(info.outputPath('eight-topics-current-records-evidence.json'),JSON.stringify({final,answers,trace,not_full_process_recovery:true},null,2),{flag:'wx'}));
});
