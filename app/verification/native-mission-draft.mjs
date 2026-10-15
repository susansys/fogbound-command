import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {observe,trace,view,keyboardActivate,diagnosticSnapshot} from './corridor-observer.mjs';

const owned='D:/war-strategy-game/.scratch/b22-mission-execution/',origin=process.env.FB01_URL,profile=process.env.B22_PROFILE_DIR,output=process.env.B22_EVIDENCE_DIR,browserName=process.env.B22_BROWSER_NAME,executable=process.env.B22_BROWSER_PATH,buildLabel=process.env.B22_BUILD_LABEL;
if(origin!=='http://127.0.0.1:4196'||![profile,output,os.tmpdir()].every(p=>p&&p.replaceAll('\\','/').startsWith(owned))||!['Chrome','Edge'].includes(browserName)||!executable||!/^[-a-z0-9]+$/.test(buildLabel??''))throw Error('Explicit owned B22 origin/profile/output/D TEMP/build required');
await fs.mkdir(profile);await fs.mkdir(output,{recursive:false});
const repo=path.resolve(import.meta.dirname,'../..'),sha=x=>createHash('sha256').update(x).digest('hex'),started=performance.now();
const evidence={started:new Date().toISOString(),scope:'B22 T01 real native IndexedDB / Worker / complete process close / same-profile restore; no hour gate or full PLAY claim',source_head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:repo,encoding:'utf8'}).trim(),origin,profile,browserName,buildLabel,node:process.version,harness_sha256:sha(await fs.readFile(import.meta.filename)),observer_sha256:sha(await fs.readFile(new URL('./corridor-observer.mjs',import.meta.url))),shared_observer_sha256:sha(await fs.readFile(new URL('./local-persistence-observer.mjs',import.meta.url))),events:[],closed_processes:[]};
let context,page,run;
const alive=id=>{try{process.kill(id,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
async function launch(){
  context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768},deviceScaleFactor:1,timeout:30000});
  evidence.browser_version=context.browser().version();page=context.pages()[0];page.setDefaultTimeout(15000);await observe(page);await page.goto(origin);await expect(page.getByRole('button',{name:'开始演练',exact:true})).toBeVisible();
  evidence.events.push({kind:'launch',utc:new Date().toISOString(),at:performance.now()-started,dpr:await page.evaluate(()=>devicePixelRatio)});
}
async function closeBrowser(){
  const session=await context.browser().newBrowserCDPSession(),processes=(await session.send('SystemInfo.getProcessInfo')).processInfo.map(({id,type})=>({id,type}));await session.detach();
  const at=performance.now()-started;await context.close();context=null;
  await expect.poll(()=>processes.filter(p=>alive(p.id)),{timeout:10000,intervals:[100]}).toEqual([]);
  evidence.closed_processes.push({at,exited_at:performance.now()-started,processes,all_recorded_processes_exited:true});
}
async function state(){const result=await diagnosticSnapshot(page,run);expect(result.state).toEqual(result.snapshot);return result.state;}
async function capture(label){await page.evaluate(()=>document.fonts.ready);const file=path.join(output,label+'.png');await page.screenshot({path:file,fullPage:true});evidence.events.push({label,file,sha256:sha(await fs.readFile(file)),view:await view(page),body:await page.locator('body').innerText()});}
async function action(kind,button){
  const since=(await trace(page)).requests.length;
  await expect(button).toBeEnabled();await keyboardActivate(page,button);
  let pair;
  await expect.poll(async()=>{
    const t=await trace(page),requests=t.requests.slice(since).filter(r=>kind==='restore'?r.kind==='takeover':kind==='save_plan'?r.kind==='save_plan':r.kind==='operate_mission'&&r.envelope?.intent.kind===kind);
    for(const request of requests){const response=t.responses.find(r=>r.message.request_id===request.request_id);if(response){pair={request,response};return true;}}return false;
  },{timeout:15000,intervals:[100]}).toBe(true);
  expect(pair.response.message).toMatchObject({ok:true,receipt:{kind,result:'committed'}});evidence.events.push({kind,pair});return pair;
}
try{
  await launch();await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('command');await keyboardActivate(page,page.getByRole('button',{name:'开始演练',exact:true}));
  await expect(page.getByRole('heading',{name:'结构化任务',exact:true})).toBeVisible();run=(await view(page)).run_id;
  await action('pause',page.getByRole('button',{name:'暂停行动',exact:true}));
  await page.getByLabel('任务目的',{exact:true}).fill('原生浏览器保存的目的');await page.getByLabel('期望结果',{exact:true}).fill('两阶段合法抵达凭证');await page.getByLabel('任务备注（仅供记录）').fill('原profile保存原文；自动维修只是备注');
  await keyboardActivate(page,page.getByRole('button',{name:'预览任务',exact:true}));await expect(page.getByTestId('mission-preview')).toContainText('假设前阶段已确认');
  await action('save_plan',page.getByRole('button',{name:'保存草案',exact:true}));const saved=await state();
  expect(saved.plans).toHaveLength(1);expect(saved.plans[0].draft.phases[1].dependencies[0].id).toBe('P1');expect(saved.world.resources.movement_energy).toBe(20);expect(saved.rng.used).toBe(false);
  evidence.saved=saved;await capture('saved-unissued-draft');
  await action('continue',page.getByRole('button',{name:'继续行动',exact:true}));const t0=(await view(page)).sim_time;
  await page.getByLabel('任务目的',{exact:true}).fill('临时未保存编辑');await expect.poll(async()=>(await view(page)).sim_time,{timeout:10000,intervals:[200]}).toBeGreaterThan(t0+500);
  expect((await state()).plans).toEqual(saved.plans);evidence.editing_keeps_clock_running=true;
  const beforeClose=await state();evidence.before_close=beforeClose;await closeBrowser();
  const closedAt=performance.now();await new Promise(resolve=>setTimeout(resolve,1200));evidence.actual_closed_ms=performance.now()-closedAt;
  await launch();
  const persisted=await state();evidence.after_reopen_before_restore=persisted;
  expect(persisted.run_id).toBe(run);expect(persisted.plans).toEqual(saved.plans);expect(persisted.world).toEqual(saved.world);expect(persisted.rng).toEqual(saved.rng);
  await action('restore',page.getByRole('button',{name:'接手这场演练',exact:true}));const restored=await state();
  expect(restored.run_id).toBe(run);expect(restored.sim_time).toBe(persisted.sim_time);expect(restored.paused).toBe(true);expect(restored.plans).toEqual(persisted.plans);expect(restored.world).toEqual(persisted.world);expect(restored.rng).toEqual(persisted.rng);
  await expect(page.getByLabel('任务目的',{exact:true})).toHaveValue('原生浏览器保存的目的');await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('原profile保存原文；自动维修只是备注');
  const observationStart=performance.now();await new Promise(resolve=>setTimeout(resolve,1600));expect(await state()).toEqual(restored);evidence.paused_observation={elapsed_ms:performance.now()-observationStart,full_state_equal:true};
  await capture('same-profile-restored-paused');
  const other=await context.newPage();await other.goto('about:blank');
  for(const target of [page,other]){const session=await context.newCDPSession(target);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await session.detach();}
  await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);
  await action('continue',page.getByRole('button',{name:'继续行动',exact:true}));await expect.poll(async()=>(await view(page)).sim_time,{timeout:10000,intervals:[200]}).toBeGreaterThan(restored.sim_time+300);
  await other.bringToFront();await expect.poll(()=>other.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);await expect.poll(()=>page.evaluate(()=>!document.hasFocus()||document.hidden)).toBe(true);
  await expect.poll(async()=>(await state()).paused,{timeout:10000,intervals:[200]}).toBe(true);
  const focusState=await state(),events=await page.evaluate(()=>window.b21FocusEvents);expect(events.some(x=>x.trusted&&(x.kind==='blur'||x.kind==='visibilitychange'))).toBe(true);
  await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);await new Promise(resolve=>setTimeout(resolve,1200));expect(await state()).toEqual(focusState);
  evidence.real_focus={events,paused_state:focusState,focus_emulation_disabled:true,return_does_not_resume:true};await other.close();
  await action('continue',page.getByRole('button',{name:'继续行动',exact:true}));await expect.poll(async()=>(await view(page)).sim_time,{timeout:10000,intervals:[200]}).toBeGreaterThan(focusState.sim_time);
  await action('pause',page.getByRole('button',{name:'暂停行动',exact:true}));evidence.final_state=await state();expect(evidence.final_state.plans).toEqual(saved.plans);expect(evidence.final_state.world).toEqual(saved.world);evidence.final_trace=await trace(page);evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error=String(error);evidence.error_stack=error instanceof Error?error.stack:null;if(page&&!page.isClosed())try{evidence.failure_trace=await trace(page);evidence.failure_focus=await page.evaluate(()=>({events:window.b21FocusEvents,hidden:document.hidden,focused:document.hasFocus()}));await page.screenshot({path:path.join(output,'failed.png'),fullPage:true});}catch{}}
finally{if(context)try{await closeBrowser();}catch(error){evidence.passed=false;evidence.cleanup_error=String(error);}evidence.finished=new Date().toISOString();evidence.actual_ms=performance.now()-started;await fs.writeFile(path.join(output,'native-mission-draft.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,browserName,run_id:run,error:evidence.error??null,cleanup_error:evidence.cleanup_error??null,closed_processes:evidence.closed_processes.length,actual_ms:evidence.actual_ms}));}
if(!evidence.passed)process.exitCode=1;
