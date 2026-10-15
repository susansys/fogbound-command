import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {observe,trace,view,keyboardActivate,operation,diagnosticSnapshot} from './local-persistence-observer.mjs';

const origin=process.env.FB01_URL,profile=process.env.FP_PROFILE_DIR,output=process.env.FP_EVIDENCE_DIR,executable=process.env.FP_BROWSER_PATH,browserName=process.env.FP_BROWSER_NAME;
const owned='D:/war-strategy-game/.scratch/fp-persistence-evidence/';
if(!['http://127.0.0.1:4192','http://127.0.0.1:4193'].includes(origin)||![profile,output].every(p=>p&&p.replaceAll('\\','/').startsWith(owned))||!['Chrome','Edge'].includes(browserName)||!executable)throw Error('Explicit approved owned native environment required');
const repo=path.resolve(import.meta.dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),start=performance.now();
const focusCase=process.env.FP_FOCUS_CASE==='1';
const evidence={evidence_id:'FP-PC01-04-11'+(focusCase?'-12':'')+'-'+browserName+'-'+Date.now(),started:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),design:'1f02574a95a497223b37f0ad6c7ca157a0019bf499ee4edff99a9114e60cc71a',origin,profile,browserName,node:process.version,platform:process.platform,harness_sha256:sha(await fs.readFile(import.meta.filename)),observer_sha256:sha(await fs.readFile(new URL('./local-persistence-observer.mjs',import.meta.url))),events:[],closed_processes:[],observations:[]};
let context,page;
const alive=id=>{try{process.kill(id,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
const elapsed=()=>performance.now()-start;
async function launch(){
  context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:process.env.FP_HEADED!=='1',viewport:{width:1366,height:768},timeout:30000});
  evidence.browser=context.browser().version();page=context.pages()[0];page.setDefaultTimeout(30000);await observe(page);
  await page.addInitScript(()=>{window.fpFocusEvents=[];for(const kind of['blur','focus','visibilitychange']){(kind==='visibilitychange'?document:window).addEventListener(kind,event=>window.fpFocusEvents.push({kind,trusted:event.isTrusted,hidden:document.hidden,focused:document.hasFocus(),at:performance.now()}));}});
  await page.goto(origin);await expect(page.getByRole('button',{name:'开始演练',exact:true})).toBeVisible();
}
async function closeBrowser(){
  const session=await context.browser().newBrowserCDPSession(),processes=(await session.send('SystemInfo.getProcessInfo')).processInfo.map(({id,type})=>({id,type}));await session.detach();
  const closedAt=performance.now();await context.close();context=null;
  await expect.poll(()=>processes.filter(p=>alive(p.id)),{timeout:10000,intervals:[100]}).toEqual([]);
  evidence.closed_processes.push({processes,all_recorded_processes_exited:true,closed_elapsed:closedAt-start,exit_confirmed_elapsed:elapsed()});
}
async function readState(){const result=await diagnosticSnapshot(page,(await view(page)).run_id);expect(result.state).toEqual(result.snapshot);return result.state;}
function assertRestore(before,pair,after){
  const receipt=pair.response.message.receipt;expect(receipt).toMatchObject({run_id:before.run_id,snapshot_revision:before.revision,revision:before.revision+1,sim_time:before.sim_time,kind:'restore'});
  for(const key of Object.keys(before).filter(k=>!['revision','inputs','integrity'].includes(k)))expect(after[key],`unchanged actual saved field ${key}`).toEqual(before[key]);
  expect(after.revision).toBe(before.revision+1);expect(after.inputs.slice(0,-1)).toEqual(before.inputs);expect(after.inputs.at(-1).envelope).toMatchObject({run_id:before.run_id,operation_id:receipt.operation_id,expected_revision:before.revision,intent:{kind:'restore',snapshot_revision:before.revision}});
}
async function pausedObservation(label,before){
  const at=performance.now();await new Promise(resolve=>setTimeout(resolve,5100));const after=await readState();expect(after).toEqual(before);evidence.observations.push({label,elapsed_ms:performance.now()-at,same_full_committed_snapshot:true,sim_time:after.sim_time,revision:after.revision});
}
async function capture(label){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});const file=path.join(output,label+'.png');await page.screenshot({path:file,fullPage:true});evidence.events.push({label,at:elapsed(),file,sha256:sha(await fs.readFile(file)),view:await view(page),text:await page.locator('body').innerText()});}
async function realFocusPause(){
  const other=await context.newPage();await other.goto('about:blank');
  for(const target of[page,other]){const session=await context.newCDPSession(target);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await session.detach();}
  await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);
  const since=(await trace(page)).requests.length;await other.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.hidden||!document.hasFocus())).toBe(true);await expect.poll(()=>other.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);
  let pair;await expect.poll(async()=>{const t=await trace(page);for(const request of t.requests.slice(since).filter(r=>r.kind==='operate'&&r.envelope.intent.kind==='pause'&&['focus_lost','application_hidden'].includes(r.envelope.intent.reason))){const response=t.responses.find(r=>r.message.request_id===request.request_id&&r.message.ok&&r.message.receipt?.result==='committed');if(response)pair={request,response};}return !!pair;},{timeout:10000,intervals:[100]}).toBe(true);
  expect(pair.response.message.receipt).toMatchObject({kind:'pause',operation_id:pair.request.envelope.operation_id});await expect(page.getByRole('button',{name:'继续',exact:true})).toBeEnabled();
  const paused=await readState();expect(paused.paused).toBe(true);expect((await view(page)).finished).toBe(false);
  evidence.real_focus={emulation_disabled_on_both:true,pair,game:await page.evaluate(()=>({focused:document.hasFocus(),hidden:document.hidden,events:window.fpFocusEvents})),other:await other.evaluate(()=>({focused:document.hasFocus(),hidden:document.hidden})),state:paused};expect(evidence.real_focus.game.events.some(e=>e.trusted&&(e.kind==='blur'||e.kind==='visibilitychange'))).toBe(true);
  await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus()&&!document.hidden)).toBe(true);expect(await readState()).toEqual(paused);await pausedObservation('returned after real focus loss remains paused',paused);await capture('real-focus-return-paused');await other.close();
  evidence.real_focus.continue=await operation(page,'continue',()=>keyboardActivate(page,page.getByRole('button',{name:'继续',exact:true})));
}
try{
  await fs.mkdir(output,{recursive:true});await fs.mkdir(profile,{recursive:true});if((await fs.readdir(profile)).length)throw Error('Initial synthetic profile must be empty; retain any earlier attempt');
  const html=await(await fetch(origin)).text(),entry=html.match(/src="([^"]+\.js)"/)?.[1];if(!entry)throw Error('Missing actual candidate');evidence.artifact={html:sha(html),main:sha(Buffer.from(await(await fetch(new URL(entry,origin))).arrayBuffer()))};
  await launch();await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.locator('.map')).toHaveAttribute('data-region-state','ready');
  await page.getByRole('button',{name:'拟定记录任务',exact:true}).click();await page.getByRole('button',{name:'查看记录预案',exact:true}).click();await page.getByRole('button',{name:'下达记录任务',exact:true}).click();
  const issued=await operation(page,'issue',()=>page.getByRole('button',{name:'确认下达',exact:true}).click()),initial=issued.response.message.view;expect(initial.issued_orders).toHaveLength(1);const I=initial.issued_orders[0].issued;evidence.issue=issued;evidence.expected={issue:I,complete:I+46000,received:I+47000,resources:{hq_energy:15,hq_wear:99,equipment_energy:13,equipment_wear:97,record_energy:16,record_wear:97,record_packs:1}};
  await expect.poll(async()=>(await view(page)).sim_time,{timeout:30000,intervals:[100]}).toBeGreaterThanOrEqual(I+20000);
  const save=await operation(page,'save',()=>keyboardActivate(page,page.getByRole('button',{name:'保存记录',exact:true})));evidence.save=save;
  await expect(page.getByRole('status')).toContainText('已保存至');
  await expect.poll(async()=>(await view(page)).sim_time,{timeout:10000,intervals:[100]}).toBeGreaterThan(save.response.message.receipt.sim_time);
  const pause=await operation(page,'pause',()=>keyboardActivate(page,page.getByRole('button',{name:'暂停',exact:true})));evidence.pause=pause;
  const before=await readState();expect(before.paused).toBe(true);expect(before.revision).toBeGreaterThan(save.response.message.receipt.revision);expect(before.sim_time).toBeGreaterThan(save.response.message.receipt.sim_time);evidence.before_close=before;evidence.before_close_trace=await trace(page);await capture('before-original-profile-exit');
  await closeBrowser();const closed=performance.now();await new Promise(resolve=>setTimeout(resolve,5100));evidence.closed_observation_ms=performance.now()-closed;
  await launch();await expect(page.getByText(/最新进度.*手动保存/)).toBeVisible();
  const restore1=await operation(page,'restore',()=>keyboardActivate(page,page.getByRole('button',{name:'接手这场演练',exact:true}))),restored1=await readState();assertRestore(before,restore1,restored1);evidence.restore1={pair:restore1,state:restored1};await pausedObservation('first restored paused window',restored1);await capture('first-natural-takeover');
  await closeBrowser();await launch();
  const restore2=await operation(page,'restore',()=>keyboardActivate(page,page.getByRole('button',{name:'接手这场演练',exact:true}))),restored2=await readState();assertRestore(restored1,restore2,restored2);evidence.restore2={pair:restore2,state:restored2};await pausedObservation('second restored paused window',restored2);
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?768:1080});await capture('paused-natural-reopen-'+width);}
  evidence.continue=await operation(page,'continue',()=>keyboardActivate(page,page.getByRole('button',{name:'继续',exact:true})));
  if(focusCase)await realFocusPause();
  await expect.poll(async()=>(await view(page)).finished,{timeout:30000,intervals:[100]}).toBe(true);
  const completed=await view(page),state=await readState();expect(completed.run_id).toBe(before.run_id);expect(completed.artifacts).toHaveLength(1);expect(completed.artifacts[0].completed).toBe(I+46000);expect(completed.resources).toMatchObject(evidence.expected.resources);expect(completed.log.filter(row=>row.kind==='complete_receipt')).toHaveLength(1);expect(completed.log.find(row=>row.kind==='complete_receipt').at).toBe(I+47000);await expect(page.locator('.bottom-log').getByText(/记录成果回报已收到/)).toHaveCount(1);expect(state.rng).toEqual(before.rng);expect(state.world.record_artifacts).toHaveLength(1);evidence.completed={view:completed,state};await capture('unique-natural-completion');
  await keyboardActivate(page,page.getByRole('button',{name:'行动复盘',exact:true}));await page.getByLabel('回看时刻（秒）').fill('0');await keyboardActivate(page,page.getByRole('button',{name:'查看当时情况',exact:true}));await expect(page.getByText('历史记录 · 只读',{exact:true})).toBeVisible();expect(await page.getByRole('button',{name:'保存记录',exact:true}).count()).toBe(0);expect(await page.getByRole('button',{name:'继续',exact:true}).count()).toBe(0);await capture('keyboard-readonly-history');await keyboardActivate(page,page.getByRole('button',{name:'返回当前行动',exact:true}));await expect(page.locator('.clock')).toContainText('任务完成');evidence.keyboard_history=true;
  expect(elapsed()).toBeLessThanOrEqual(180000);evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error=String(error);if(page&&!page.isClosed()){try{evidence.failure_trace=await trace(page);await page.screenshot({path:path.join(output,'failed.png'),fullPage:true});}catch{}}}
finally{if(context){try{await closeBrowser();}catch(error){evidence.passed=false;evidence.cleanup_error=String(error);}}evidence.finished=new Date().toISOString();evidence.total_monotonic_ms=elapsed();await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'native-local-persistence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({evidence_id:evidence.evidence_id,passed:evidence.passed,total_ms:evidence.total_monotonic_ms,error:evidence.error??null,cleanup_error:evidence.cleanup_error??null,recorded_process_exits:evidence.closed_processes.length}));}
if(!evidence.passed)process.exitCode=1;
