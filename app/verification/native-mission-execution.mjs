import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {observe,trace,view,keyboardActivate,diagnosticSnapshot} from './corridor-observer.mjs';

const owned='D:/war-strategy-game/.scratch/b22-mission-execution/',origin=process.env.FB01_URL,profile=process.env.B22_PROFILE_DIR,output=process.env.B22_EVIDENCE_DIR,browserName=process.env.B22_BROWSER_NAME,executable=process.env.B22_BROWSER_PATH,buildLabel=process.env.B22_BUILD_LABEL,variant=process.env.B22_NATIVE_CASE;
if(origin!=='http://127.0.0.1:4196'||![profile,output,os.tmpdir()].every(p=>p&&p.replaceAll('\\','/').startsWith(owned))||!['Chrome','Edge'].includes(browserName)||!executable||!/^[-a-z0-9]+$/.test(buildLabel??'')||!['normal','hold','hold_unrelated'].includes(variant))throw Error('Explicit owned native execution contract required');
const browserNetworkArgs=JSON.parse(process.env.B22_BROWSER_NETWORK_ARGS??'[]');
if(!Array.isArray(browserNetworkArgs)||browserNetworkArgs.length>1||browserNetworkArgs.some(arg=>typeof arg!=='string'||!/^--disable-features=(?:[A-Za-z]+,)*TcpPortRandomizationWin$/.test(arg))||browserNetworkArgs.length&&process.platform!=='win32')throw Error('Explicit Windows-only browser network comparison required');
await fs.mkdir(profile);await fs.mkdir(output,{recursive:false});
const repo=path.resolve(import.meta.dirname,'../..'),sha=x=>createHash('sha256').update(x).digest('hex'),started=performance.now();
const evidence={started:new Date().toISOString(),scope:'B22 T03 real native IndexedDB/Worker/Transport, legal execution/receipts and full-process same-profile recovery; no hour/full PLAY claim',variant,source_head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),origin,profile,browserName,buildLabel,browser_network_args:browserNetworkArgs,default_windows_network_acceptance:browserNetworkArgs.length===0,node:process.version,harness_sha256:sha(await fs.readFile(import.meta.filename)),observer_sha256:sha(await fs.readFile(new URL('./corridor-observer.mjs',import.meta.url))),events:[],closed_processes:[],checkpoints:[]};
let context,page,run;
const alive=id=>{try{process.kill(id,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
async function launch(){
  context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768},deviceScaleFactor:1,args:browserNetworkArgs,timeout:30000});evidence.browser_version=context.browser().version();page=context.pages()[0];page.setDefaultTimeout(15000);await observe(page);await page.goto(origin);await expect(page.getByRole('button',{name:'开始演练',exact:true})).toBeVisible();
}
async function closeBrowser(){const session=await context.browser().newBrowserCDPSession(),processes=(await session.send('SystemInfo.getProcessInfo')).processInfo.map(({id,type})=>({id,type}));await session.detach();const at=performance.now()-started;await context.close();context=null;await expect.poll(()=>processes.filter(p=>alive(p.id)),{timeout:10000,intervals:[100]}).toEqual([]);evidence.closed_processes.push({at,exited_at:performance.now()-started,processes,all_recorded_processes_exited:true});}
async function state(){const current=await diagnosticSnapshot(page,run);expect(current.state).toEqual(current.snapshot);return current.state;}
async function action(kind,button,fast=false){
  const since=(await trace(page)).requests.length;await expect(button).toBeEnabled();if(fast)await button.press('Enter');else await keyboardActivate(page,button);let pair;
  await expect.poll(async()=>{const t=await trace(page),requests=t.requests.slice(since).filter(r=>kind==='restore'?r.kind==='takeover':['save_plan','issue_mission'].includes(kind)?r.kind===kind:r.kind==='operate_mission'&&r.envelope?.intent.kind===kind);for(const request of requests){const response=t.responses.find(r=>r.message.request_id===request.request_id&&r.message.ok);if(response){pair={request,response};return true;}}return false;},{timeout:15000,intervals:[50]}).toBe(true);
  expect(pair.response.message).toMatchObject({ok:true,receipt:{kind,result:'committed'}});evidence.events.push({kind,pair});return pair;
}
async function capture(label){await page.evaluate(()=>document.fonts.ready);const file=path.join(output,label+'.png');await page.screenshot({path:file,fullPage:true});evidence.events.push({label,file,sha256:sha(await fs.readFile(file)),view:await view(page),body:await page.locator('body').innerText()});}
async function issue(id){await keyboardActivate(page,page.getByRole('button',{name:'核对当前阶段',exact:true}));await action('issue_mission',page.getByRole('button',{name:'确认下达 '+id,exact:true}));}
async function pause(fast=false){await action('pause',page.getByRole('button',{name:'暂停行动',exact:true}),fast);}
async function resume(){await action('continue',page.getByRole('button',{name:'继续行动',exact:true}));}
async function recover(label){
  const before=await state();expect(before.paused).toBe(true);await closeBrowser();await new Promise(resolve=>setTimeout(resolve,1100));await launch();const reopened=await state();expect(reopened).toEqual(before);
  await action('restore',page.getByRole('button',{name:'接手这场演练',exact:true}));const restored=await state();expect(restored.paused).toBe(true);
  for(const key of ['sim_time','mode','rate','run_id','source_run','rng','generation','origin_generation','phase','actual_mission_status','world','local','attempts','executions','reports','sent_reports','pending_reports','transmissions','deliveries','outbound_messages','held_windows','mission','plans','known'])expect(restored[key]).toEqual(before[key]);
  await new Promise(resolve=>setTimeout(resolve,1300));expect(await state()).toEqual(restored);evidence.checkpoints.push({label,before,reopened,restored,paused_full_state_equal:true,explicit_continue_required:true});await capture(label+'-restored-paused');
}
async function rpc(request){return page.evaluate(request=>new Promise((resolve,reject)=>{const worker=window.fpPersistenceTrace.worker,id=crypto.randomUUID(),timer=setTimeout(()=>{worker.removeEventListener('message',receive);reject(Error('Actual public request timeout'));},10000);function receive(event){if(event.data.request_id!==id)return;clearTimeout(timer);worker.removeEventListener('message',receive);resolve(event.data);}worker.addEventListener('message',receive);worker.postMessage({...request,request_id:id});}),request);}
try{
  await launch();await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('command');await keyboardActivate(page,page.getByRole('button',{name:'开始演练',exact:true}));await expect(page.getByRole('heading',{name:'结构化任务',exact:true})).toBeVisible();run=(await view(page)).run_id;await pause();const base=(await state()).sim_time;evidence.base_sim_time=base;
  for(const [phase,earliest,latest] of [[1,base+2500,base+33000],[2,base+35000,base+95000]]){await page.getByLabel(`阶段 ${phase} 最早开始`).fill(String(earliest));await page.getByLabel(`阶段 ${phase} 最晚结束`).fill(String(latest));}
  await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');await page.getByLabel('期望结果',{exact:true}).fill('总部收到合法抵达凭证');await keyboardActivate(page,page.getByRole('button',{name:'预览任务',exact:true}));await expect(page.getByTestId('mission-preview')).toBeVisible();await action('save_plan',page.getByRole('button',{name:'保存草案',exact:true}));
  if(variant!=='normal'){
    // Save an ordinary valid structured draft through the real public Worker.
    // No State, Report, Delivery or clock is inserted into native IndexedDB.
    const current=await view(page),draft=structuredClone(current.plans[0].draft);draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    if(variant==='hold_unrelated'){draft.phases[1].dependencies=[];draft.phases[1].earliest_start_time_ms=base+60000;draft.phases[1].latest_finish_time_ms=base+90000;draft.routes[1].path=[[50,150],[150,150]];}
    // T04 preserves stable object identity even before signing. This second
    // saved draft changes P1's gate and P2's dependency (or route/window), so
    // use genuine new versions instead of reusing the first saved identities.
    draft.phases[0].version=2;draft.phases[1].version=2;
    if(variant==='hold_unrelated'){draft.routes[1].version=2;draft.phases[1].activity.route_ref.version=2;}
    else draft.phases[1].dependencies[0].version=2;
    const preview=await rpc({kind:'preview_mission',run_id:run,revision:current.revision,editing_seq:1,draft});expect(preview.ok).toBe(true);
    const saved=await rpc({kind:'save_plan',envelope:{run_id:run,operation_id:crypto.randomUUID(),expected_revision:current.revision,intent:{kind:'save_plan',base_plan_ref:current.mission.current_plan_ref,expected_object_revision:current.mission.object_revision,draft}}});expect(saved.ok).toBe(true);evidence.public_gate_draft={preview,saved};await recover('saved-before-hold');
  }
  await issue('P1');const initial=await state();expect(initial.orders).toHaveLength(1);expect(initial.world.resources.movement_energy).toBe(20);expect(initial.world.resources.hq_energy).toBe(15);
  if(variant==='normal')await recover('held');
  if(variant==='hold_unrelated'){await resume();await expect.poll(()=>page.evaluate(()=>window.fpPersistenceTrace.view.sim_time),{timeout:10000,intervals:[25]}).toBeGreaterThanOrEqual(base+1100);await pause(true);await issue('P2');expect((await view(page)).issued_orders[1].status).toBe('sent');}
  await resume();
  if(variant!=='normal'){
    await expect.poll(async()=>{const s=await state();return s.attempts[0]?.status;},{timeout:15000,intervals:[80]}).toBe('gate_hold');await pause();const held=await state();expect(held.executions).toHaveLength(0);expect(held.attempts[0].accept_until-held.attempts[0].checked).toBe(5000);await recover('hold');await resume();
    await expect.poll(async()=>(await view(page)).issued_orders[0].status,{timeout:15000,intervals:[80]}).toBe('not_started');await pause();const stopped=await state();expect(stopped.reports).toHaveLength(2);expect(stopped.world.resources).toMatchObject({movement_energy:20,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98,hq_energy:variant==='hold_unrelated'?14:15});
    await expect(page.getByRole('button',{name:'准备 P1 新版本重试',exact:true})).toBeEnabled();if(variant==='hold_unrelated'){expect(stopped.orders[1].status).toBe('sent');evidence.unrelated_order_does_not_lock_retry=true;await capture('unrelated-future-order-allows-retry');}else{await keyboardActivate(page,page.getByRole('button',{name:'准备 P1 新版本重试',exact:true}));await expect(page.getByTestId('mission-save-state')).toContainText('有未保存编辑');
    const earliest=stopped.sim_time+1500;await page.getByLabel('阶段 1 最早开始').fill(String(earliest));await page.getByLabel('阶段 1 最晚结束').fill(String(earliest+30000));await keyboardActivate(page,page.getByRole('button',{name:'预览任务',exact:true}));await expect(page.getByRole('button',{name:'保存草案',exact:true})).toBeEnabled();await action('save_plan',page.getByRole('button',{name:'保存草案',exact:true}));await issue('P1');const retried=await state();expect(retried.orders[0]).toEqual(stopped.orders[0]);expect(retried.orders[1].phase_ref.version).toBe(3);expect(retried.orders[1].plan_ref.version).toBe(3);await resume();
    await expect.poll(async()=>(await view(page)).issued_orders[1].status,{timeout:45000,intervals:[100]}).toBe('arrived');await pause();const result=await state();expect(result.reports).toHaveLength(4);expect(result.orders).toHaveLength(2);expect(result.world.resources).toMatchObject({movement_energy:19,movement_energy_reserved:0,equipment_energy:12,equipment_wear:96,hq_energy:14});expect(result.orders[0]).toEqual(stopped.orders[0]);expect(result.reports.slice(0,2)).toEqual(stopped.reports);evidence.retry_result=result;await capture('legal-unstarted-retry-arrived');}
  }else{
    await expect.poll(async()=>(await state()).sim_time,{timeout:15000,intervals:[100]}).toBeGreaterThan(base+4500);await pause();expect((await state()).executions[0].status).toBe('moving');await recover('moving');
    // This bounded driver clicks the actual UI pause after a real committed
    // Worker view crosses the registered arrival time. It avoids Node/CDP
    // polling latency in the one-second inflight window; it never edits time,
    // state or protocol responses. Other controls use real Tab/Enter, and the
    // separate focus test requires trusted native blur/visibility events.
    await page.evaluate(({run,at})=>{
      const worker=window.fpPersistenceTrace.worker,observation={at,clicked:false};window.b22InflightPause=observation;
      function receive(event){const v=event.data?.view;if(!event.data?.ok||!v||v.run_id!==run||v.paused||v.sim_time<at)return;worker.removeEventListener('message',receive);observation.observed_time=v.sim_time;observation.observed_revision=v.revision;setTimeout(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='暂停行动');if(button&&!button.disabled){observation.clicked=true;observation.page_now=performance.now();button.click();}},0);}
      worker.addEventListener('message',receive);
    },{run,at:base+32000});await resume();
    await expect.poll(async()=>(await state()).paused,{timeout:40000,intervals:[100]}).toBe(true);evidence.inflight_pause_driver=await page.evaluate(()=>window.b22InflightPause);expect(evidence.inflight_pause_driver.clicked).toBe(true);
    const inflight=await state();expect(inflight.executions[0].status).toBe('arrived');expect(inflight.reports.map(r=>r.kind)).toEqual(['accepted','arrived']);expect(inflight.orders[0].status).toBe('accepted');expect(inflight.deliveries).toHaveLength(1);expect((await view(page)).phase_results).toHaveLength(0);await recover('report-inflight');await resume();
    await expect.poll(async()=>(await view(page)).issued_orders[0].status,{timeout:10000,intervals:[100]}).toBe('arrived');await pause(true);await issue('P2');
    const other=await context.newPage();await other.goto('about:blank');for(const target of [page,other]){const session=await context.newCDPSession(target);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await session.detach();}await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);await resume();await expect.poll(async()=>(await state()).executions.length,{timeout:10000,intervals:[100]}).toBe(2);await other.bringToFront();await expect.poll(()=>other.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);await expect.poll(async()=>(await state()).paused,{timeout:10000,intervals:[100]}).toBe(true);const focus=await state(),events=await page.evaluate(()=>window.b21FocusEvents);expect(events.some(x=>x.trusted&&(x.kind==='blur'||x.kind==='visibilitychange'))).toBe(true);await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);await new Promise(resolve=>setTimeout(resolve,1100));expect(await state()).toEqual(focus);evidence.real_focus={events,focus_emulation_disabled:true,paused_state:focus,return_does_not_resume:true};await other.close();await resume();
    await expect.poll(async()=>(await view(page)).mission.status,{timeout:45000,intervals:[100]}).toBe('completed');await pause();const final=await state();expect(final.orders).toHaveLength(2);expect(final.reports).toHaveLength(4);expect(final.deliveries).toHaveLength(4);expect(final.known.phase_confirmations).toHaveLength(2);expect(final.world.resources).toMatchObject({movement_energy:18,movement_energy_reserved:0,equipment_energy:12,equipment_wear:96,hq_energy:14,hq_wear:98});expect(final.finished).toBe(false);expect(final.rng).toEqual(initial.rng);evidence.goal_result=final;await capture('two-phase-goal-confirmed');
  }
  evidence.final_trace=await trace(page);evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error=String(error);evidence.error_stack=error instanceof Error?error.stack:null;if(page&&!page.isClosed())try{evidence.failure_trace=await trace(page);evidence.failure_state=run?await state():null;await page.screenshot({path:path.join(output,'failed.png'),fullPage:true});}catch{}}
finally{if(context)try{await closeBrowser();}catch(error){evidence.passed=false;evidence.cleanup_error=String(error);}evidence.finished=new Date().toISOString();evidence.actual_ms=performance.now()-started;await fs.writeFile(path.join(output,'native-mission-execution.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,browserName,variant,run_id:run,error:evidence.error??null,cleanup_error:evidence.cleanup_error??null,closed_processes:evidence.closed_processes.length,actual_ms:evidence.actual_ms}));}
if(!evidence.passed)process.exitCode=1;
