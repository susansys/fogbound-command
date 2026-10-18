import {test,expect,chromium,type BrowserContext,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import registered from '../src/core/outcome-definition.json' with {type:'json'};
test.use({viewport:{width:1366,height:768}});

test('B24 E20/E21/E22 UI confirms irreversible HQ abort, keeps cleanup clock, and finishes at its original deadline',async({page},info)=>{
  test.setTimeout(45000);
  await page.goto('/');
  await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const advance=async(seconds:string,clock:string)=>{
    await page.getByLabel('推进到时刻（秒）').fill(seconds);
    const button=page.getByRole('button',{name:'推进到该时刻',exact:true});
    await expect(button).toBeEnabled();await button.press('Enter');
    await expect(page.locator('.clock strong')).toHaveText(clock);
  };
  await advance('300','05:00');
  await page.getByRole('button',{name:'中止本次任务',exact:true}).press('Enter');
  const dialog=page.getByRole('dialog',{name:'确认中止任务'});
  await expect(dialog).toContainText('不可撤回');
  await dialog.getByRole('button',{name:'确认中止任务',exact:true}).press('Enter');
  await expect(page.getByTestId('outcome-termination')).toContainText('收尾截止 07:00');
  await expect(page.getByRole('button',{name:'保存准备草案',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'请求核实这份原文',exact:true}).first()).toBeDisabled();
  await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeEnabled();
  await advance('910','07:00');
  await expect(page.getByTestId('outcome-result')).toContainText('已中止');
  await expect(page.getByTestId('outcome-result')).toContainText('人员回收未完成');
  await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('bounded-abort-result.png'),fullPage:true});
});

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
    window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);worker.addEventListener('message',(e:MessageEvent)=>{if(e.data.ok&&e.data.view)Reflect.set(window,'__b24AbortLatest',structuredClone(e.data.view));if(e.data.ok&&e.data.receipt?.kind==='save')Reflect.set(window,'__b24AbortSave',structuredClone(e.data));});Reflect.set(window,'__b24AbortWorker',worker);return worker;}});
  });
}
const latest=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__b24AbortLatest'));


async function ownedIdentity(page:Page,run:string){
 return page.evaluate(run=>new Promise<Record<string,unknown>>((resolve,reject)=>{
  const request=indexedDB.open('fogbound-map-b-game-1');request.onupgradeneeded=()=>{request.transaction?.abort();reject(Error('Owned active database absent'));};request.onerror=()=>reject(Error('Owned database identity unreadable'));request.onsuccess=()=>{const db=request.result,transaction=db.transaction('runs','readonly'),get=transaction.objectStore('runs').get(run);get.onerror=()=>{db.close();reject(Error('Owned run identity absent'));};get.onsuccess=()=>{const value=get.result;const identity={database_name:db.name,native_database_version:db.version,declared_dexie_version:4,run_id:value?.run_id,schema:value?.schema,contract:value?.contract,definition_hash:value?.definition_hash,hashes:value?.hashes,revision:value?.revision,sim_time:value?.sim_time};db.close();resolve(identity);};};
 }),run);
}

for(const browserKind of ['chrome','edge'] as const)test('B24 joint E03/E20/E22 native '+browserKind+' keeps moving W unacknowledged across full process closure and explicit continuation',async({},info)=>{
 test.skip(process.platform!=='win32','Only actual Windows native carrier evidence.');test.setTimeout(110000);
 const executable=browserKind==='chrome'?process.env.FB01_BROWSER!:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const profile=path.resolve(process.env.TEMP!,'../profiles/'+browserKind+'-t02-'+path.basename(path.dirname(process.cwd()))),origin=process.env.FB01_URL!;
 await fs.mkdir(profile,{recursive:true});expect(await fs.readdir(profile)).toEqual([]);
 const evidence:Record<string,unknown>={browserKind,executable,profile,origin,started:new Date().toISOString(),mode:'command',opening_locked:true,explicit_extra_browser_args:[],owned_profile_retained:true,technical_IDB_fields_only:true};let context:BrowserContext|undefined;
 try{
  context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768}});await observe(context);
  let page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);await page.goto(origin);await page.bringToFront();await expect(page.getByLabel('时间方式')).toHaveValue('command');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await expect(page.getByLabel('时间方式')).toHaveCount(0);
  await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'安排W返回交付',exact:true}).press('Enter');await page.getByRole('dialog',{name:'确认返回交付'}).getByRole('button',{name:'确认返回交付',exact:true}).press('Enter');await expect(page.getByTestId('outcome-return-W')).toContainText('已签发');
  const issuedAt=(await latest(page)).return_plans[0].issued_at;
  await page.getByLabel('推进速度',{exact:true}).selectOption('4');await expect.poll(async()=>(await latest(page)).rate).toBe(4);await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect.poll(async()=>(await latest(page)).sim_time,{timeout:15000}).toBeGreaterThanOrEqual(issuedAt+12000);
  await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();expect((await latest(page)).sim_time).toBeLessThan(issuedAt+40000);
  await page.getByRole('button',{name:'中止本次任务',exact:true}).press('Enter');await page.getByRole('dialog',{name:'确认中止任务'}).getByRole('button',{name:'确认中止任务',exact:true}).press('Enter');await expect(page.getByTestId('outcome-termination')).toContainText('不可撤回');const aborted=await latest(page);expect(aborted.abort_reports.some((item:{report:{actor:string}})=>item.report.actor==='W')).toBe(false);
  await page.getByRole('button',{name:'保存行动',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b24AbortSave')?.view?.revision)).toBeGreaterThan(aborted.revision);const saved=await page.evaluate(()=>Reflect.get(window,'__b24AbortSave'));evidence.saved=saved;
  const identity=await ownedIdentity(page,saved.view.run_id);expect(identity).toMatchObject({database_name:'fogbound-map-b-game-1',native_database_version:40,declared_dexie_version:4,schema:10,definition_hash:registered.definition_hash,hashes:registered.hashes});evidence.saved_identity=identity;
  const cdp=await context.browser()!.newBrowserCDPSession();evidence.browser_version=await cdp.send('Browser.getVersion');const ids=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(p=>p.id),before=processes(ids);expect(before.some(p=>p.CommandLine?.includes(profile))).toBe(true);evidence.before_close=before;await page.screenshot({path:info.outputPath(browserKind+'-abort-before-close.png'),fullPage:true});
  await context.close();context=undefined;evidence.closed_at=new Date().toISOString();await expect.poll(()=>processes(ids).filter(after=>before.some(prior=>prior.ProcessId===after.ProcessId&&prior.CreationDate===after.CreationDate)).length,{timeout:10000}).toBe(0);evidence.same_identity_processes_after_close=[];
  context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768}});await observe(context);page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);await page.goto(origin);await page.bringToFront();await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  const restored=await latest(page);expect(restored).toMatchObject({run_id:saved.view.run_id,sim_time:saved.view.sim_time,paused:true,mode:'command',termination:saved.view.termination,decision_records:saved.view.decision_records,return_reports:saved.view.return_reports,abort_reports:saved.view.abort_reports});evidence.restored=restored;expect(await ownedIdentity(page,saved.view.run_id)).toMatchObject({definition_hash:registered.definition_hash,hashes:registered.hashes,run_id:saved.view.run_id,schema:10});
  await page.waitForTimeout(500);expect((await latest(page)).sim_time).toBe(saved.view.sim_time);await expect(page.getByRole('button',{name:'保存准备草案',exact:true})).toBeDisabled();
  const rejected=await page.evaluate(({run,revision})=>new Promise<{ok:boolean;code:string}>((resolve,reject)=>{const worker=Reflect.get(window,'__b24AbortWorker') as Worker,request_id=crypto.randomUUID();const timeout=setTimeout(()=>{worker.removeEventListener('message',listener);reject(Error('Actual cancel-abort result not received'));},5000);const listener=(event:MessageEvent)=>{if(event.data.request_id===request_id){clearTimeout(timeout);worker.removeEventListener('message',listener);resolve(event.data);}};worker.addEventListener('message',listener);worker.postMessage({kind:'operate_outcome',request_id,envelope:{run_id:run,operation_id:crypto.randomUUID(),expected_revision:revision,intent:{kind:'cancel_abort'}}});}),{run:restored.run_id,revision:restored.revision});expect(rejected).toMatchObject({ok:false,code:'INVALID_INPUT'});evidence.withdrawal_rejected=rejected;expect((await latest(page)).termination).toEqual(saved.view.termination);
  await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect.poll(async()=>(await latest(page)).abort_reports.some((item:{report:{actor:string}})=>item.report.actor==='W'),{timeout:25000}).toBe(true);
  const received=(await latest(page)).abort_reports.find((item:{report:{actor:string}})=>item.report.actor==='W');expect(received).toMatchObject({report:{observed:{value:issuedAt+59000}},delivery:{received:issuedAt+60000,channel:'H-fixed'}});evidence.W_received=received;
  await expect.poll(async()=>(await latest(page)).finished,{timeout:35000}).toBe(true);const finished=await latest(page);expect(finished).toMatchObject({run_id:saved.view.run_id,paused:true,sim_time:saved.view.termination.cleanup_deadline,outcome:{result:'aborted',finished_at:saved.view.termination.cleanup_deadline,confirmed_people:['W-person-1','W-person-2','W-person-3'],missing_people:['R-person-1','R-person-2','R-person-3']},processing:{energy_confirmed:18,energy_reserved:0}});expect(finished.return_reports).toHaveLength(2);expect(finished.verification_reports).toHaveLength(1);expect(finished.verification_reports[0].report.purpose).toBe('personnel_cleanup');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeDisabled();await expect(page.getByRole('alert')).toHaveCount(0);evidence.finished_view=finished;await page.screenshot({path:info.outputPath(browserKind+'-abort-resumed-once.png'),fullPage:true});evidence.passed=true;
 }finally{if(context)await context.close();evidence.finished=new Date().toISOString();await fs.writeFile(info.outputPath(browserKind+'-abort-native-evidence.json'),JSON.stringify(evidence,null,2)+'\n');}
});
for(const fault of ['transaction_abort','response_loss'] as const)test('B24 E26 native IDB '+fault+' preserves the actual commit boundary and queries the original abort',async({},info)=>{
 test.skip(process.platform!=='win32','Actual Windows native IDB carrier only.');test.setTimeout(45000);
 const profile=path.resolve(process.env.TEMP!,'../profiles/e26-'+fault+'-'+path.basename(path.dirname(process.cwd())));
 await fs.mkdir(profile,{recursive:true});expect(await fs.readdir(profile)).toEqual([]);
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.FB01_BROWSER!,headless:false,viewport:{width:1366,height:768}});
 try{
  await context.addInitScript(fault=>{
   const Native=Worker,requests:Record<string,any>[]=[],responses:Record<string,any>[]=[];Reflect.set(window,'__b24FaultTrace',{requests,responses});
   window.Worker=class extends Native{
    constructor(url:string|URL,options?:WorkerOptions){
     const actual=String(url),owned=actual.includes('/assets/worker-');
     const script=`import ${JSON.stringify(actual)};const native=IDBObjectStore.prototype.put;let fired=false;IDBObjectStore.prototype.put=function(...args){const request=native.apply(this,args);if(!fired&&this.transaction.db.name==='fogbound-map-b-game-1'&&this.name==='runs'&&args[0]?.schema===10&&args[0]?.inputs?.at(-1)?.envelope?.intent?.kind==='abort_outcome'){fired=true;request.addEventListener('success',()=>{globalThis.__b24AbortTransactionFired=true;this.transaction.abort();},{once:true});}return request;};`;
     super(owned&&fault==='transaction_abort'?URL.createObjectURL(new Blob([script],{type:'text/javascript'})):url,options);
     if(owned){const post=this.postMessage.bind(this);this.postMessage=(message:Record<string,any>)=>{requests.push(structuredClone(message));post(message);};
      this.addEventListener('message',(event:MessageEvent)=>{responses.push(structuredClone(event.data));if(event.data.ok&&event.data.view)Reflect.set(window,'__b24FaultLatest',structuredClone(event.data.view));const request=requests.find(r=>r.request_id===event.data.request_id);if(fault==='response_loss'&&request?.kind==='operate_outcome'&&request.envelope.intent.kind==='abort_outcome'&&event.data.ok&&!Reflect.get(window,'__b24AbortDropped')){Reflect.set(window,'__b24AbortDropped',structuredClone(event.data));event.stopImmediatePropagation();}});
     }
    }
   };
  },fault);
  const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);await page.goto(process.env.FB01_URL!);await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const before=await page.evaluate(()=>Reflect.get(window,'__b24FaultLatest')),oldIdentity=await ownedIdentity(page,before.run_id);
  await page.getByRole('button',{name:'中止本次任务',exact:true}).press('Enter');await page.getByRole('dialog',{name:'确认中止任务'}).getByRole('button',{name:'确认中止任务',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'核对中止提交',exact:true})).toBeVisible({timeout:15000});await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('outcome-result')).toHaveCount(0);
  const afterFault=await ownedIdentity(page,before.run_id);
  if(fault==='transaction_abort'){
   expect(await page.workers()[0].evaluate(()=>Reflect.get(globalThis,'__b24AbortTransactionFired'))).toBe(true);expect(afterFault).toEqual(oldIdentity);
   await page.getByRole('button',{name:'核对中止提交',exact:true}).press('Enter');await expect(page.getByRole('alert')).toContainText('尚未查到原提交');
   await page.getByRole('button',{name:'恢复最近记录并重新核对',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'重试同一中止提交',exact:true})).toBeEnabled();
   const restored=await page.evaluate(()=>Reflect.get(window,'__b24FaultLatest'));expect(restored).toMatchObject({run_id:before.run_id,sim_time:0,paused:true,finished:false,termination:null,outcome:null,decision_records:[]});
  }else{
   expect(Number(afterFault.revision)).toBe(before.revision+1);await page.getByRole('button',{name:'核对中止提交',exact:true}).press('Enter');await expect(page.getByTestId('outcome-termination')).toBeVisible();
   const committed=await page.evaluate(()=>Reflect.get(window,'__b24FaultLatest'));expect(committed).toMatchObject({run_id:before.run_id,sim_time:0,finished:false,outcome:null,termination:{effective_at:0,cleanup_deadline:120000},decision_records:[{intent:{kind:'abort_outcome'}}]});await expect(page.getByRole('alert')).toHaveCount(0);
  }
  const trace=await page.evaluate(()=>Reflect.get(window,'__b24FaultTrace')),aborts=trace.requests.filter((r:Record<string,any>)=>r.kind==='operate_outcome'&&r.envelope.intent.kind==='abort_outcome');expect(aborts).toHaveLength(1);
  const receiptRequest=trace.requests.find((r:Record<string,any>)=>r.kind==='receipt'&&r.operation_id===aborts[0].envelope.operation_id);expect(receiptRequest).toBeTruthy();const receiptResponse=trace.responses.find((r:Record<string,any>)=>r.request_id===receiptRequest.request_id);expect(receiptResponse.ok).toBe(true);if(fault==='transaction_abort')expect(receiptResponse.receipt).toBeNull();else expect(receiptResponse.receipt.operation_id).toBe(aborts[0].envelope.operation_id);
  await fs.writeFile(info.outputPath('native-'+fault+'-evidence.json'),JSON.stringify({fault,profile,origin:process.env.FB01_URL,oldIdentity,afterFault,requests:trace.requests,responses:trace.responses,public_view_only:true,owned_profile_retained:true,passed:true},null,2),{flag:'wx'});await page.screenshot({path:info.outputPath('native-'+fault+'.png'),fullPage:true});
 }finally{await context.close();}
});
