import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {observe,trace,view,diagnosticSnapshot,operation} from './local-persistence-observer.mjs';
const owned=process.env.B23_OWNED_HOME??'D:/war-strategy-game/.scratch/b23-intelligence-execution/',label=process.env.B23_NATIVE_LABEL;
if(!/^[a-z0-9-]+$/.test(label??''))throw Error('Unique owned evidence label required');
const origin=process.env.FB01_URL??'http://127.0.0.1:4196',started=Date.now(),receipt={started:new Date().toISOString(),label,origin,rows:[],events:[],default_Windows:true,custom_launch_args:[],claims:'T04 current-runtime command partial-work and research pending-receipt recovery with actual trusted blur/explicit continue; no final CI claim'};
let context,page,launches=0,failure;
const alive=id=>{try{process.kill(id,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
async function launch(executablePath,profile,browser,phase){
  if(++launches>4||Date.now()-started>240000)throw Error('T04 command recovery four-launch/240-second budget reached');
  context=await chromium.launchPersistentContext(profile,{executablePath,headless:false,viewport:{width:1366,height:768},deviceScaleFactor:1,timeout:30000});page=context.pages()[0];page.setDefaultTimeout(15000);await observe(page);
  await page.addInitScript(()=>{window.b23NativeFocusEvents=[];for(const kind of ['focus','blur'])addEventListener(kind,event=>window.b23NativeFocusEvents.push({kind,trusted:event.isTrusted,focused:document.hasFocus(),at:performance.now()}));});
  const row={browser,phase,profile,version:context.browser().version(),errors:[],failed_requests:[]};receipt.rows.push(row);page.on('pageerror',e=>row.errors.push(String(e)));page.on('requestfailed',r=>row.failed_requests.push({url:r.url(),failure:r.failure()}));
  const cdp=await context.browser().newBrowserCDPSession();row.command_line=(await cdp.send('Browser.getBrowserCommandLine')).arguments;await cdp.detach();if(row.command_line.some(a=>/TcpPortRandomizationWin|--proxy-server/.test(a)))throw Error('Default Windows network launch altered');
  await page.goto(origin);await expect(page.getByLabel('演练任务')).toBeVisible();return row;
}
async function close(){
  if(!context)return;const cdp=await context.browser().newBrowserCDPSession(),processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;await cdp.detach();await context.close();context=null;
  await expect.poll(()=>processes.filter(p=>alive(p.id)),{timeout:10000,intervals:[100]}).toEqual([]);receipt.events.push({kind:'all_native_processes_closed',at:new Date().toISOString(),processes});
}
async function custom(kind,activate){
  const before=(await trace(page)).requests.length;await activate();let pair;
  await expect.poll(async()=>{const t=await trace(page),request=t.requests.slice(before).find(r=>r.kind===kind),response=t.responses.find(r=>r.message.request_id===request?.request_id);if(request&&response)pair={request,response};return !!pair;},{timeout:15000,intervals:[100]}).toBe(true);
  expect(pair.response.message).toMatchObject({ok:true,receipt:{kind,result:'committed'}});receipt.events.push({kind:'real_UI_'+kind,pair});return pair.response.message;
}
async function pause(){
  const before=(await trace(page)).requests.length;await page.getByRole('button',{name:'暂停行动',exact:true}).click();let pair;
  await expect.poll(async()=>{const t=await trace(page),request=t.requests.slice(before).find(r=>r.kind==='management_pause'&&r.reason==='manual'),response=t.responses.find(r=>r.message.request_id===request?.request_id);if(request&&response)pair={request,response};return !!pair;},{timeout:15000,intervals:[100]}).toBe(true);
  expect(pair.response.message).toMatchObject({ok:true,view:{paused:true},receipt:{kind:'pause',result:'committed'}});receipt.events.push({kind:'manual_pause_Game_confirmation',pair});
}
const continueRun=()=>operation(page,'continue',()=>page.getByRole('button',{name:'继续行动',exact:true}).click());
try{
  const advance=async(to)=>{await page.getByLabel('推进到时刻（秒）').fill(String(to/1000));return operation(page,'advance',()=>page.getByRole('button',{name:'推进到该时刻',exact:true}).click());};
  for(const[browser,exe,mode]of [['Chrome','D:/war-strategy-game/.scratch/map-b-browser/cft155/chrome-win64/chrome.exe','command'],['Edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','research']]){
    const profile=owned+'profiles/'+label+'-'+browser.toLowerCase();if(fs.existsSync(profile))throw Error('Fresh exact-owned profile required');
    const row=await launch(exe,profile,browser,'initial');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption(mode);await page.getByRole('button',{name:'开始演练',exact:true}).click();await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
    if(mode==='command'){await pause();await operation(page,'rate',()=>page.getByLabel('推进速度').selectOption('4'));}
    await custom('issue_activity',()=>page.getByRole('button',{name:'下达R前往A',exact:true}).click());
    if(mode==='command'){await continueRun();await expect.poll(async()=>(await view(page)).field_activities.some(a=>a.activity==='R-to-A'&&a.status==='completed'),{timeout:20000,intervals:[150]}).toBe(true);await pause();}else await advance(32000);
    await custom('issue_activity',()=>page.getByRole('button',{name:'下达A处记录',exact:true}).click());
    if(mode==='command'){
      const issued=(await view(page)).field_activities.find(a=>a.activity==='A-record').issued_at;await continueRun();await expect.poll(async()=>(await view(page)).sim_time,{timeout:15000,intervals:[150]}).toBeGreaterThanOrEqual(issued+21000);await pause();
    }else await advance(78000);
    await operation(page,'save',()=>page.getByRole('button',{name:'保存行动',exact:true}).click());const saved=await diagnosticSnapshot(page,(await view(page)).run_id),order=saved.state.field.orders.find(o=>o.payload.activity_ref.id==='A-record');expect(saved.snapshot).toEqual(saved.state);
    if(mode==='command'){expect(order.status).toBe('running');expect(order.work_done_ms).toBeGreaterThan(0);expect(order.work_done_ms).toBeLessThan(40000);expect(saved.state.field.actors[0].resources.equipment_energy_reserved).toBe(4);}else{expect(order.status).toBe('completed');expect(saved.state.field.artifacts).toHaveLength(1);expect((await view(page)).artifact_reports).toHaveLength(0);}
    row.saved={run_id:saved.state.run_id,sim_time:saved.state.sim_time,revision:saved.state.revision,integrity:saved.state.integrity,field:saved.state.field,source:saved.state.source,order};await page.screenshot({path:owned+'evidence/'+label+'-'+browser.toLowerCase()+'-saved.png',fullPage:true});await close();
    const reopened=await launch(exe,profile,browser,'same-profile-reopened');await operation(page,'restore',()=>page.getByRole('button',{name:'接手这场演练',exact:true}).click());const resumed=await view(page);expect(resumed).toMatchObject({run_id:row.saved.run_id,sim_time:row.saved.sim_time,paused:true});const restored=await diagnosticSnapshot(page,resumed.run_id);expect(restored.state.field).toEqual(row.saved.field);expect(restored.state.source).toEqual(row.saved.source);expect((await view(page)).sim_time).toBe(row.saved.sim_time);
    if(mode==='command'){
      await continueRun();const other=await context.newPage();await other.goto('about:blank');for(const p of[page,other]){const session=await context.newCDPSession(p);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await session.detach();}await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(true);if((await view(page)).paused)await continueRun();const beforeBlur=(await trace(page)).requests.length;await other.bringToFront();await expect.poll(async()=>(await view(page)).paused,{timeout:10000,intervals:[100]}).toBe(true);const focusEvents=await page.evaluate(()=>window.b23NativeFocusEvents);expect(focusEvents.some(e=>e.kind==='blur'&&e.trusted&&!e.focused)).toBe(true);expect((await trace(page)).requests.slice(beforeBlur).some(r=>r.kind==='management_pause'&&r.reason==='focus_lost')).toBe(true);receipt.events.push({kind:'actual_Game_pause_after_native_blur',browser,view:await view(page),focusEvents});await other.close();await page.bringToFront();await continueRun();await expect.poll(async()=>{const v=await view(page);return v.artifact_reports.length===1&&v.sim_time>=86000;},{timeout:25000,intervals:[150]}).toBe(true);await pause();
    }else{await advance(79000);expect((await view(page)).artifact_reports).toHaveLength(1);await advance(86000);}
    const final=await diagnosticSnapshot(page,resumed.run_id),publicView=await view(page),actor=final.state.field.actors[0];expect(actor.resources).toMatchObject({movement_energy:19,record_energy:16,record_packs:1,durability:97,link_energy:12,link_durability:96,equipment_energy_reserved:0,packs_reserved:0});expect(final.state.field.artifacts).toHaveLength(1);expect(final.state.field.orders.find(o=>o.payload.activity_ref.id==='A-record').terminal_at).toBe(row.saved.order.started_at+45000);expect(final.state.field.reports).toHaveLength(4);expect(final.state.field.deliveries).toHaveLength(4);expect(publicView.artifact_reports).toHaveLength(1);expect(final.state.source.resources).toEqual({energy:16,durability:97,packs:0,energy_reserved:0,packs_reserved:0});
    reopened.final={view:publicView,field:final.state.field,source:final.state.source,integrity:final.state.integrity};reopened.trace=await trace(page);await page.screenshot({path:owned+'evidence/'+label+'-'+browser.toLowerCase()+'-recovered.png',fullPage:true});await close();
  }

}catch(e){failure=String(e);if(page&&!page.isClosed()){await page.screenshot({path:owned+'evidence/'+label+'-failed.png',fullPage:true}).catch(()=>{});try{receipt.failure_trace=await trace(page);const latest=await view(page);receipt.failure_committed_diagnostic=await diagnosticSnapshot(page,latest.run_id);}catch(error){receipt.failure_diagnostic_error=String(error);}}}
finally{
  try{await close();}catch(e){failure=(failure??'')+' cleanup '+String(e);}
  Object.assign(receipt,{finished:new Date().toISOString(),elapsed_ms:Date.now()-started,launches,driver_sha256:crypto.createHash('sha256').update(fs.readFileSync(import.meta.filename)).digest('hex'),failure:failure??null,passed:!failure&&launches===4});fs.writeFileSync(owned+'evidence/'+label+'.json',JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({passed:receipt.passed,launches,elapsed_ms:receipt.elapsed_ms,failure:receipt.failure}));if(!receipt.passed)process.exitCode=1;
}
