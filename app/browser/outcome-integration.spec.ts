import {test,expect,chromium,type Page,type BrowserContext} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

type NativeProcess={pid:number;parent:number;name:string};
async function ownedProcesses(profile:string,observed:number[]=[]):Promise<NativeProcess[]>{
 const script="$ErrorActionPreference='Stop';$rows=@(Get-CimInstance Win32_Process);$roots=@($rows | Where-Object { $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -and $_.CommandLine.Contains($env:B24_OWNED_PROFILE) });$ids=[System.Collections.Generic.HashSet[int]]::new();foreach($r in $roots){[void]$ids.Add([int]$r.ProcessId)};$changed=$true;while($changed){$changed=$false;foreach($r in $rows){if($ids.Contains([int]$r.ParentProcessId) -and $ids.Add([int]$r.ProcessId)){$changed=$true}}};$tracked=@(($env:B24_OBSERVED_PIDS -split ',') | Where-Object {$_} | ForEach-Object {[int]$_});$selected=@($rows | Where-Object {$ids.Contains([int]$_.ProcessId) -or $tracked -contains [int]$_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;name=$_.Name}});ConvertTo-Json -InputObject $selected -Compress";
 return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',env:{...process.env,B24_OWNED_PROFILE:profile,B24_OBSERVED_PIDS:observed.join(',')},windowsHide:true}));
}
async function observe(page:Page){
 await page.addInitScript(()=>{const Native=Worker,trace:unknown[]=[];Reflect.set(window,'__b24FullTrace',trace);window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args),post=worker.postMessage.bind(worker);worker.postMessage=(request:unknown)=>{trace.push({request:structuredClone(request)});post(request);};worker.addEventListener('message',(event:MessageEvent)=>{trace.push({response:structuredClone(event.data)});if(event.data.ok&&event.data.view)Reflect.set(window,'__b24FullView',structuredClone(event.data.view));if(event.data.ok&&event.data.debrief)Reflect.set(window,'__b24FullSession',structuredClone(event.data.debrief));});return worker;}});});
}
async function sharedMapLayout(page:Page,measurements:unknown[]){
 for(const viewport of [{width:1920,height:1080},{width:1366,height:768}]){
  await page.setViewportSize(viewport);await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});await page.getByRole('button',{name:'全图',exact:true}).press('Enter');
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const actual=await page.evaluate(()=>{
   const canvas=document.querySelector<HTMLElement>('.map-canvas'),sidebar=document.querySelector<HTMLElement>('.intelligence-sources'),legend=document.querySelector<HTMLElement>('.map-legend'),scale=document.querySelector<HTMLElement>('.scale'),line=scale?.querySelector('i');
   if(!canvas||!sidebar||!legend||!scale||!line||!canvas.dataset.camera)throw Error('Actual shared map controls absent');
   const camera=canvas.dataset.camera.split(',').map(Number),metres=Number.parseFloat(scale.textContent??'');
   return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,canvas:canvas.getBoundingClientRect().toJSON(),background:getComputedStyle(canvas).backgroundColor,sidebar:sidebar.getBoundingClientRect().toJSON(),legend:legend.getBoundingClientRect().toJSON(),legend_overflow:[getComputedStyle(legend).overflowX,getComputedStyle(legend).overflowY],scale:{metres,camera_scale:camera[2],actual_line_width:line.getBoundingClientRect().width,intended_line_width:metres*camera[2]},page_width:document.documentElement.scrollWidth};
  });measurements.push(actual);
  expect.soft(actual.sidebar.width,'Shared responsive sidebar width').toBe(viewport.width>=1700?370:344);
  expect.soft(actual.background,'Canvas retains transparent background over its actual wrapper').toBe('rgba(0, 0, 0, 0)');
  expect.soft(actual.legend.left-actual.canvas.left,'Legend keeps the shared left anchor').toBe(16);
  expect.soft(actual.canvas.bottom-actual.legend.bottom,'Legend keeps the shared bottom anchor').toBe(16);
  expect.soft(actual.legend_overflow,'Closed legend must not clip its button border').toEqual(['visible','visible']);
  const legendToggle=page.getByRole('button',{name:'地图图例',exact:true});await legendToggle.press('Enter');await expect(legendToggle).toHaveAttribute('aria-expanded','true');
  expect(await page.locator('.map-legend').evaluate(element=>[getComputedStyle(element).overflowX,getComputedStyle(element).overflowY]),'Expanded legend retains bounded native scrolling').toEqual(['auto','auto']);
  await legendToggle.press('Enter');await expect(legendToggle).toHaveAttribute('aria-expanded','false');
  expect.soft(actual.page_width,'No horizontal page overflow').toBeLessThanOrEqual(viewport.width);
  // A CSS layout can quantize to device pixels; this is a functional distance
  // check, not a tolerance or a replacement for E52's pixel/DPR comparison.
  expect.soft(Math.abs(actual.scale.actual_line_width-actual.scale.intended_line_width),'Real scale line must not be shrunk by its flex container').toBeLessThanOrEqual(1/actual.dpr);
 }
}
async function fullPath(page:Page,route:'A'|'B'){
 const current=()=>page.evaluate(()=>Reflect.get(window,'__b24FullView'));
 const commit=async(name:string)=>{const before=await current(),button=page.getByRole('button',{name,exact:true});await expect(button).toBeEnabled();await button.press('Enter');await expect.poll(async()=>(await current()).revision).toBeGreaterThan(before.revision);await expect(page.getByRole('alert')).toHaveCount(0);};
 const advance=async(seconds:number)=>{await page.getByLabel('推进到时刻（秒）').fill(String(seconds));await commit('推进到该时刻');expect((await current()).sim_time).toBe(seconds*1000);};
 const prepare=async()=>{await page.getByLabel('准备目的').fill('取得两处记录并返回交付');await commit('保存准备草案');await commit('提交准备申请');};
 const returning=async(actor:'R'|'W')=>{await page.getByRole('button',{name:'安排'+actor+'返回交付',exact:true}).press('Enter');await commit('确认返回交付');};
 if(route==='B')await prepare();await commit('下达R前往A');await advance(32);await commit('下达A处记录');await advance(80);await commit('下达R前往B');await advance(86);
 const before=await current();await page.getByTestId('intelligence-source-R3').getByRole('button',{name:'请求核实这份原文',exact:true}).press('Enter');await expect.poll(async()=>(await current()).revision).toBeGreaterThan(before.revision);
 if(route==='A'){await advance(108);await prepare();await advance(170);}else await advance(146);
 await commit('下达W维修B');await advance(route==='A'?237:214);await returning('W');await commit('下达B处记录');await advance(route==='A'?285:262);await returning('R');
 await advance(route==='A'?342:319);await expect(page.getByTestId('outcome-verification')).toContainText('已核验 3 人');await advance(route==='A'?391:368);
 return current();
}

for(const carrier of ['chrome','edge'] as const)for(const route of ['A','B'] as const)test(`B24 ${route==='A'?'E41':'E42'} default installed Windows ${carrier} completes actual ${route} path through evidence debrief and same-profile full-process recovery`,async({},info)=>{
 test.skip(process.platform!=='win32','This default Windows proof is a separate target obligation; Linux cannot sign it.');test.setTimeout(120000);
 const origin=process.env.FB01_URL??'http://127.0.0.1:4196',profile=path.resolve(process.env.TEMP!,'..','profiles',process.env.B24_RUN_LABEL+'-'+route+'-'+carrier),executable=carrier==='chrome'?path.join(process.env.LOCALAPPDATA!,'Google','Chrome','Application','chrome.exe'):path.join(process.env['ProgramFiles(x86)']!,'Microsoft','Edge','Application','msedge.exe'),finishedAt=route==='A'?391000:368000,evidence:Record<string,unknown>={origin,profile,executable,carrier,route,custom_launch_args:[],network_or_permission_changes:false};await fs.mkdir(profile);
 const driver:{context:BrowserContext|null}={context:null};
 const open=async()=>{driver.context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768},deviceScaleFactor:1});const page=driver.context.pages()[0];page.setDefaultTimeout(10000);await observe(page);await page.goto(origin);return page;};
 const close=async()=>{const processes=await ownedProcesses(profile);expect(processes.length).toBeGreaterThan(0);await driver.context!.close();driver.context=null;await expect.poll(()=>ownedProcesses(profile,processes.map(p=>p.pid)),{timeout:10000}).toEqual([]);return processes;};
 try{
  let page=await open();evidence.browser_version=driver.context!.browser()!.version();await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const mapMeasurements:unknown[]=[];evidence.map_layout=mapMeasurements;await sharedMapLayout(page,mapMeasurements);expect(info.errors,'Actual shared layout must pass before the full path').toHaveLength(0);
  const final=await fullPath(page,route);expect(final).toMatchObject({finished:true,sim_time:finishedAt,outcome:{result:'success',finished_at:finishedAt,confirmed_people:['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3'],missing_people:[]},processing:{energy_confirmed:8,energy_reserved:0},actors:[{actor:'R',movement_energy:16,link:{energy:7,durability:91}},{actor:'W',movement_energy:18}]});expect(final.outcome.qualified_artifacts).toHaveLength(2);expect(final.return_reports).toHaveLength(4);expect(final.reception_reports).toHaveLength(4);expect(final.verification_reports).toHaveLength(2);evidence.final=final;
  await page.getByRole('button',{name:'查看复盘',exact:true}).press('Enter');await expect(page.getByTestId('outcome-debrief')).toContainText('总部当时认知');await expect(page.getByTestId('outcome-truth-facts')).toHaveCount(0);await page.getByText('查看当时依据与引用',{exact:true}).press('Enter');await page.getByRole('button',{name:'查询当时依据',exact:true}).press('Enter');await expect(page.getByTestId('debrief-evidence-entry').first()).toBeVisible();await page.getByTestId('debrief-evidence-entry').first().getByRole('button',{name:'定位原始记录',exact:true}).press('Enter');await expect(page.getByTestId('debrief-original-record').getByRole('heading',{name:'只读原始记录',exact:true})).toBeFocused();
  evidence.before_trace=await page.evaluate(()=>Reflect.get(window,'__b24FullTrace'));await page.screenshot({path:info.outputPath(route+'-complete-debrief.png'),fullPage:true});evidence.first_process_tree=await close();evidence.first_close_all_observed_processes_absent=true;
  page=await open();await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect(page.getByTestId('outcome-result')).toContainText('任务完成');const restored=await page.evaluate(()=>Reflect.get(window,'__b24FullView'));expect(restored).toMatchObject({run_id:final.run_id,sim_time:finishedAt,finished:true,paused:true,outcome:final.outcome,decision_records:final.decision_records});await page.getByRole('button',{name:'查看复盘',exact:true}).press('Enter');await expect(page.getByLabel('复盘议程',{exact:true})).toHaveValue('task_outcome');await expect(page.getByTestId('outcome-truth-facts')).toHaveCount(0);expect((await page.evaluate(()=>Reflect.get(window,'__b24FullTrace'))).some((e:any)=>e.request?.kind==='request_outcome_truth')).toBe(false);evidence.restored=restored;evidence.second_process_tree=await close();evidence.second_close_all_observed_processes_absent=true;
 }catch(error){evidence.failure=String(error);throw error;}finally{if(driver.context)await driver.context.close();evidence.final_profile_processes=await ownedProcesses(profile);await fs.writeFile(info.outputPath('actual-complete-'+route+'-'+carrier+'-default-Windows.json'),JSON.stringify(evidence,null,2),{flag:'wx'});}
});
