import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {nativeDriver,publicView,ownedRecords,ownedProcesses} from './outcome-native-recovery.mjs';

// The caller binds production/controlled-constructor artifacts separately.
// This walk uses the rendered controls and the actual Transport/Worker only.
export async function conflictingRoute(page,{condition,route,expect,info}){
 assert(['operable','faulted'].includes(condition));assert(['inspect','repair'].includes(route));
 const evidence={condition,route,walkthrough:'Agent engineering walkthrough, not human PLAY acceptance',actions:[],notes:['Research mode advances are explicit; command-mode focus/hidden is a separate final obligation.']};
 const current=()=>publicView(page),commit=async name=>{const prior=await current();await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();await page.getByRole('button',{name,exact:true}).press('Enter');await expect.poll(async()=>(await current()).revision).toBeGreaterThan(prior.revision);evidence.actions.push({control:name,view:await current()});await expect(page.getByRole('alert')).toHaveCount(0);};
 const advance=async to=>{await page.getByLabel('推进到时刻（秒）').fill(String(to/1000));await commit('推进到该时刻');expect((await current()).sim_time).toBe(to);};
 const issue=async id=>{const prior=await current();await page.locator('#field-action-'+id).press('Enter');await expect.poll(async()=>(await current()).field_activities.length).toBe(prior.field_activities.length+1);evidence.actions.push({activity:id,view:await current()});};
 const returning=async actor=>{await page.getByRole('button',{name:'安排'+actor+'返回交付',exact:true}).press('Enter');await commit('确认返回交付');};
 await page.getByLabel('演练任务').selectOption('B32-CONFLICTING-ACTION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.locator('#field-action-W-inspect')).toBeEnabled();
 await advance(22000);await expect(page.getByTestId('facility-original-FC1')).toContainText('目前可用');await expect(page.getByTestId('facility-original-FC2')).toContainText('需要维修');
 await page.getByLabel('当前偏好').selectOption('operable');await page.getByLabel('引用设施原文 FC1').check();await commit('保存工作研判');
 await page.getByLabel('准备目的').fill('两处记录与返回交付');await commit('保存准备草案');await issue('R-to-A');await advance(54000);await issue('A-record');await advance(102000);await issue('R-to-B');await advance(112000);
 await page.locator('#current-action-source-return').press('Enter');await page.getByRole('button',{name:/绿色凭证原文/}).press('Enter');const prior=await current();await page.locator('#validate-source-R3').press('Enter');await expect.poll(async()=>(await current()).revision).toBeGreaterThan(prior.revision);await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await commit('提交准备申请');await advance(240000);
 expect((await current()).access.green).toBe('verified');expect((await current()).preparation.status).toBe('approved');
 if(route==='inspect'){
  await issue('W-inspect');await advance(242000);await expect(page.getByTestId('known-action-progress')).toContainText('接令');await advance(257000);const report=(await current()).field_reports.find(row=>row.report.facility_confirmation);expect(report.report.facility_confirmation.condition).toBe(condition);
  const progress=page.getByRole('region',{name:'当前工作进展'}),draft=page.getByLabel('研判理由（可选）');await draft.fill('依据已收到的检查结论重新核对后续');await draft.focus();
  await progress.getByRole('button',{name:'查看相关依据',exact:true}).click();await progress.getByRole('button',{name:'返回原输入位置',exact:true}).press('Enter');await expect(draft).toHaveValue('依据已收到的检查结论重新核对后续');await expect(draft).toBeFocused();
  await page.getByLabel('当前偏好').selectOption(condition);await commit('保存工作研判');expect((await current()).field_activities).toHaveLength(4);
 }
 if(route==='repair'||condition==='faulted'){await issue('W-repair');await advance(route==='inspect'?324000:307000);}
 const recordAt=route==='inspect'?(condition==='operable'?304000:371000):354000;
 await issue('B-record');await advance(recordAt);await returning('W');await returning('R');await advance(593000);
 const final=await current();expect(final).toMatchObject({finished:true,outcome:{result:'success',missing_people:[]}});expect(final.outcome.qualified_artifacts).toHaveLength(2);expect(final.outcome.confirmed_people).toHaveLength(6);expect(final.outcome.finished_at).toBeLessThanOrEqual(593000);
 const cost=route==='inspect'?(condition==='operable'?{energy:2,wear:1,packs:0}:{energy:8,wear:6,packs:2}):{energy:6,wear:5,packs:2};expect(final.actors.find(row=>row.actor==='W')).toMatchObject({equipment_energy:24-cost.energy,durability:100-cost.wear,packs:2-cost.packs});
 evidence.final=final;evidence.expected_work_cost=cost;await page.screenshot({path:info.outputPath(condition+'-'+route+'-complete.png'),fullPage:true});await fs.writeFile(info.outputPath(condition+'-'+route+'-route.json'),JSON.stringify(evidence,null,2)+'\n');return evidence;
}

// Actual installed browsers and the production Worker; only public traffic is
// observed. Physical-state reads are confined to the new owned profile/run.
export async function conflictingRecovery(carrier,{chromium,expect,info,profileRoot,origin}){
 assert.equal(process.platform,'win32');assert(path.isAbsolute(profileRoot));
 assert.equal(origin,'http://127.0.0.1:4202');
 await fs.mkdir(profileRoot,{recursive:true});
 const profile=path.join(profileRoot,randomUUID()),evidence={carrier,origin,profile,profile_retained:true,custom_launch_args:[],network_or_permission_changes:false,mode:'command',nodes:[],started:new Date().toISOString(),passed:false};
 const driver=await nativeDriver(carrier,profile,origin,{chromium,expect});let page;
 const current=()=>publicView(page);
 const commit=async name=>{const prior=await current();await page.getByRole('button',{name,exact:true}).press('Enter');await expect.poll(async()=>(await current())?.revision).toBeGreaterThan(prior.revision);};
 const pause=async()=>{if(!(await current()).paused)await commit('暂停行动');expect((await current()).paused).toBe(true);};
 const resume=async()=>{const before=await current();await commit('继续行动');await expect.poll(async()=>(await current()).sim_time).toBeGreaterThan(before.sim_time);expect((await current()).paused).toBe(false);};
 try{
  page=await driver.open();evidence.executable=driver.executable;evidence.browser_version=driver.version;await page.bringToFront();
  await page.getByLabel('演练任务').selectOption('B32-CONFLICTING-ACTION-01');await expect(page.getByLabel('时间方式')).toHaveValue('command');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.locator('#field-action-W-inspect')).toBeEnabled();
  if((await current()).paused)await resume();
  await page.locator('#field-action-W-inspect').press('Enter');await expect.poll(async()=>(await current()).field_activities.length).toBe(1);
  const issued=(await current()).field_activities[0].issued_at;
  const stages=carrier==='chrome'?[{name:'inspection-working',offset:7000},{name:'conclusion-at-HQ',offset:18000}]:[{name:'accepted-before-work',offset:2500},{name:'local-complete-before-delivery',offset:16000}];
  for(const stage of stages){
   await expect.poll(async()=>(await current()).sim_time,{timeout:30000,intervals:[50]}).toBeGreaterThanOrEqual(issued+stage.offset);await pause();
   const before=await current(),physical=await ownedRecords(page,before.run_id),order=physical.state.task.prefix.field.orders.find(row=>row.payload.activity_ref.id==='W-inspect');
   assert.equal(physical.state.schema,12);assert.equal(physical.state.facility.initial,'faulted');
   if(stage.name==='accepted-before-work'){expect(order.status).toBe('running');expect(order.work_done_ms).toBe(0);expect(order.wear_charged).toBe(false);expect(before.field_reports.filter(row=>row.report.typed_payload.activity_ref.id==='W-inspect').map(row=>row.report.phase)).toEqual(['accepted']);expect(before.actors.find(row=>row.actor==='W')).toMatchObject({equipment_energy:24,durability:100,packs:2});expect(before.sim_time).toBeLessThan(issued+6000);}
   if(stage.name==='inspection-working'){expect(order.work_done_ms).toBeGreaterThan(0);expect(order.work_done_ms).toBeLessThan(10000);}
   if(stage.name==='local-complete-before-delivery'){expect(order.status).toBe('completed');expect(order.work_done_ms).toBe(10000);expect(before.sim_time).toBeLessThan(issued+17000);expect(before.repair_condition.status).toBe('unknown');}
   if(stage.name==='conclusion-at-HQ')expect(before.repair_condition.status).toBe('confirmed_faulted');
   await commit('保存行动');const saved=await current(),records=await ownedRecords(page,saved.run_id),node={stage:stage.name,before,saved,records};evidence.nodes.push(node);
   await page.screenshot({path:info.outputPath(carrier+'-'+stage.name+'-saved.png'),fullPage:true});node.closed_process_tree=await driver.close();expect(ownedProcesses(profile)).toEqual([]);
   page=await driver.open();await page.bringToFront();await page.getByLabel('演练任务').selectOption('B32-CONFLICTING-ACTION-01');await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect.poll(async()=>(await current())?.run_id).toBe(saved.run_id);
   const restored=await current(),after=await ownedRecords(page,saved.run_id);node.restored=restored;node.restored_records=after;
   expect(restored).toMatchObject({run_id:saved.run_id,mode:'command',sim_time:saved.sim_time,paused:true,actors:saved.actors,field_reports:saved.field_reports,repair_condition:saved.repair_condition,conflicting_action:saved.conflicting_action});
   expect(after.state.facility).toEqual(records.state.facility);expect(after.state.task.prefix.field).toEqual(records.state.task.prefix.field);expect(after.state.task.prefix.processing).toEqual(records.state.task.prefix.processing);expect(after.snapshot).toEqual(after.state);
   await page.waitForTimeout(500);expect((await current()).sim_time).toBe(saved.sim_time);expect((await current()).paused).toBe(true);
   await page.screenshot({path:info.outputPath(carrier+'-'+stage.name+'-restored.png'),fullPage:true});await resume();node.explicitly_resumed=await current();
  }
  await expect.poll(async()=>(await current()).repair_condition.status,{timeout:10000}).toBe('confirmed_faulted');await pause();
  const final=await current(),state=(await ownedRecords(page,final.run_id)).state;evidence.final=final;
  expect(state.task.prefix.field.orders.filter(row=>row.payload.activity_ref.id==='W-inspect')).toHaveLength(1);expect(final.actors.find(row=>row.actor==='W')).toMatchObject({equipment_energy:22,durability:99,packs:2});expect(final.field_reports.filter(row=>row.report.typed_payload.activity_ref.id==='W-inspect')).toHaveLength(2);
  evidence.passed=true;
 }catch(error){evidence.failure=String(error);if(page&&!page.isClosed())try{evidence.failure_view=await current();await page.screenshot({path:info.outputPath(carrier+'-failure.png'),fullPage:true});}catch{}throw error;}
 finally{
  try{evidence.final_closed_processes=await driver.close();evidence.remaining_profile_processes=ownedProcesses(profile);expect(evidence.remaining_profile_processes).toEqual([]);}catch(error){evidence.passed=false;evidence.closure_failure=String(error);throw error;}
  finally{evidence.finished=new Date().toISOString();await fs.writeFile(info.outputPath(carrier+'-conflicting-recovery.json'),JSON.stringify(evidence,null,2)+'\n');}
 }
}
