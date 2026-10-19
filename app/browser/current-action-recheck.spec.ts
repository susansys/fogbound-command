import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test('UXF E01 E07 current action is reachable before unrelated history at representative viewports',async({page},info)=>{
 const observed=[];
 for(const viewport of [{width:1366,height:768},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);await page.goto('/');
  await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');
  await expect(page.getByLabel('时间方式')).toHaveValue('command');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const action=page.getByRole('region',{name:'当前行动',exact:true});
  await expect(action).toBeVisible();
  const save=action.getByRole('button',{name:'保存准备草案',exact:true});
  const box=await save.boundingBox();expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
  await expect(action.getByLabel('准备目的',{exact:true})).toBeVisible();
  await expect(action).toContainText('草案尚未保存');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await save.focus();await expect(save).toBeFocused();await page.keyboard.press('Shift+Tab');
  await expect(action.getByLabel('准备目的',{exact:true})).toBeFocused();
  observed.push({viewport,save_box:box,scope:'public default-command UI; no task completion or human usability claim'});
 }
 await fs.writeFile(info.outputPath('uxf-current-action-viewports.json'),JSON.stringify(observed,null,2),{flag:'wx'});
});

test('UXF E03 E04 a real stale return arrangement exposes its own original actor and reason without silently issuing again',async({page},info)=>{
 await page.addInitScript(()=>{const witness={requests:[] as Record<string,any>[],replies:[] as Record<string,any>[]};Reflect.set(window,'__uxfReturn',witness);const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker,post=worker.postMessage.bind(worker);if(!String(args[0]).includes('/assets/worker-'))return worker;let held:Record<string,any>|null=null,first=true;worker.postMessage=(request:Record<string,any>)=>{witness.requests.push(structuredClone(request));if(first&&request.envelope?.intent.kind==='return_and_deliver'){first=false;held=request;return;}post(request);};worker.addEventListener('message',(event:MessageEvent)=>{const data=event.data,request=witness.requests.find(r=>r.request_id===data.request_id);if(request)witness.replies.push({request_id:data.request_id,intent:request.envelope?.intent.kind,ok:data.ok,code:data.code});if(held&&String(data.request_id).startsWith('clock-')&&data.ok&&data.view?.run_id===held.envelope.run_id&&data.view.revision>held.envelope.expected_revision){const original=held;held=null;post(original);}});return worker;}});});
 try{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'暂停行动',exact:true}).click();await expect(page.locator('.clock')).toContainText('已暂停');
  await page.getByLabel('推进速度',{exact:true}).selectOption('4');await expect(page.getByLabel('推进速度',{exact:true})).toHaveValue('4');
  await page.getByRole('button',{name:'继续行动',exact:true}).click();
  const source=page.getByRole('button',{name:'查看当前已收资料',exact:true});await expect(source).toBeEnabled({timeout:10000});
  const arrange=page.getByRole('button',{name:'安排W返回交付',exact:true});await arrange.click();await page.getByLabel('返回理由（可选）',{exact:true}).fill('UXF原返回安排理由');await page.getByRole('button',{name:'确认返回交付',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__uxfReturn').replies.some((r:any)=>r.intent==='return_and_deliver'&&!r.ok&&r.code==='STALE_REVISION'))).toBe(true);
  await fs.writeFile(info.outputPath('uxf-return-stale-trigger.json'),JSON.stringify(await page.evaluate(()=>Reflect.get(window,'__uxfReturn')),null,2),{flag:'wx'});
  const open=page.getByRole('button',{name:'查看本次返回安排与当前依据',exact:true});await expect(open).toBeVisible();await open.click();
  const review=page.getByRole('region',{name:'返回安排拒绝复核',exact:true});await expect(review).toContainText('W组');await expect(review).toContainText('UXF原返回安排理由');await expect(review).toContainText('总部最后确认');
  await source.click();
  await expect(page.getByRole('region',{name:'已收原文详情',exact:true})).toBeVisible();await page.getByRole('button',{name:'返回当前行动',exact:true}).click();
  await expect(review).toContainText('UXF原返回安排理由');
  await review.getByRole('button',{name:'返回安排入口',exact:true}).click();await expect(arrange).toBeFocused();
  const witness=await page.evaluate(()=>Reflect.get(window,'__uxfReturn'));expect(witness.requests.filter((r:any)=>r.envelope?.intent.kind==='return_and_deliver')).toHaveLength(1);
 }finally{const witness=await page.evaluate(()=>Reflect.get(window,'__uxfReturn')).catch(()=>null);await fs.writeFile(info.outputPath('uxf-real-return-recheck.json'),JSON.stringify({witness,controlled_technical_probe:true,synthetic_rejection:false},null,2),{flag:'wx'});}
});

test('UXF E05 E06 an unknown committed draft keeps original-operation recovery and cannot unlock definite-rejection recheck',async({page},info)=>{
 await page.addInitScript(()=>{
  const witness={requests:[] as Record<string,any>[],committed:null as Record<string,any>|null,injected:false};Reflect.set(window,'__uxfUnknown',witness);const Native=window.Worker;
  window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;if(!String(args[0]).includes('/assets/worker-'))return worker;return new Proxy(worker,{get(target,key){const value=Reflect.get(target,key,target);if(key==='postMessage')return(request:Record<string,any>)=>{witness.requests.push(structuredClone(request));target.postMessage(request);};return typeof value==='function'?value.bind(target):value;},set(target,key,value){if(key==='onmessage'){target.onmessage=(event:MessageEvent)=>{const data=event.data,request=witness.requests.find(r=>r.request_id===data.request_id);if(!witness.injected&&request?.envelope?.intent.kind==='save_plan'&&data.ok){witness.injected=true;witness.committed={request_id:data.request_id,receipt:data.receipt,plan:data.view?.plan};return value(new MessageEvent('message',{data:{request_id:data.request_id,ok:false,code:'CHANNEL_UNCERTAIN'}}));}return value(event);};return true;}return Reflect.set(target,key,value,target);}});}});
 });
 try{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'暂停行动',exact:true}).click();await expect(page.locator('.clock')).toContainText('已暂停');
  const purpose=page.getByLabel('准备目的',{exact:true});await purpose.fill('UXF未知结果的原准备草案');await page.getByRole('button',{name:'保存准备草案',exact:true}).click();
  await expect(page.getByText('原操作结果待核查，操作编号已保留。',{exact:true})).toBeVisible();
  await expect(purpose).toBeDisabled();await expect(page.getByRole('button',{name:'查看本次提交与当前依据',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'查询原操作',exact:true}).click();
  await expect(page.getByTestId('intelligence-plan')).toContainText('草案第1版');await expect(purpose).toHaveValue('UXF未知结果的原准备草案');await expect(page.locator('.clock')).toContainText('已暂停');
  await expect(page.getByRole('button',{name:'查看本次提交与当前依据',exact:true})).toHaveCount(0);
  const witness=await page.evaluate(()=>Reflect.get(window,'__uxfUnknown')),submits=witness.requests.filter((r:any)=>r.envelope?.intent.kind==='save_plan');expect(witness.injected).toBe(true);expect(submits).toHaveLength(1);expect(witness.committed.receipt.operation_id).toBe(submits[0].envelope.operation_id);expect(witness.requests.some((r:any)=>r.kind==='receipt'&&r.operation_id===submits[0].envelope.operation_id&&r.run_id===submits[0].envelope.run_id)).toBe(true);
 }finally{const witness=await page.evaluate(()=>Reflect.get(window,'__uxfUnknown')).catch(()=>null);await fs.writeFile(info.outputPath('uxf-unknown-original-operation.json'),JSON.stringify({witness,controlled_response_loss:true,synthetic_channel_uncertain:true,natural_walkthrough:false},null,2),{flag:'wx'});}
});

test('UXF E03 E04 real stale rejection keeps the submitted draft distinct from later edits during nearby lawful recheck',async({page},info)=>{
 await page.addInitScript(()=>{
  const witness={requests:[] as Record<string,any>[],replies:[] as Record<string,any>[],released:null as Record<string,any>|null};Reflect.set(window,'__uxfRecheck',witness);
  const Native=window.Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker,post=worker.postMessage.bind(worker);if(!String(args[0]).includes('/assets/worker-'))return worker;let held:Record<string,any>|null=null,first=true;
   worker.postMessage=(request:Record<string,any>)=>{witness.requests.push(structuredClone(request));if(first&&request.envelope?.intent.kind==='save_plan'){first=false;held=request;return;}post(request);};
   worker.addEventListener('message',(event:MessageEvent)=>{const data=event.data,request=witness.requests.find(r=>r.request_id===data.request_id);if(request)witness.replies.push({request_id:data.request_id,kind:request.kind,intent:request.envelope?.intent.kind,ok:data.ok,code:data.code,revision:data.view?.revision});if(held&&String(data.request_id).startsWith('clock-')&&data.ok&&data.view?.run_id===held.envelope.run_id&&data.view.revision>held.envelope.expected_revision){const original=held;held=null;witness.released={operation_id:original.envelope.operation_id,expected_revision:original.envelope.expected_revision,tick_revision:data.view.revision};post(original);}});return worker;}});
 });
 try{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const purpose=page.getByLabel('准备目的',{exact:true});await purpose.fill('UXF本次被拒绝的原提交');await page.getByRole('button',{name:'保存准备草案',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__uxfRecheck').replies.some((r:any)=>r.intent==='save_plan'&&!r.ok&&r.code==='STALE_REVISION'))).toBe(true);
  await fs.writeFile(info.outputPath('uxf-stale-trigger.json'),JSON.stringify(await page.evaluate(()=>Reflect.get(window,'__uxfRecheck')),null,2),{flag:'wx'});
  await purpose.fill('UXF随后编辑且尚未提交');
  await expect(page.getByRole('button',{name:'查看本次提交与当前依据',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看本次提交与当前依据',exact:true}).click();
  const review=page.getByRole('region',{name:'本次拒绝复核',exact:true});await expect(review).toBeVisible();await expect(review).toContainText('UXF本次被拒绝的原提交');await expect(review).toContainText('草案尚未保存');
  const firstClock=await page.locator('.clock strong').innerText();await expect(page.locator('.clock strong')).not.toHaveText(firstClock);await expect(review).toContainText('UXF本次被拒绝的原提交');
  await expect(page.getByRole('alert')).toContainText('情况记录已更新');await expect(purpose).toHaveValue('UXF随后编辑且尚未提交');
  await review.getByRole('button',{name:'返回准备编辑',exact:true}).click();await expect(purpose).toBeFocused();
  const witness=await page.evaluate(()=>Reflect.get(window,'__uxfRecheck'));expect(witness.requests.filter((r:any)=>r.envelope?.intent.kind==='save_plan')).toHaveLength(1);expect(witness.requests.some((r:any)=>r.kind==='management_pause'||['request_preparation','issue_activity','preview_mission'].includes(r.envelope?.intent.kind??r.kind))).toBe(false);expect(witness.released.tick_revision).toBeGreaterThan(witness.released.expected_revision);
 }finally{const witness=await page.evaluate(()=>Reflect.get(window,'__uxfRecheck')).catch(()=>null);await fs.writeFile(info.outputPath('uxf-real-stale-recheck.json'),JSON.stringify({witness,controlled_technical_probe:true,synthetic_rejection:false,natural_walkthrough:false},null,2),{flag:'wx'});}
});

test('UXF E02 E07 explicit source return retains unsaved input and the initiating keyboard context while command time advances',async({page},info)=>{
 await page.setViewportSize({width:1366,height:768});await page.goto('/');
 await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');
 await page.getByRole('button',{name:'开始演练',exact:true}).click();
 const action=page.getByRole('region',{name:'当前行动',exact:true}),purpose=page.getByLabel('准备目的',{exact:true});
 await page.getByLabel('推进速度',{exact:true}).selectOption('4');
 await purpose.fill('UXF保留未提交的准备目的');
 const firstClock=await page.locator('.clock strong').innerText();
 await expect(page.locator('.clock strong')).not.toHaveText(firstClock);
 const source=action.getByRole('button',{name:'查看当前已收资料',exact:true});
 await expect(source).toBeEnabled({timeout:10000});await source.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('region',{name:'已收原文详情',exact:true})).toBeVisible();
 const back=page.getByRole('button',{name:'返回当前行动',exact:true});await back.focus();await page.keyboard.press('Enter');
 await expect(purpose).toHaveValue('UXF保留未提交的准备目的');
 await expect(source).toBeFocused();await expect(page.getByTestId('intelligence-plan')).toContainText('草案尚未保存');
 await expect(page.getByTestId('intelligence-field')).toContainText('每次只下达一个阶段');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await fs.writeFile(info.outputPath('uxf-source-return.json'),JSON.stringify({firstClock,returnedClock:await page.locator('.clock strong').innerText(),dirty:await purpose.inputValue(),focusedReturn:true,scope:'legal source UI only; no submission or human experience claim'},null,2),{flag:'wx'});
});
