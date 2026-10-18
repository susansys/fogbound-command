import {test,expect,chromium,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

type NativeTree=Array<{pid:number;parent:number;name:string}>;
type Driver={carrier:string;profile:string;origin:string;executable:string;version:string|null;open:()=>Promise<Page>;close:()=>Promise<NativeTree>};
type NativeTools={
 nativeDriver:(carrier:string,profile:string,origin:string,tools:{chromium:typeof chromium;expect:typeof expect})=>Promise<Driver>;
 publicView:(page:Page)=>Promise<any>;
 ownedSnapshot:(page:Page,run:string)=>Promise<{state:any;snapshot:any}>;
 fullPath:(page:Page,route:'A'|'B',checkpoint:(stage:string,page:Page)=>Promise<Page>,assert:typeof expect)=>Promise<any>;
};
const nativeModule=new URL('../verification/outcome-native-recovery.mjs',import.meta.url).href;
const loadNative=()=>import(nativeModule) as Promise<NativeTools>;
const physical=(s:any)=>({run_id:s.run_id,sim_time:s.sim_time,return_plans:s.return_plans,notifications:s.notifications,reception_batches:s.reception_batches,reception_manifests:s.reception_manifests,person_receipts:s.person_receipts,custody_events:s.custody_events,verification_batches:s.verification_batches,verification_reports:s.verification_reports,verification_deliveries:s.verification_deliveries,continuation_records:s.continuation_records,decision_records:s.decision_records,field:s.prefix.field,source:s.prefix.source,processing:s.prefix.processing});

for(const carrier of ['chrome','edge'] as const)test(`B24 E44/E45/E46 ${carrier} actual returning, partial handover and pending verification receipt survive six same-profile full-process closures`,async({},info)=>{
 test.skip(process.platform!=='win32','Required default Windows native proof is local; Linux cannot sign it.');test.setTimeout(150000);
 const {nativeDriver,publicView,ownedSnapshot,fullPath}=await loadNative();
 const origin=process.env.FB01_URL!,profile=path.resolve(process.env.TEMP!,'..','profiles',process.env.B24_RUN_LABEL+'-recovery-'+carrier),driver=await nativeDriver(carrier,profile,origin,{chromium,expect}),evidence:Record<string,any>={origin,profile,carrier,custom_launch_args:[],network_or_permission_changes:false,mode:'research',checkpoints:[],claims:'Real research-mode saved-state recovery and explicit next advance; command continuation is a separate obligation.'};
 try{
  let page=await driver.open();evidence.executable=driver.executable;evidence.browser_version=driver.version;await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const final=await fullPath(page,'A',async(stage,current)=>{
   const before=await publicView(current),saved=await ownedSnapshot(current,before.run_id),row:Record<string,any>={stage,before,diagnostic_before:saved};evidence.checkpoints.push(row);expect(saved.snapshot).toEqual(saved.state);expect(before.finished).toBe(false);
   if(stage==='W_return_issued'){expect(before.sim_time).toBe(237000);expect(saved.state.return_plans[0]).toMatchObject({actor:'W',status:'issued',accepted_at:null,settled:false});}
   if(stage==='W_return_moving'){expect(before.sim_time).toBe(240000);expect(saved.state.return_plans[0]).toMatchObject({actor:'W',status:'returning',accepted_at:238000,settled:false});expect(saved.state.return_plans[0].reserved_energy).toBeGreaterThan(0);}
   if(stage==='R_return_issued'){expect(before.sim_time).toBe(285000);expect(saved.state.return_plans.find((p:any)=>p.actor==='R')).toMatchObject({status:'issued',accepted_at:null,settled:false});}
   if(stage==='W_handover_partial_R_moving'){expect(before.sim_time).toBe(300000);expect(saved.state.reception_batches).toHaveLength(1);expect(saved.state.reception_batches[0]).toMatchObject({actor:'W',status:'running',started_at:295000,completed_at:null,people_ids:['W-person-1','W-person-2','W-person-3']});expect(saved.state.person_receipts).toHaveLength(0);}
   if(stage==='W_verified_R_handover_partial'){expect(before.sim_time).toBe(350000);expect(before.verification_reports).toHaveLength(1);expect(saved.state.person_receipts).toHaveLength(3);expect(saved.state.reception_batches.find((b:any)=>b.actor==='R')).toMatchObject({status:'running',started_at:344000,completed_at:null,people_ids:['R-person-1','R-person-2','R-person-3']});expect(saved.state.verification_batches[0]).toMatchObject({status:'completed',consumed_energy:2});}
   if(stage==='R_verified_receipt_pending'){expect(before.sim_time).toBe(390000);expect(before.verification_reports).toHaveLength(1);expect(saved.state.verification_reports).toHaveLength(2);expect(saved.state.verification_deliveries.at(-1)).toMatchObject({sent:390000,received:391000});expect(saved.state.prefix.processing).toMatchObject({energy:8,energy_reserved:0});expect(saved.state.person_receipts).toHaveLength(6);expect(saved.state.outcome).toBeNull();}
   row.trace=await current.evaluate(()=>Reflect.get(window,'__b24FullTrace'));row.process_tree=await driver.close();row.all_observed_processes_absent=true;page=await driver.open();await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect.poll(async()=>(await publicView(page))?.run_id).toBe(before.run_id);const restored=await publicView(page),recovered=await ownedSnapshot(page,before.run_id);Object.assign(row,{restored,diagnostic_after:recovered});const {replay_nodes,...previous}=before;expect(restored).toMatchObject({...previous,revision:restored.revision,paused:true});expect(restored.replay_nodes).toHaveLength(replay_nodes.length+1);expect(restored.replay_nodes.slice(0,-1)).toEqual(replay_nodes);expect(restored.replay_nodes.at(-1)).toMatchObject({at:before.sim_time,revision:restored.revision});expect(recovered.snapshot).toEqual(recovered.state);expect(physical(recovered.state)).toEqual(physical(saved.state));
   await page.waitForTimeout(250);expect((await publicView(page)).sim_time).toBe(before.sim_time);await expect(page.getByRole('alert')).toHaveCount(0);row.passed=true;return page;
  },expect);
  expect(final).toMatchObject({sim_time:391000,finished:true,outcome:{result:'success',finished_at:391000,confirmed_people:['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3']},processing:{energy_confirmed:8,energy_reserved:0}});expect(final.verification_reports).toHaveLength(2);expect(new Set(final.verification_reports.map((r:any)=>r.report.ref.id)).size).toBe(2);expect(final.reception_reports).toHaveLength(4);expect(evidence.checkpoints).toHaveLength(6);evidence.final=final;await page.screenshot({path:info.outputPath('six-recoveries-completed.png'),fullPage:true});evidence.passed=true;
 }catch(error){evidence.failure=String(error);throw error;}finally{evidence.final_process_tree=await driver.close();await fs.writeFile(info.outputPath(carrier+'-six-actual-recoveries.json'),JSON.stringify(evidence,null,2),{flag:'wx'});}
});

test('B24 E51 a focus-loss request made while the original continue reply is pending settles paused after the actual FIFO replies',async({page},info)=>{
 test.setTimeout(30000);
 await page.addInitScript(()=>{
  const Native=Worker,status:{requests:any[];native:any[];held:any[];armed:boolean;holding:boolean;release:(()=>void)|null}={requests:[],native:[],held:[],armed:false,holding:false,release:null};Reflect.set(window,'__b24PendingContinue',status);
  window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args) as Worker;if(!String(args[0]).includes('/assets/worker-'))return worker;const post=worker.postMessage.bind(worker);worker.postMessage=(request:any)=>{status.requests.push(structuredClone(request));if(status.armed&&request.kind==='operate_outcome'&&request.envelope.intent.kind==='continue')status.holding=true;post(request);};worker.addEventListener('message',(event:MessageEvent)=>{if(!event.isTrusted)return;status.native.push(structuredClone(event.data));if(status.holding){status.held.push(structuredClone(event.data));event.stopImmediatePropagation();}});status.release=()=>{status.holding=false;for(const original of status.held.splice(0))worker.dispatchEvent(new MessageEvent('message',{data:original}));};return worker;}});
 });
 try{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();await page.evaluate(()=>{Reflect.get(window,'__b24PendingContinue').armed=true;});await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');
  await expect.poll(()=>page.evaluate(()=>{const s=Reflect.get(window,'__b24PendingContinue');return s.held.some((reply:any)=>s.requests.some((request:any)=>request.request_id===reply.request_id&&request.kind==='operate_outcome'&&request.envelope.intent.kind==='continue')&&reply.ok);}),{timeout:5000}).toBe(true);await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeDisabled();
  // This is explicitly a software event/delivery fixture; the separate local
  // verifier must still prove trusted default-Windows native focus loss.
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect.poll(()=>page.evaluate(()=>{const s=Reflect.get(window,'__b24PendingContinue');return s.requests.some((request:any)=>request.kind==='management_pause'&&request.reason==='focus_lost');}),{timeout:2000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>{const s=Reflect.get(window,'__b24PendingContinue');return s.held.some((reply:any)=>reply.ok&&reply.view?.paused&&s.requests.some((request:any)=>request.kind==='management_pause'&&request.reason==='focus_lost'&&request.request_id===reply.request_id));}),{timeout:5000}).toBe(true);
  await page.evaluate(()=>Reflect.get(window,'__b24PendingContinue').release());await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'暂停行动',exact:true})).toHaveCount(0);const clock=await page.locator('.clock strong').innerText();await page.waitForTimeout(400);await expect(page.locator('.clock strong')).toHaveText(clock);await expect(page.getByRole('alert')).toHaveCount(0);
 }finally{
  const actual=await page.evaluate(()=>{const s=Reflect.get(window,'__b24PendingContinue');const copy=structuredClone({requests:s.requests,native:s.native,held:s.held});s.release?.();return copy;});await fs.writeFile(info.outputPath('pending-continue-fifo-actual.json'),JSON.stringify({scope:'Software delivery/event fixture only, not native focus proof',actual},null,2),{flag:'wx'});
 }
});

for(const fault of ['transaction_abort','response_loss'] as const)test(`B24 E26/E50 portable real Worker IDB ${fault} retains the original abort operation without an invented outcome`,async({page},info)=>{
 test.setTimeout(45000);
 const {ownedSnapshot}=await loadNative();
 await page.addInitScript(fault=>{
  const Native=Worker,requests:Record<string,any>[]=[],responses:Record<string,any>[]=[];Reflect.set(window,'__b24PortableFault',{requests,responses});
  window.Worker=class extends Native{constructor(url:string|URL,options?:WorkerOptions){
   const actual=String(url),owned=actual.includes('/assets/worker-'),script=`import ${JSON.stringify(actual)};const put=IDBObjectStore.prototype.put;let fired=false;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(!fired&&this.transaction.db.name==='fogbound-map-b-game-1'&&this.name==='runs'&&args[0]?.schema===10&&args[0]?.inputs?.at(-1)?.envelope?.intent?.kind==='abort_outcome'){fired=true;request.addEventListener('success',()=>{globalThis.__b24PortableAbortFired=true;this.transaction.abort();},{once:true});}return request;};`;
   super(owned&&fault==='transaction_abort'?URL.createObjectURL(new Blob([script],{type:'text/javascript'})):url,options);
   if(owned){const post=this.postMessage.bind(this);this.postMessage=(request:Record<string,any>)=>{requests.push(structuredClone(request));post(request);};this.addEventListener('message',(event:MessageEvent)=>{responses.push(structuredClone(event.data));if(event.data.ok&&event.data.view)Reflect.set(window,'__b24PortableFaultView',structuredClone(event.data.view));const request=requests.find(r=>r.request_id===event.data.request_id);if(fault==='response_loss'&&request?.kind==='operate_outcome'&&request.envelope.intent.kind==='abort_outcome'&&event.data.ok&&!Reflect.get(window,'__b24PortableDropped')){Reflect.set(window,'__b24PortableDropped',true);event.stopImmediatePropagation();}});}
  }};
 },fault);
 await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();const before=await page.evaluate(()=>Reflect.get(window,'__b24PortableFaultView')),saved=await ownedSnapshot(page,before.run_id);
 await page.getByRole('button',{name:'中止本次任务',exact:true}).press('Enter');await page.getByRole('dialog',{name:'确认中止任务'}).getByRole('button',{name:'确认中止任务',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'核对中止提交',exact:true})).toBeVisible({timeout:15000});await expect(page.getByTestId('outcome-result')).toHaveCount(0);const afterFault=await ownedSnapshot(page,before.run_id);
 await page.getByRole('button',{name:'核对中止提交',exact:true}).press('Enter');
 if(fault==='transaction_abort'){
  expect(await page.workers()[0].evaluate(()=>Reflect.get(globalThis,'__b24PortableAbortFired'))).toBe(true);expect(afterFault).toEqual(saved);await expect(page.getByRole('alert')).toContainText('尚未查到原提交');await page.getByRole('button',{name:'恢复最近记录并重新核对',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'重试同一中止提交',exact:true})).toBeEnabled();const restored=await page.evaluate(()=>Reflect.get(window,'__b24PortableFaultView'));expect(restored).toMatchObject({run_id:before.run_id,sim_time:0,paused:true,finished:false,termination:null,outcome:null,decision_records:[]});
 }else{
  expect(afterFault.state.revision).toBe(before.revision+1);await expect(page.getByTestId('outcome-termination')).toBeVisible();expect(await page.evaluate(()=>Reflect.get(window,'__b24PortableFaultView'))).toMatchObject({run_id:before.run_id,sim_time:0,finished:false,outcome:null,termination:{effective_at:0,cleanup_deadline:120000},decision_records:[{intent:{kind:'abort_outcome'}}]});await expect(page.getByRole('alert')).toHaveCount(0);
 }
 const trace=await page.evaluate(()=>Reflect.get(window,'__b24PortableFault')),aborts=trace.requests.filter((r:any)=>r.kind==='operate_outcome'&&r.envelope.intent.kind==='abort_outcome');expect(aborts).toHaveLength(1);const query=trace.requests.find((r:any)=>r.kind==='receipt'&&r.operation_id===aborts[0].envelope.operation_id);expect(query).toBeTruthy();const response=trace.responses.find((r:any)=>r.request_id===query.request_id);expect(response.ok).toBe(true);if(fault==='transaction_abort')expect(response.receipt).toBeNull();else expect(response.receipt.operation_id).toBe(aborts[0].envelope.operation_id);
 await fs.writeFile(info.outputPath('portable-'+fault+'-actual.json'),JSON.stringify({fault,browser:await page.evaluate(()=>navigator.userAgent),before:saved,afterFault,trace,passed:true,scope:'Actual carrier mechanism; default Windows full-process target proof is separate.'},null,2),{flag:'wx'});
});
