import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {observe,trace,view,keyboardActivate,diagnosticSnapshot,operation} from './local-persistence-observer.mjs';
const owned=process.env.B23_OWNED_HOME??'D:/war-strategy-game/.scratch/b23-intelligence-execution/';
const label=process.env.B23_NATIVE_LABEL;if(!/^[a-z0-9-]+$/.test(label??''))throw Error('Unique owned evidence label required');
const origin=process.env.FB01_URL??'http://127.0.0.1:4196',started=Date.now(),receipt={started:new Date().toISOString(),label,origin,rows:[],events:[],default_Windows:true,custom_launch_args:[],claims:'T01 source recovery only; not whole B23/final experience'};
let context,page,launches=0,failure;
const alive=id=>{try{process.kill(id,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
async function launch(executablePath,profile,browser,phase){
  if(++launches>4||Date.now()-started>240000)throw Error('T01 native four-launch/240-second budget reached');
  context=await chromium.launchPersistentContext(profile,{executablePath,headless:false,viewport:{width:1366,height:768},deviceScaleFactor:1,timeout:30000});
  page=context.pages()[0];page.setDefaultTimeout(15000);await observe(page);
  await page.addInitScript(()=>{window.b23NativeFocusEvents=[];for(const kind of ['focus','blur'])addEventListener(kind,event=>window.b23NativeFocusEvents.push({kind,trusted:event.isTrusted,focused:document.hasFocus(),at:performance.now()}));});
  const row={browser,phase,profile,version:context.browser().version(),errors:[],failed_requests:[]};receipt.rows.push(row);
  page.on('pageerror',e=>row.errors.push(String(e)));page.on('requestfailed',r=>row.failed_requests.push({url:r.url(),failure:r.failure()}));
  const cdp=await context.browser().newBrowserCDPSession();row.command_line=(await cdp.send('Browser.getBrowserCommandLine')).arguments;await cdp.detach();
  if(row.command_line.some(a=>/TcpPortRandomizationWin|--proxy-server/.test(a)))throw Error('Default Windows network launch altered');
  await page.goto(origin);await expect(page.getByLabel('演练任务')).toBeVisible();return row;
}
async function close(){
  if(!context)return;const cdp=await context.browser().newBrowserCDPSession(),processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;await cdp.detach();
  await context.close();context=null;await expect.poll(()=>processes.filter(p=>alive(p.id)),{timeout:10000,intervals:[100]}).toEqual([]);
  receipt.events.push({kind:'all_native_processes_closed',at:new Date().toISOString(),processes});
}
async function manualPause(){
  const before=(await trace(page)).requests.length;
  await page.getByRole('button',{name:'暂停行动',exact:true}).click();let pair;
  await expect.poll(async()=>{const t=await trace(page),request=t.requests.slice(before).find(r=>r.kind==='management_pause'&&r.reason==='manual'),response=t.responses.find(r=>r.message.request_id===request?.request_id);if(request&&response)pair={request,response};return !!pair;},{timeout:15000,intervals:[100]}).toBe(true);
  expect(pair.response.message).toMatchObject({ok:true,view:{paused:true}});if(pair.response.message.receipt)expect(pair.response.message.receipt).toMatchObject({kind:'pause',result:'committed'});
  receipt.events.push({kind:'manual_pause_Game_confirmation',pair});return pair;
}
try{
  for(const[browser,exe,target]of [['Chrome','D:/war-strategy-game/.scratch/map-b-browser/cft155/chrome-win64/chrome.exe',40000],['Edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',65001]]){
    const profile=owned+'profiles/'+label+'-'+browser.toLowerCase();if(fs.existsSync(profile))throw Error('Fresh exact-owned profile required');
    const row=await launch(exe,profile,browser,'initial');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('command');await keyboardActivate(page,page.getByRole('button',{name:'开始演练',exact:true}));
    await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
    await page.getByLabel('推进速度').selectOption('4');await expect.poll(async()=>(await view(page)).rate).toBe(4);
    await expect.poll(async()=>(await view(page)).sim_time,{timeout:25000,intervals:[200]}).toBeGreaterThanOrEqual(target);
    // Sample setup uses real pointer activation; Tab traversal has its own UI
    // coverage and must not consume the narrow collecting window at4x.
    const pauseStarted=Date.now();await manualPause();
    receipt.events.push({kind:'sample_pause_UI_latency',browser,target,elapsed_ms:Date.now()-pauseStarted,view:await view(page)});
    await operation(page,'save',()=>page.getByRole('button',{name:'保存行动',exact:true}).click());
    const saved=await diagnosticSnapshot(page,(await view(page)).run_id);
    row.saved={run_id:saved.state.run_id,sim_time:saved.state.sim_time,revision:saved.state.revision,integrity:saved.state.integrity,source:saved.state.source};
    expect(saved.state.schema).toBe(9);expect(saved.snapshot).toEqual(saved.state);expect(saved.state.source.work.status).toBe(browser==='Chrome'?'pending':'running');expect(saved.state.sim_time).toBeLessThan(85000);
    await page.screenshot({path:owned+'evidence/'+label+'-'+browser.toLowerCase()+'-saved.png',fullPage:true});await close();
    const reopened=await launch(exe,profile,browser,'same-profile-reopened');await operation(page,'restore',()=>keyboardActivate(page,page.getByRole('button',{name:'接手这场演练',exact:true})));
    const resumed=await view(page);expect(resumed).toMatchObject({run_id:row.saved.run_id,sim_time:row.saved.sim_time,paused:true});
    const restored=await diagnosticSnapshot(page,resumed.run_id);expect(restored.state.source).toEqual(row.saved.source);const still=await view(page);expect(still.sim_time).toBe(row.saved.sim_time);
    await operation(page,'continue',()=>keyboardActivate(page,page.getByRole('button',{name:'继续行动',exact:true})));
    // Actual native loss of focus must cause a Game-committed management pause.
    const other=await context.newPage();await other.goto('about:blank');for(const p of[page,other]){const session=await context.newCDPSession(p);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await session.detach();}
    await page.bringToFront();await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(true);
    if((await view(page)).paused)await operation(page,'continue',()=>keyboardActivate(page,page.getByRole('button',{name:'继续行动',exact:true})));
    await expect.poll(async()=>(await view(page)).paused).toBe(false);const beforeBlur=(await trace(page)).requests.length;await other.bringToFront();
    await expect.poll(async()=>(await view(page)).paused,{timeout:10000,intervals:[100]}).toBe(true);
    const t=await trace(page);expect(t.requests.slice(beforeBlur).some(r=>r.kind==='management_pause'&&r.reason==='focus_lost')).toBe(true);
    const focusEvents=await page.evaluate(()=>window.b23NativeFocusEvents);expect(focusEvents.some(e=>e.kind==='blur'&&e.trusted&&!e.focused)).toBe(true);
    receipt.events.push({kind:'actual_Game_pause_after_native_blur',browser,view:await view(page),focusEvents});await other.close();await page.bringToFront();
    await operation(page,'continue',()=>keyboardActivate(page,page.getByRole('button',{name:'继续行动',exact:true})));
    await expect.poll(async()=>(await view(page)).sim_time,{timeout:15000,intervals:[200]}).toBeGreaterThanOrEqual(86000);
    await manualPause();
    const final=await diagnosticSnapshot(page,resumed.run_id),publicView=await view(page);expect(final.state.source.resources).toEqual({energy:16,durability:97,packs:0,energy_reserved:0,packs_reserved:0});expect(final.state.source.work.done_ms).toBe(20000);expect(final.state.reports.filter(r=>r.id==='R3')).toHaveLength(1);expect(final.state.deliveries.filter(d=>d.report_ref.id==='R3')).toHaveLength(1);expect(publicView.received_reports).toHaveLength(4);
    reopened.final={view:publicView,source:final.state.source,integrity:final.state.integrity};reopened.trace=await trace(page);await page.getByTestId('intelligence-source-R1').getByRole('button').press('Enter');await page.screenshot({path:owned+'evidence/'+label+'-'+browser.toLowerCase()+'-recovered.png',fullPage:true});await close();
  }
}catch(e){failure=String(e);if(page&&!page.isClosed()){await page.screenshot({path:owned+'evidence/'+label+'-failed.png',fullPage:true}).catch(()=>{});try{receipt.failure_trace=await trace(page);const latest=await view(page);receipt.failure_committed_diagnostic=await diagnosticSnapshot(page,latest.run_id);}catch(diagnosticError){receipt.failure_diagnostic_error=String(diagnosticError);}}}
finally{
  try{await close();}catch(e){failure=(failure??'')+' cleanup '+String(e);}
  Object.assign(receipt,{finished:new Date().toISOString(),elapsed_ms:Date.now()-started,launches,driver_sha256:crypto.createHash('sha256').update(fs.readFileSync(import.meta.filename)).digest('hex'),failure:failure??null,passed:!failure&&launches===4});
  fs.writeFileSync(owned+'evidence/'+label+'.json',JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({passed:receipt.passed,launches,elapsed_ms:receipt.elapsed_ms,failure:receipt.failure}));if(!receipt.passed)process.exitCode=1;
}
