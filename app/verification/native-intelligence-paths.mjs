import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {observe,trace,view,diagnosticSnapshot,operation} from './local-persistence-observer.mjs';
const owned=process.env.B23_OWNED_HOME??'D:/war-strategy-game/.scratch/b23-intelligence-execution/',label=process.env.B23_NATIVE_LABEL;
if(!/^[a-z0-9-]+$/.test(label??''))throw Error('Unique owned evidence label required');
const origin=process.env.FB01_URL??'http://127.0.0.1:4196',started=Date.now(),receipt={started:new Date().toISOString(),label,origin,rows:[],events:[],default_Windows:true,custom_launch_args:[],claims:'T04 actual two lawful paths plus899999 cutoff/full-process same-profile recovery; not final CI or formal experience'};
let context,page,launches=0,failure;
const alive=id=>{try{process.kill(id,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
async function launch(executablePath,profile,browser,phase){
  if(++launches>6||Date.now()-started>240000)throw Error('T04 native six-launch/240-second budget reached');
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
  const advance=async(to)=>{await page.getByLabel('推进到时刻（秒）').fill(String(to/1000));return operation(page,'advance',()=>page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter'));};
  const issue=name=>custom('issue_activity',()=>page.getByRole('button',{name,exact:true}).press('Enter'));
  const prepare=async()=>{await custom('save_plan',()=>page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter'));await custom('request_preparation',()=>page.getByRole('button',{name:'提交准备申请',exact:true}).press('Enter'));};
  const verify=async()=>{const article=page.getByTestId('intelligence-source-R3');await article.getByRole('button',{name:'展开原文及递交',exact:true}).press('Enter');await expect(article).toContainText('来源时点不详');await custom('request_source_validation',()=>article.getByRole('button',{name:'请求核实这份原文',exact:true}).press('Enter'));};
  const chrome='D:/war-strategy-game/.scratch/map-b-browser/cft155/chrome-win64/chrome.exe',edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  for(const[browser,exe,path]of [['Chrome',chrome,'preparation-first'],['Edge',edge,'verification-first'],['Chrome',chrome,'cutoff']]){
    const profile=owned+'profiles/'+label+'-'+path;if(fs.existsSync(profile))throw Error('Fresh owned profile required');
    const row=await launch(exe,profile,browser,path+'-initial');row.path=path;await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
    if(path==='preparation-first'){
      await prepare();await issue('下达R前往A');await advance(32000);await issue('下达A处记录');await advance(79000);await advance(80000);await issue('下达R前往B');await advance(86000);await verify();await advance(146000);await issue('下达W维修B');await advance(166000);await advance(213000);await advance(214000);await issue('下达B处记录');await advance(260000);
    }else if(path==='verification-first'){
      await advance(86000);await verify();await advance(107000);await issue('下达R前往A');await custom('save_plan',()=>page.getByRole('button',{name:'保存准备草案',exact:true}).press('Enter'));await advance(108000);await custom('request_preparation',()=>page.getByRole('button',{name:'提交准备申请',exact:true}).press('Enter'));await advance(139000);await issue('下达A处记录');await advance(169000);await issue('下达W维修B');await advance(187000);await issue('下达R前往B');await advance(236000);await advance(237000);await issue('下达B处记录');await advance(283000);
    }else{
      await issue('下达R前往A');await advance(32000);await advance(854001);await expect(page.getByTestId('intelligence-field')).toContainText('晚于实体截止1毫秒');await issue('下达A处记录');await advance(899999);
    }
    await operation(page,'save',()=>page.getByRole('button',{name:'保存行动',exact:true}).press('Enter'));const saved=await diagnosticSnapshot(page,(await view(page)).run_id);expect(saved.state).toEqual(saved.snapshot);row.saved={state:saved.state,view:await view(page)};
    if(path==='cutoff')expect(saved.state.field.orders.at(-1)).toMatchObject({status:'running',work_done_ms:39998});else{expect(saved.state.field.artifacts).toHaveLength(2);expect(row.saved.view.artifact_reports).toHaveLength(1);}
    await page.screenshot({path:owned+'evidence/'+label+'-'+path+'-saved.png',fullPage:true});await close();
    const reopened=await launch(exe,profile,browser,path+'-same-profile');await operation(page,'restore',()=>page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter'));const restoredView=await view(page),restored=await diagnosticSnapshot(page,restoredView.run_id);
    expect(restoredView).toMatchObject({run_id:saved.state.run_id,sim_time:saved.state.sim_time,paused:true});expect(restored.state.field).toEqual(saved.state.field);expect(restored.state.processing).toEqual(saved.state.processing);expect(restored.state.source).toEqual(saved.state.source);expect(restored.state.rng).toEqual(saved.state.rng);expect((await view(page)).sim_time).toBe(saved.state.sim_time);
    if(path==='cutoff'){
      await advance(900000);const cutoff=await diagnosticSnapshot(page,restoredView.run_id);expect(cutoff.state.field.orders.at(-1)).toMatchObject({status:'cutoff',terminal_at:900000,work_done_ms:39999,settled:true});expect(cutoff.state.field.actors[0].resources).toMatchObject({record_energy:16,record_packs:1,durability:97,equipment_energy_reserved:0,packs_reserved:0});expect((await view(page)).actors[0]).toMatchObject({equipment_energy:20,packs:2});expect(cutoff.state.field.artifacts).toHaveLength(0);
      await advance(901001);const after=await diagnosticSnapshot(page,restoredView.run_id);expect(after.state.field).toEqual(cutoff.state.field);expect((await view(page)).actors[0]).toMatchObject({equipment_energy:16,packs:1});expect((await view(page)).artifact_reports).toHaveLength(0);
    }else{
      await advance(path==='preparation-first'?261000:284000);const v=await view(page);expect(v.artifact_reports.map(r=>[r.report.artifact.site,r.report.artifact.created_at,r.delivery.received])).toEqual(path==='preparation-first'?[['A',78000,79000],['B',260000,261000]]:[['A',185000,186000],['B',283000,284000]]);expect(v).toMatchObject({finished:false,processing:{energy_confirmed:12,energy_reserved:0},actors:[{equipment_energy:12,packs:0,durability:94,link:{energy:8,durability:92}},{equipment_energy:18,packs:0,durability:95}]});await expect(page.getByRole('status')).toContainText('两处现场成果回报已收到');
    }
    const final=await diagnosticSnapshot(page,restoredView.run_id);expect(final.state.source.resources).toMatchObject({energy:16,durability:97,packs:0});reopened.final={state:final.state,view:await view(page)};reopened.trace=await trace(page);await page.screenshot({path:owned+'evidence/'+label+'-'+path+'-restored.png',fullPage:true});await close();
  }

}catch(e){failure=String(e);if(page&&!page.isClosed()){await page.screenshot({path:owned+'evidence/'+label+'-failed.png',fullPage:true}).catch(()=>{});try{receipt.failure_trace=await trace(page);const latest=await view(page);receipt.failure_committed_diagnostic=await diagnosticSnapshot(page,latest.run_id);}catch(error){receipt.failure_diagnostic_error=String(error);}}}
finally{
  try{await close();}catch(e){failure=(failure??'')+' cleanup '+String(e);}
  Object.assign(receipt,{finished:new Date().toISOString(),elapsed_ms:Date.now()-started,launches,driver_sha256:crypto.createHash('sha256').update(fs.readFileSync(import.meta.filename)).digest('hex'),failure:failure??null,passed:!failure&&launches===6});fs.writeFileSync(owned+'evidence/'+label+'.json',JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({passed:receipt.passed,launches,elapsed_ms:receipt.elapsed_ms,failure:receipt.failure}));if(!receipt.passed)process.exitCode=1;
}
