import {test,expect,chromium} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('B32 E01/E02/E05 the actual Worker preserves conflicting originals while an optional working assessment is saved',async({},info)=>{
 const profileRoot=process.env.B32_OWNED_PROFILE_ROOT??info.outputPath('owned-profiles');
 if(process.platform==='win32'&&!process.env.B32_OWNED_PROFILE_ROOT)throw Error('The admitted absolute B32 profile root is required on Windows');
 const profile=path.join(profileRoot,randomUUID());if(fs.existsSync(profile))throw Error('A fresh owned profile is required');
 const context=await chromium.launchPersistentContext(profile,{...(process.env.FB01_BROWSER?{executablePath:process.env.FB01_BROWSER}:{}),headless:process.env.FB01_HEADED!=='1',viewport:{width:1366,height:768}});
 const page=context.pages()[0],origin=process.env.FB01_URL??'http://127.0.0.1:4175';
 try{
  await page.addInitScript(()=>{const Original=window.Worker;Reflect.set(window,'__b32AssessmentRequests',[]);Object.defineProperty(window,'Worker',{value:class extends Original{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{if(event.data?.view)Reflect.set(window,'__b32CurrentView',event.data.view);if(event.data?.outcome_fairness)Reflect.set(window,'__b32FairnessResponse',event.data.outcome_fairness);});}postMessage(message:unknown){
   if(message&&typeof message==='object'&&Reflect.get(message,'kind')==='operate_conflicting_action'){
    const envelope=Reflect.get(message,'envelope');Reflect.get(window,'__b32AssessmentRequests').push(structuredClone(envelope));
    // Controlled stale-revision fault: a real public save wins the Worker
    // queue first. Neither the engine nor its response is replaced.
    if(Reflect.get(window,'__b32InjectStaleTestOnly')){Reflect.set(window,'__b32InjectStaleTestOnly',false);super.postMessage({request_id:'b32-owned-stale-save',kind:'operate_conflicting_action',envelope:{run_id:envelope.run_id,operation_id:'b32-owned-stale-save',expected_revision:envelope.expected_revision,intent:{kind:'save'}}});}
   }super.postMessage(message);
  }}});});
  await page.goto(origin);
  await expect(page.locator('select[aria-label="演练任务"] option[value="B32-CONFLICTING-ACTION-01"]')).toHaveCount(1);
  await page.getByLabel('演练任务').selectOption('B32-CONFLICTING-ACTION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const panel=page.getByTestId('conflicting-action-workbench');await expect(panel.getByRole('heading',{name:'冲突报告下安排B点作业',exact:true})).toBeVisible();await expect(panel.getByTestId('facility-original-FC1')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b32FairnessResponse'))).toMatchObject({truth_exposure:false,sources:[]});await expect(page.getByRole('button',{name:'重试核对查看记录',exact:true})).toHaveCount(0);
  await page.getByLabel('推进到时刻（秒）').fill('22');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.locator('.clock strong')).toHaveText('00:22');
  await expect(panel.getByTestId('facility-original-FC1')).toContainText('B点设施记录称目前可用，仍需核对');await expect(panel.getByTestId('facility-original-FC2')).toContainText('B点设施记录称需要维修，仍需核对');
  await expect(page.getByRole('region',{name:'总部已知的任务前提'})).toContainText('设施状态尚未核实');
  const before=await page.evaluate(()=>Reflect.get(window,'__b32CurrentView'));
  await panel.getByLabel('当前偏好').selectOption('operable');await panel.getByLabel('研判理由（可选）').fill('先记录一个待核实的假设');await panel.getByLabel('引用设施原文 FC1').check();await panel.getByRole('button',{name:'保存工作研判',exact:true}).press('Enter');
  await expect(panel).toContainText('工作研判第1版已登记');
  const actual=await page.evaluate(()=>Reflect.get(window,'__b32CurrentView'));expect(actual.conflicting_action.assessments).toMatchObject([{preferred:'operable',reason:'先记录一个待核实的假设',basis_refs:[{id:'FC1'}]}]);expect(actual.actors).toEqual(before.actors);expect(actual.processing).toEqual(before.processing);
  await expect(panel.getByTestId('facility-original-FC1')).toBeVisible();await expect(panel.getByTestId('facility-original-FC2')).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  await panel.getByLabel('研判理由（可选）').fill('保留这份尚未提交的输入');
  await page.getByLabel('历史节点').selectOption(String(before.revision));await page.getByRole('button',{name:'查看历史节点',exact:true}).press('Enter');
  await expect(panel.getByLabel('研判理由（可选）')).toHaveValue('保留这份尚未提交的输入');await expect(panel.getByLabel('研判理由（可选）')).toBeDisabled();await expect(panel.getByRole('list',{name:'已保存工作研判'}).getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await expect(panel.getByLabel('研判理由（可选）')).toBeEnabled();await expect(panel.getByLabel('研判理由（可选）')).toHaveValue('保留这份尚未提交的输入');
  await expect(panel.getByRole('list',{name:'已保存工作研判'}).getByRole('listitem')).toHaveCount(1);
  await panel.getByRole('button',{name:'保存工作研判',exact:true}).press('Enter');await expect(panel).toContainText('工作研判第2版已登记');
  await panel.getByLabel('研判理由（可选）').fill('过期拒绝后保留的输入');await page.evaluate(()=>Reflect.set(window,'__b32InjectStaleTestOnly',true));await panel.getByRole('button',{name:'保存工作研判',exact:true}).press('Enter');
  await expect(panel.getByRole('button',{name:'核对最新记录并保留输入',exact:true})).toBeVisible();await expect(panel.getByLabel('研判理由（可选）')).toHaveValue('过期拒绝后保留的输入');await expect(panel.getByRole('list',{name:'已保存工作研判'}).getByRole('listitem')).toHaveCount(2);
  expect(await page.evaluate(()=>Reflect.get(window,'__b32AssessmentRequests').length)).toBe(3);
  await panel.getByRole('button',{name:'核对最新记录并保留输入',exact:true}).press('Enter');await expect(panel.getByRole('button',{name:'保存工作研判',exact:true})).toBeEnabled();await expect(panel.getByLabel('研判理由（可选）')).toHaveValue('过期拒绝后保留的输入');
  expect(await page.evaluate(()=>Reflect.get(window,'__b32AssessmentRequests').length)).toBe(3);
  await panel.getByRole('button',{name:'保存工作研判',exact:true}).press('Enter');await expect(panel).toContainText('工作研判第3版已登记');await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('working-assessment.png'),fullPage:true});await info.attach('lawful-player-view',{body:JSON.stringify(actual,null,2),contentType:'application/json'});
 }finally{
  const cdp=await context.browser()!.newBrowserCDPSession(),processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo as Array<{id:number}>;await cdp.detach();await context.close();
  if(process.platform==='win32')await expect.poll(()=>processes.filter(p=>{try{process.kill(p.id,0);return true;}catch{return false;}}),{timeout:10000}).toEqual([]);
  await info.attach('owned-profile-lifecycle',{body:JSON.stringify({profile,origin,closed:true,processes,default_network_launch:true},null,2),contentType:'application/json'});
 }
});

test('B32 E07/E08/E09/E10 the actual Worker delivers a diagnosis before explicit repair and B record',async({},info)=>{
 const profileRoot=process.env.B32_OWNED_PROFILE_ROOT??info.outputPath('owned-profiles');
 if(process.platform==='win32'&&!process.env.B32_OWNED_PROFILE_ROOT)throw Error('The admitted absolute B32 profile root is required on Windows');
 const profile=path.join(profileRoot,randomUUID());if(fs.existsSync(profile))throw Error('A fresh owned profile is required');
 const context=await chromium.launchPersistentContext(profile,{...(process.env.FB01_BROWSER?{executablePath:process.env.FB01_BROWSER}:{}),headless:process.env.FB01_HEADED!=='1',viewport:{width:1366,height:768}}),page=context.pages()[0],origin=process.env.FB01_URL??'http://127.0.0.1:4175';
 try{
  await page.addInitScript(()=>{const Original=window.Worker;Object.defineProperty(window,'Worker',{value:class extends Original{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{if(event.data?.view)Reflect.set(window,'__b32WorkView',event.data.view);});}}});});
  await page.goto(origin);await page.getByLabel('演练任务').selectOption('B32-CONFLICTING-ACTION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  const actual=()=>page.evaluate(()=>Reflect.get(window,'__b32WorkView'));
  const advance=async(to:number)=>{await page.getByLabel('推进到时刻（秒）').fill(String(to/1000));await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect.poll(async()=>(await actual())?.sim_time).toBe(to);};
  const issue=async(id:string,count:number)=>{await page.locator('#field-action-'+id).press('Enter');await expect.poll(async()=>(await actual())?.field_activities.length).toBe(count);};
  await page.getByLabel('准备目的').fill('取得两处记录并组织交付');await page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter');await expect(page.getByTestId('intelligence-plan')).toContainText('草案第1版');
  await issue('R-to-A',1);await advance(32000);await issue('A-record',2);await advance(80000);await issue('R-to-B',3);await advance(90000);
  await page.locator('#current-action-source-return').press('Enter');await page.getByRole('button',{name:/绿色凭证原文/}).press('Enter');await page.locator('#validate-source-R3').press('Enter');await expect.poll(async()=>(await actual())?.processing.queue.length).toBe(1);
  await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await page.getByRole('button',{name:'提交准备申请',exact:true}).press('Enter');await expect.poll(async()=>(await actual())?.processing.queue.length).toBe(2);await advance(240000);
  expect((await actual()).conflicting_action.assessments).toEqual([]);await issue('W-inspect',4);await advance(256999);
  expect((await actual()).field_reports.filter((item:{report:{typed_payload:{activity_ref:{id:string}}}})=>item.report.typed_payload.activity_ref.id==='W-inspect')).toMatchObject([{report:{phase:'accepted'}}]);expect((await actual()).repair_condition.status).toBe('unknown');
  await advance(257000);await expect(page.getByRole('region',{name:'总部已知的任务前提'})).toContainText('检查确认故障');await expect(page.locator('#field-action-B-record')).toBeDisabled();
  await issue('W-repair',5);await advance(324000);await expect(page.locator('#field-action-B-record')).toBeEnabled();await issue('B-record',6);await advance(371000);
  const view=await actual();expect(view.artifact_reports.find((item:{report:{artifact:{site:string}}})=>item.report.artifact.site==='B').delivery.received).toBe(371000);expect(view.actors.find((actor:{actor:string})=>actor.actor==='W')).toMatchObject({equipment_energy:16,durability:94,packs:0});expect(view.conflicting_action.assessments).toEqual([]);await expect(page.getByRole('alert')).toHaveCount(0);
  await info.attach('lawful-work-view',{body:JSON.stringify(view,null,2),contentType:'application/json'});await page.screenshot({path:info.outputPath('inspection-repair-record.png'),fullPage:true});
 }finally{
  const cdp=await context.browser()!.newBrowserCDPSession(),processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo as Array<{id:number}>;await cdp.detach();await context.close();
  if(process.platform==='win32')await expect.poll(()=>processes.filter(p=>{try{process.kill(p.id,0);return true;}catch{return false;}}),{timeout:10000}).toEqual([]);
  await info.attach('owned-profile-lifecycle',{body:JSON.stringify({profile,origin,closed:true,processes,default_network_launch:true},null,2),contentType:'application/json'});
 }
});
