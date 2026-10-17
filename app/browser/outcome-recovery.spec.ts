import {test,expect,chromium,type BrowserContext,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

type ProcessIdentity={ProcessId:number;CreationDate:string;ExecutablePath:string;CommandLine:string};
function processes(ids:number[]):ProcessIdentity[]{
  if(!ids.length)return [];
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('Invalid owned browser process ID');
  const filter=ids.map(id=>'ProcessId='+id).join(' OR ');
  const output=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();Get-CimInstance Win32_Process -Filter '"+filter+"' | Select-Object ProcessId,CreationDate,ExecutablePath,CommandLine | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim();
  const value=output?JSON.parse(output):[];return Array.isArray(value)?value:[value];
}
async function observe(context:BrowserContext){
  await context.addInitScript(()=>{
    const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);worker.addEventListener('message',(e:MessageEvent)=>{if(e.data.ok&&e.data.view)Reflect.set(window,'__b24NativeLatest',structuredClone(e.data.view));if(e.data.ok&&e.data.receipt?.kind==='save')Reflect.set(window,'__b24NativeSave',structuredClone(e.data));});return worker;}});
  });
}
const latest=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__b24NativeLatest'));

for(const browserKind of ['chrome','edge'] as const)test('B24 E11/E59 native '+browserKind+' full-process close preserves the same reception and resumes only explicitly',async({},info)=>{
  test.skip(process.platform!=='win32','This is Windows native carrier evidence; Linux CI cannot sign it.');
  test.setTimeout(90000);
  const executable=browserKind==='chrome'?process.env.FB01_BROWSER!:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const profile=path.join(process.env.TEMP!,'b24-t01-native-'+browserKind+'-'+randomUUID()),origin=process.env.FB01_URL!;
  await fs.mkdir(profile,{recursive:true});
  const evidence:Record<string,unknown>={browserKind,executable,profile,origin,started:new Date().toISOString(),special_browser_args:[],mode:'command',real_profile_retained:true};
  let context:BrowserContext|undefined;
  try{
    context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768}});await observe(context);
    let page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);await page.goto(origin);await page.bringToFront();await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
    await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'安排W返回交付',exact:true}).press('Enter');await page.getByRole('dialog',{name:'确认返回交付'}).getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');
    const issued=await latest(page),issuedAt=issued.return_plans[0].issued_at;
    await page.getByLabel('推进速度',{exact:true}).selectOption('4');await expect.poll(async()=>(await latest(page)).rate).toBe(4);await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');
    await expect.poll(async()=>(await latest(page)).sim_time,{timeout:35000}).toBeGreaterThanOrEqual(issuedAt+70000);
    await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
    const partial=await latest(page);expect(partial.sim_time).toBeLessThan(issuedAt+85000);expect(partial).toMatchObject({paused:true,handover:{received_personnel:0},return_plans:[{actor:'W',status:'arrived'}]});
    await page.getByRole('button',{name:'保存行动',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24NativeSave')?.view?.revision)).toBeGreaterThan(partial.revision);
    const saved=await page.evaluate(()=>Reflect.get(window,'__b24NativeSave'));evidence.saved=saved;await page.screenshot({path:info.outputPath(browserKind+'-partial-before-close.png'),fullPage:true});
    const cdp=await context.browser()!.newBrowserCDPSession();evidence.browser_version=await cdp.send('Browser.getVersion');const processInfo=await cdp.send('SystemInfo.getProcessInfo'),ids=processInfo.processInfo.map(p=>p.id);const beforeClose=processes(ids);expect(beforeClose.some(p=>p.CommandLine?.includes(profile))).toBe(true);evidence.before_close=beforeClose;
    await context.close();context=undefined;evidence.closed_at=new Date().toISOString();
    await expect.poll(()=>processes(ids).filter(after=>beforeClose.some(before=>before.ProcessId===after.ProcessId&&before.CreationDate===after.CreationDate)).length,{timeout:10000}).toBe(0);evidence.same_identity_processes_after_close=processes(ids).filter(after=>beforeClose.some(before=>before.ProcessId===after.ProcessId&&before.CreationDate===after.CreationDate));
    context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768}});await observe(context);page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);await page.goto(origin);await page.bringToFront();await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');
    await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();const restored=await latest(page);expect(restored).toMatchObject({run_id:saved.view.run_id,sim_time:saved.view.sim_time,paused:true,decision_records:saved.view.decision_records,handover:saved.view.handover,return_plans:saved.view.return_plans});evidence.restored=restored;
    await page.waitForTimeout(500);expect((await latest(page)).sim_time).toBe(saved.view.sim_time);await page.screenshot({path:info.outputPath(browserKind+'-restored-paused.png'),fullPage:true});
    await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect.poll(async()=>(await latest(page)).sim_time,{timeout:20000}).toBeGreaterThanOrEqual(issuedAt+107000);await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
    const completed=await latest(page);expect(completed).toMatchObject({run_id:saved.view.run_id,handover:{received_personnel:3},processing:{energy_confirmed:18,energy_reserved:0}});expect(completed.decision_records).toHaveLength(1);expect(completed.return_reports).toHaveLength(2);expect(completed.reception_reports).toHaveLength(2);expect(completed.verification_reports).toHaveLength(1);expect(new Set(completed.verification_reports[0].report.personnel.map((p:{person_id:string})=>p.person_id)).size).toBe(3);evidence.completed=completed;
    await page.screenshot({path:info.outputPath(browserKind+'-resumed-once.png'),fullPage:true});evidence.passed=true;
  }finally{
    if(context)await context.close();evidence.finished=new Date().toISOString();await fs.writeFile(info.outputPath(browserKind+'-native-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  }
});
