import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {nativeDriver,ownedRecords,ownedProcesses} from './outcome-native-recovery.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function verifyState(state){const {integrity,...body}=state;assert.equal(createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex'),integrity);}
export async function withinNativeDeadline(label,operation,deadline){
  assert(Number.isFinite(deadline));const remaining=deadline-Date.now();
  if(remaining<=0)throw Error('KA_NATIVE_OPERATION_TIMEOUT:'+label);
  let timer;
  try{const value=await Promise.race([Promise.resolve().then(()=>{if(Date.now()>=deadline)throw Error('KA_NATIVE_OPERATION_TIMEOUT:'+label);return operation();}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('KA_NATIVE_OPERATION_TIMEOUT:'+label)),remaining);})]);if(Date.now()>deadline)throw Error('KA_NATIVE_OPERATION_TIMEOUT:'+label);return value;}
  finally{clearTimeout(timer);}
}
export function assertRecoveryStage(stage,state,view){
  const expectedTimes={collecting:10000,registering:30500,returning:100000,'H-receiving':260000,'INTEL-verifying':280000,'R-verification-report-in-flight':297000,'W-handover-report-in-flight':344000,'W-verification-report-in-flight':365000,'cleanup-collecting':10000};
  assert(Object.hasOwn(expectedTimes,stage),'Unknown recovery stage');assert.equal(state.sim_time,expectedTimes[stage]);assert.equal(view.sim_time,state.sim_time);assert.equal(view.finished,false);
  const R=state.requests.find(task=>task.intent.actor==='R');
  const event=(kind,id,at)=>{const found=state.schedule.find(event=>event.kind===kind&&event.request_id===id);assert(found,stage+': missing scheduled work');assert.equal(found.at,at);return at-state.sim_time;};
  const sending=(owner,actor,id,sent,received)=>{
    const message=state.source_messages.find(message=>message.owner_kind===owner&&message.actor===actor&&message.request_id===id&&message.kind==='terminal');assert(message,stage+': original message absent');
    assert.equal(message.status,'sending');assert.equal(message.sent_at,sent);assert.equal(message.received_at,null);assert.equal(message.planned_received_at,received);assert(message.report_ref);assert.equal(event('report_delivery',id,received),received-state.sim_time);
  };
  if(stage==='collecting'||stage==='cleanup-collecting'){
    assert.equal(R.status,'collecting');assert.equal(R.started_at,1000);assert.equal(R.collection_stopped_at,null);assert.equal(event('collection_complete',R.ref.id,30000),20000);assert.equal(state.records.length,0);assert.equal(state.actors.R.energy_used_uj,38000000);
    if(stage==='cleanup-collecting'){assert.equal(state.termination.issued_at,2000);assert.equal(state.termination.cleanup_deadline,324000);assert.equal(view.status,'terminating');assert.equal(view.can_issue,false);assert.deepEqual(state.termination.tasks.map(task=>task.received_at),[3000,4000]);}
  }else if(stage==='registering'){
    assert.equal(R.status,'registering');assert.equal(R.collection_end,30000);assert.equal(R.registered_at,null);assert.equal(event('registration_complete',R.ref.id,31000),500);assert.equal(state.observations.length,1);assert.equal(state.records.length,0);assert.equal(state.actors.R.blank_record,true);
  }else if(stage==='returning'){
    const returning=state.returns.find(task=>task.origin==='hq_order'&&task.intent.actor==='R');assert(returning);assert.equal(returning.stage,'AB');assert.equal(returning.started_at,33000);assert.deepEqual(state.actors.R.position,[193.05,150]);assert.equal(event('return_boundary',returning.ref.id,150648),50648);
  }else if(stage==='H-receiving'){
    const handover=state.handovers.find(task=>task.actor==='R');assert(handover);assert.equal(handover.status,'receiving');assert.equal(handover.started_at,250648);assert.equal(handover.completed_at,null);assert.equal(event('handover_complete',handover.ref.id,275648),15648);
    const record=state.records.find(record=>record.source_actor==='R');assert(record);assert.equal(record.holder,'R');assert.equal(record.custody.length,1);assert.equal(state.H_inventory.mass_kg,0);
  }else if(stage==='INTEL-verifying'){
    const pending=state.verification_jobs.find(job=>job.actor==='R'),job=state.intel.jobs.find(job=>job.id===pending?.job_id);assert(job);assert.equal(job.status,'processing');assert.equal(job.started_at,276648);assert.equal(job.used_ms,3352);assert.equal(job.work_ms-job.used_ms,16648);assert.equal(event('intel_complete',job.id,296648),16648);assert(!view.verification_records.some(record=>record.actor==='R'));
  }else if(stage==='W-handover-report-in-flight'){
    const handover=state.handovers.find(task=>task.actor==='W');assert(handover);assert.equal(handover.completed_at,343429);assert.equal(handover.status,'completed');assert.equal(handover.report_received_at,null);sending('handover','H',handover.ref.id,343429,344429);assert.equal(state.H_inventory.mass_kg,.02);assert(!view.process_reports.some(report=>report.method==='H-record-handover'&&report.body.actor==='W'));
  }else{
    const actor=stage==='R-verification-report-in-flight'?'R':'W',pending=state.verification_jobs.find(job=>job.actor===actor),verification=state.verifications.find(record=>record.actor===actor);assert(pending&&verification);const completed=actor==='R'?296648:364429,received=actor==='R'?297648:365429;
    assert.equal(verification.completed_at,completed);assert.equal(verification.used_ms,20000);assert.equal(pending.report_received_at,null);sending('verification','INTEL',pending.ref.id,completed,received);assert(!view.verification_records.some(record=>record.actor===actor));assert.equal(view.result,null);
  }
}
function processEvidence(profile){
  const selected=ownedProcesses(profile),ids=selected.map(process=>process.pid);
  const script="$ids=@($env:KA_OWNED_PIDS -split ',' | Where-Object {$_} | ForEach-Object {[int]$_});$rows=@(Get-CimInstance Win32_Process | Where-Object {$ids -contains [int]$_.ProcessId} | ForEach-Object {@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;name=$_.Name;executable=$_.ExecutablePath;command_line=$_.CommandLine}});ConvertTo-Json -InputObject $rows -Compress";
  const rows=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,KA_OWNED_PIDS:ids.join(',')}}));
  assert(rows.some(row=>row.command_line?.replaceAll('\\','/').toLowerCase().includes(profile.replaceAll('\\','/').toLowerCase())),'Owned profile missing from actual process arguments');return rows;
}

/** Native persistence seam, not Workbench/hidden/human-play acceptance. */
export async function knowledgeCollectionRecovery(plan,{chromium,expect}){
  assert.equal(process.platform,'win32');assert.equal(plan.identity,'KA-NATIVE-T03-RECOVERY-v3');
  assert.equal(plan.origin,'http://127.0.0.1:4187');assert(['chrome','edge'].includes(plan.carrier));
  assert.equal(path.resolve(plan.profile),path.join(path.resolve(plan.profile_root),'t03-'+plan.carrier+'-recovery-v3'));
  assert.equal(plan.database,'fogbound-map-b-game-1');assert.match(plan.source_digest,/^[a-f0-9]{64}$/);
  const evidence={identity:plan.identity,carrier:plan.carrier,profile:plan.profile,origin:plan.origin,database:plan.database,source_digest:plan.source_digest,head:plan.head,fixture:'Actual production Game/Worker/Transport in a minimal owned verification page; no Workbench/hidden/play claim',world_or_DB_seeding:false,method:'ordinary research-mode public controls; readonly observation only for this task-created run',started:new Date().toISOString(),events:[],nodes:[],passed:false};
  assert(Number.isFinite(plan.execution_deadline_epoch_ms)&&plan.execution_deadline_epoch_ms>Date.now());
  assert.equal(plan.closure_deadline_epoch_ms,plan.execution_deadline_epoch_ms+90000);
  let driver,page,view,opening=null;
  const run=(label,operation,limit=45000)=>withinNativeDeadline(label,operation,Math.min(plan.execution_deadline_epoch_ms,Date.now()+limit));
  const records=run_id=>run('readonly-owned-IDB',()=>ownedRecords(page,run_id));
  const close=deadline=>withinNativeDeadline('owned-browser-close',()=>driver.close(),Math.min(deadline,Date.now()+45000));
  const open=async()=>{
    page=await run('owned-browser-open',()=>{opening=driver.open();return opening;});opening=null;
    await run('fixture-ready',()=>expect.poll(()=>page.evaluate(()=>typeof Reflect.get(window,'__kaNative')?.request),{timeout:15000}).toBe('function'),20000);
  };
  const send=async(name,input,expectedError=null)=>{
    const row={name,input,started:new Date().toISOString()};evidence.events.push(row);
    let response;try{response=await run('public-request:'+name,()=>page.evaluate(input=>Reflect.get(window,'__kaNative').request(input),input));row.response=response;}catch(error){row.failure=String(error);throw error;}
    if(expectedError){assert.equal(response.ok,false);assert.equal(response.code,expectedError);return response;}assert.equal(response.ok,true,JSON.stringify(response));
    if(response.view)view=response.view;return response;
  };
  const operate=(name,intent)=>send(name,{kind:'operate_knowledge_collection',envelope:{run_id:view.run_id,operation_id:name,expected_revision:view.revision,intent}});
  const at=async to=>{await operate('at-'+to,{kind:'advance',to});assert.equal(view.sim_time,to);};
  const ref=(kind,id)=>({run_id:view.run_id,kind,id,version:1});
  const collect=actor=>operate('collect-'+actor,{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000});
  const returning=actor=>operate('return-'+actor,{kind:'return_to_headquarters',actor,authority_ref:ref('authority','KA-INITIAL')});
  async function cold(stage){
    await operate('save-'+stage,{kind:'save'});const saved=structuredClone(view),savedRecords=await records(saved.run_id);verifyState(savedRecords.state);assert.deepEqual(savedRecords.state,savedRecords.snapshot);
    assertRecoveryStage(stage,savedRecords.state,saved);
    const node={stage,saved,records:savedRecords,processes_before_close:processEvidence(plan.profile)};evidence.nodes.push(node);
    assert(node.processes_before_close.length>0);node.closed_tree=await close(plan.closure_deadline_epoch_ms);assert.deepEqual(ownedProcesses(plan.profile),[]);
    await open();await send('restore-'+stage,{kind:'takeover',run_id:saved.run_id,operation_id:'restore-'+stage});
    const restored=await records(saved.run_id);verifyState(restored.state);assert.deepEqual(restored.state,restored.snapshot);
    assert.equal(view.run_id,saved.run_id);assert.equal(view.sim_time,saved.sim_time);assert.equal(view.paused,true);
    assert.deepEqual(Object.keys(restored.state).sort(),Object.keys(savedRecords.state).sort());
    for(const [key,value] of Object.entries(savedRecords.state))if(!['revision','inputs','integrity'].includes(key))assert.deepEqual(restored.state[key],value,stage+': '+key);
    assertRecoveryStage(stage,restored.state,view);
    assert.deepEqual(restored.state.inputs.slice(0,savedRecords.state.inputs.length),savedRecords.state.inputs);
    assert.equal(view.revision,saved.revision+1);assert.equal(restored.state.inputs.length,savedRecords.state.inputs.length+1);assert.deepEqual(restored.state.inputs.at(-1).envelope.intent,{kind:'restore',snapshot_revision:saved.revision});
    node.restored=structuredClone(view);node.restored_records=restored;
    const before=structuredClone(view);await send('current-after-'+stage,{kind:'current',run_id:view.run_id});assert.deepEqual(view,before);
    console.log(JSON.stringify({native_stage:stage,carrier:plan.carrier,sim_time:view.sim_time,full_process_reopen:true}));
  }
  try{
    await run('profile-root',()=>fs.mkdir(plan.profile_root,{recursive:true}));
    driver=await run('owned-driver',()=>nativeDriver(plan.carrier,plan.profile,plan.origin,{chromium,expect,compactViews:true,deadlineEpochMs:plan.closure_deadline_epoch_ms}));
    await open();evidence.executable=driver.executable;evidence.browser_version=driver.version;
    await send('create',{kind:'create',definition_ref:'KA-TEXT-KNOWLEDGE-01',case_ref:'KA-NORMAL-01',mode:'research',operation_id:'create-native'});
    assert.equal(view.scenario_kind,'play_knowledge_collection');assert.equal(view.paused,true);evidence.run_id=view.run_id;
    await collect('R');await at(10000);await cold('collecting');await at(30500);await cold('registering');
    await at(32000);await returning('R');await at(59000);await collect('W');await at(93000);await returning('W');
    for(const [time,stage] of [[100000,'returning'],[260000,'H-receiving'],[280000,'INTEL-verifying'],[297000,'R-verification-report-in-flight'],[344000,'W-handover-report-in-flight'],[365000,'W-verification-report-in-flight']]){await at(time);await cold(stage);}
    await operate('complete',{kind:'advance',to:1222000});assert.equal(view.sim_time,365429);assert.equal(view.finished,true);assert.equal(view.result.outcome,'success');
    const final=await records(view.run_id);verifyState(final.state);assert.equal(final.state.actors.R.energy_used_uj,790858000);assert.equal(final.state.actors.W.energy_used_uj,204214500);assert.equal(final.state.H_inventory.mass_kg,.02);
    assert.deepEqual(final.state.intel.jobs.map(job=>[job.ticket,job.used_ms]),[[1,20000],[2,20000]]);assert(final.state.records.every(record=>record.holder==='H'&&record.custody.length===2));
    evidence.final={view:structuredClone(view),records:final};
    await send('create-termination',{kind:'create',definition_ref:'KA-TEXT-KNOWLEDGE-01',mode:'research',operation_id:'create-native-termination'});
    await collect('R');await at(2000);await operate('terminate',{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')});await at(10000);await cold('cleanup-collecting');
    const closedGoal={kind:'operate_knowledge_collection',envelope:{run_id:view.run_id,operation_id:'rejected-new-goal',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')}}};
    const beforeRejected=await records(view.run_id);await send('reject-new-goal',closedGoal,'RUN_ENDED');assert.deepEqual(await records(view.run_id),beforeRejected);
    await operate('finish-cleanup',{kind:'advance',to:1222000});assert.equal(view.sim_time,249648);assert.equal(view.result.outcome,'aborted');assert.equal(view.result.safe_people,6);
    const cleanup=await records(view.run_id);verifyState(cleanup.state);assert.equal(cleanup.state.records.length,1);assert.equal(cleanup.state.records[0].holder,'R');assert.equal(cleanup.state.H_inventory.mass_kg,0);evidence.cleanup_final={view:structuredClone(view),records:cleanup};
    await run('screenshot',()=>page.screenshot({path:plan.screenshot}));evidence.passed=true;
  }catch(error){evidence.failure=String(error);throw error;}
  finally{
    const teardownDeadline=Math.min(plan.closure_deadline_epoch_ms,Date.now()+90000);
    try{
      if(driver?.context)evidence.final_closed_tree=await close(teardownDeadline);
      if(opening){try{await withinNativeDeadline('settle-pending-open',()=>opening,Math.min(teardownDeadline,Date.now()+30000));}catch(error){evidence.open_settle_failure=String(error);}}
      if(driver?.context)evidence.late_closed_tree=await close(teardownDeadline);
      evidence.final_processes=ownedProcesses(plan.profile);assert.deepEqual(evidence.final_processes,[]);
    }catch(error){evidence.passed=false;evidence.close_failure=String(error);throw error;}
    finally{evidence.finished=new Date().toISOString();await withinNativeDeadline('evidence-write',()=>fs.writeFile(plan.evidence,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'}),Date.now()+10000);}
  }
  return evidence;
}
