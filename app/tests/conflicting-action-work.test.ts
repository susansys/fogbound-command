import {valid_response} from '../src/dto';
import {test,expect,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {conflicting_action_definition} from '../src/core/conflicting-action-definition';
import type {ConflictingActionPlayerView} from '../src/conflicting-action-contracts';
import {state_hash,validate_state} from '../src/core/snapshot';

test('B32 E22 a saved working assessment still permits the next preparation draft and original receipt',async()=>{
 const f=await fixture('faulted');
 try{
  await f.advance(22000);await f.apply({kind:'save_working_assessment',base_ref:null,draft:{target_scope:'B',explanations:['operable','faulted'],preferred:'operable',basis_refs:[f.view.conflicting_action.reports[0].ref]}});
  const saved=await f.apply({kind:'save_plan',base_plan_ref:null,draft:{purpose:'两处记录与返回交付',repair_packs:2}});
  expect(saved.view.plan).toMatchObject({purpose:'两处记录与返回交付'});expect(await f.game.get_receipt(f.view.run_id,saved.envelope.operation_id)).toEqual(saved.receipt);
  expect(saved.view.decision_records.at(-1)).toMatchObject({knowledge_revision:3,operation_seq:3});
  expect(f.view.conflicting_action.assessments).toHaveLength(1);expect(valid_response({request_id:'plan-after-assessment',ok:true,view:f.view})).toBe(true);
 }finally{await f.store.delete();}
});

test.each([2500,7000,16000,18000])('B32 E22 cold Game restoration at inspection %ims preserves private state, original receipt and physical ledger',async to=>{
 const f=await fixture('operable');
 try{
  const issued=await f.issue('W-inspect');await f.advance(to);const before=f.view,state=await f.store.read_committed(before.run_id);if(state?.schema!==12)throw Error('Expected schema12');
  const cold=new Game(f.store,{conflicting_facility:'faulted'}),restored=await cold.restore(before.run_id,'owned-cold-restore'),after=await f.store.read_committed(before.run_id);if(after?.schema!==12)throw Error('Expected restored schema12');
  expect(restored.view).toMatchObject({run_id:before.run_id,sim_time:before.sim_time,paused:true,actors:before.actors,field_reports:before.field_reports,repair_condition:before.repair_condition,conflicting_action:before.conflicting_action});
  expect(after.facility).toEqual(state.facility);expect(after.task.prefix.field).toEqual(state.task.prefix.field);expect(after.task.prefix.processing).toEqual(state.task.prefix.processing);
  expect(await cold.get_receipt(before.run_id,issued.envelope.operation_id)).toEqual(issued.receipt);
  expect((await cold.apply_outcome_intent(issued.envelope)).receipt).toEqual(issued.receipt);expect(await cold.get_view(before.run_id)).toEqual(restored.view);
  const replay=await cold.get_replay(before.run_id,before.sim_time,before.revision);expect(await replay.get_view(before.run_id)).toMatchObject({sim_time:before.sim_time,can_issue:false,field_reports:before.field_reports});
  const broken=structuredClone(after);broken.facility.current='faulted';broken.integrity=await state_hash(broken);await expect(validate_state(broken)).rejects.toMatchObject({code:'INVALID_SAVE'});
  expect(await cold.get_view(before.run_id)).toEqual(restored.view);
 }finally{await f.store.delete();}
});

test.each([
 {condition:'operable',route:'inspect',record_at:304000},
 {condition:'operable',route:'repair',record_at:354000},
 {condition:'faulted',route:'inspect',record_at:371000},
 {condition:'faulted',route:'repair',record_at:354000},
] as const)('B32 E19 complete public route $condition / $route ends with both qualified records and all personnel',async row=>{
 const f=await fixture(row.condition);
 try{
  await f.prepare();
  if(row.route==='inspect'){await f.issue('W-inspect');await f.advance(257000);}
  if(row.route==='repair'||row.condition==='faulted'){await f.issue('W-repair');await f.advance(row.route==='inspect'?324000:307000);}
  await f.issue('B-record');await f.advance(row.record_at);
  for(const actor of ['W','R']){
   const ref=(kind:string,id:string)=>({run_id:f.view.run_id,kind,id,version:1});
   await f.apply({kind:'return_and_deliver',actor_ref:ref('actor',actor),return_route_ref:ref('return_route',actor+'-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+actor),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:f.view.sim_time,to:900000}});
  }
  await f.advance(900000);
  expect(f.view).toMatchObject({finished:true,outcome:{result:'success',missing_people:[]}});
  expect(f.view.outcome!.qualified_artifacts).toHaveLength(2);
  expect(f.view.outcome!.confirmed_people).toEqual(['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3']);
  expect(f.view.outcome!.finished_at).toBeLessThanOrEqual(593000);
  expect(f.view.replay_nodes.every(node=>node.at<=f.view.sim_time)).toBe(true);
  expect(valid_response({request_id:'complete-route',ok:true,view:f.view})).toBe(true);
 }finally{await f.store.delete();}
});

async function fixture(condition:'operable'|'faulted',samePublicIdentity=false){
 const store=new Persistence('b32-owned-work-route-'+crypto.randomUUID()),game=new Game(store,{conflicting_facility:condition});let sequence=0;
 // Public evidence digests include the run ID. Hold that public identity equal
 // across separate owned databases; never delete digests from the comparison.
 const random=samePublicIdentity?vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000032'):undefined;
 let view:ConflictingActionPlayerView;
 try{view=await game.create_run(conflicting_action_definition,'research','create') as ConflictingActionPlayerView;}finally{random?.mockRestore();}
 const apply=async(intent:unknown)=>{const envelope={run_id:view.run_id,operation_id:'work-'+(++sequence),expected_revision:view.revision,intent};const result=await game.apply_outcome_intent(envelope);view=result.view as ConflictingActionPlayerView;return {envelope,...result};};
 const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'clock-'+(++sequence),expected_revision:view.revision,intent:{kind:'advance',to}})).view as ConflictingActionPlayerView;};
 const option=(id:string)=>{const selected=view.field_options.find(item=>item.intent.activity_ref.id===id);if(!selected)throw Error('Missing activity '+id);return selected;};
 const issue=async(id:string)=>{expect(option(id).available).toBe(true);return apply(option(id).intent);};
 const prepare=async()=>{
  await apply({kind:'save_plan',base_plan_ref:null,draft:{purpose:'两处记录及返回交付',repair_packs:2}});
  await issue('R-to-A');await advance(32000);await issue('A-record');await advance(80000);await issue('R-to-B');await advance(90000);
  await apply({kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'D-R3',version:1}]});await apply({kind:'request_preparation',plan_ref:view.plan!.ref});await advance(240000);
  expect(view.access.green).toBe('verified');expect(view.preparation.status).toBe('approved');expect(view.actors.find(actor=>actor.actor==='R')?.position_scope).toBe('B');
 };
 return {store,game,get view(){return view;},apply,advance,option,issue,prepare};
}

test.each(['operable','faulted'] as const)('B32 E02/E07/E08 public inspection needs no working assessment and charges only actual work: %s',async(condition)=>{
 const store=new Persistence('b32-owned-inspection-'+condition+'-'+crypto.randomUUID()),game=new Game(store,{conflicting_facility:condition});
 try{
  let view=await game.create_run(conflicting_action_definition,'research','create') as ConflictingActionPlayerView;
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view as ConflictingActionPlayerView;};
  await advance(240000);const option=view.field_options.find(o=>o.intent.activity_ref.id==='W-inspect')!;
  expect(option.available).toBe(true);expect(view.conflicting_action.assessments).toEqual([]);
  view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'inspect',expected_revision:view.revision,intent:option.intent})).view as ConflictingActionPlayerView;
  await advance(241000);let local=await game.get_actor_view(view.run_id,'W');
  expect(Reflect.get(local,'resources')).toMatchObject({work_energy:24,equipment_energy_reserved:2,durability:100,repair_packs:2,packs_reserved:0});
  await advance(246000);local=await game.get_actor_view(view.run_id,'W');expect(Reflect.get(local,'resources')).toMatchObject({work_energy:24,durability:100,equipment_energy_reserved:2});
  await advance(246001);local=await game.get_actor_view(view.run_id,'W');expect(Reflect.get(local,'resources')).toMatchObject({work_energy:24,durability:99,equipment_energy_reserved:2});
  await advance(256999);expect(view.field_reports.map(item=>item.report.phase)).toEqual(['accepted']);expect(view.field_reports.some(item=>Reflect.has(item.report,'facility_confirmation'))).toBe(false);
  await advance(257000);expect(view.field_reports.map(item=>item.report.phase)).toEqual(['accepted','completed']);
  expect(view.field_reports[1]).toMatchObject({delivery:{received:257000},report:{observed:{value:256000},facility_confirmation:{target:'B',condition,version:1}}});
  expect(view.actors.find(actor=>actor.actor==='W')).toMatchObject({equipment_energy:22,durability:99,packs:2});
  local=await game.get_actor_view(view.run_id,'W');expect(Reflect.get(local,'resources')).toMatchObject({work_energy:22,durability:99,equipment_energy_reserved:0,repair_packs:2,packs_reserved:0,link_energy:0});
  expect(view.conflicting_action.assessments).toEqual([]);
  expect(view.repair_condition).toMatchObject({site:'B',status:condition==='operable'?'confirmed_operable':'confirmed_faulted',confirmed_at:257000,evidence_ref:view.field_reports[1].delivery.ref.id});
  expect(valid_response({request_id:'owned-inspection-view',ok:true,view})).toBe(true);
  for(const [key,value]of [['version','1'],['version',3],['target','A'],['condition',new String(condition)],['initial','faulted']] as const){
   const malformed=structuredClone(view),report=malformed.field_reports[1].report;Reflect.set(report.facility_confirmation!,key,value);
   expect(valid_response({request_id:'bad-inspection-'+key,ok:true,view:malformed})).toBe(false);
  }
  const premature=structuredClone(view);premature.field_reports[0].report.facility_confirmation=structuredClone(premature.field_reports[1].report.facility_confirmation!);expect(valid_response({request_id:'premature-diagnosis',ok:true,view:premature})).toBe(false);
 }finally{await store.delete();}
});

test.each([
 {condition:'operable',route:'inspect',record_at:304000,energy:2,wear:1,packs:0},
 {condition:'operable',route:'repair',record_at:354000,energy:6,wear:5,packs:2},
 {condition:'faulted',route:'inspect',record_at:371000,energy:8,wear:6,packs:2},
 {condition:'faulted',route:'repair',record_at:354000,energy:6,wear:5,packs:2},
] as const)('B32 E02/E09/E10/E11 real public route $condition / $route follows its independent timing and resource oracle',async row=>{
 const f=await fixture(row.condition);
 try{
  await f.prepare();expect(f.view.conflicting_action.assessments).toEqual([]);
  if(row.route==='inspect'){
   await f.issue('W-inspect');await f.advance(257000);
   if(row.condition==='faulted'){
    expect(f.option('B-record').available).toBe(false);const before=f.view;
    await expect(f.apply(f.option('B-record').intent)).rejects.toMatchObject({code:'EVIDENCE_REQUIRED'});expect(await f.game.get_view(before.run_id)).toEqual(before);
   }
  }
  if(row.route==='repair'||row.condition==='faulted'){
   await f.issue('W-repair');await f.advance(row.route==='inspect'?324000:307000);
  }
  expect(f.option('B-record').available).toBe(true);await f.issue('B-record');await f.advance(row.record_at);
  expect(f.view.artifact_reports.find(item=>item.report.artifact?.site==='B')?.delivery.received).toBe(row.record_at);
  expect(f.view.actors.find(actor=>actor.actor==='W')).toMatchObject({equipment_energy:24-row.energy,durability:100-row.wear,packs:2-row.packs});
  const state=await f.store.read_committed(f.view.run_id);if(state?.schema!==12)throw Error('Expected new package');
  expect(state.facility).toMatchObject({initial:row.condition,current:'operable',version:row.route==='inspect'&&row.condition==='operable'?1:2});
  expect(state.facility.applied_repairs).toHaveLength(row.route==='inspect'&&row.condition==='operable'?0:1);
  expect(valid_response({request_id:'owned-complete-record',ok:true,view:f.view})).toBe(true);
  const leakedArtifact=structuredClone(f.view);leakedArtifact.artifact_reports[0].report.facility_confirmation={target:'B',condition:'operable',version:2};expect(valid_response({request_id:'artifact-facility-leak',ok:true,view:leakedArtifact})).toBe(false);
 }finally{await f.store.delete();}
});

test.each([
 {accepted:884000,phase:'completed',done:10000,diagnosis:true,terminal:899000},
 {accepted:885000,phase:'completed',done:10000,diagnosis:true,terminal:900000},
 {accepted:885001,phase:'cutoff',done:9999,diagnosis:false,terminal:900000},
] as const)('B32 E12 inclusive deadline and receipt grace preserve inspection work at $accepted',async row=>{
 const f=await fixture('faulted');
 try{
  await f.advance(row.accepted-1000);await f.issue('W-inspect');await f.advance(900000);
  const local=await f.game.get_actor_view(f.view.run_id,'W');expect(Reflect.get(local,'resources')).toMatchObject({work_energy:22,durability:99,repair_packs:2,equipment_energy_reserved:0,packs_reserved:0});
  const state=await f.store.read_committed(f.view.run_id);if(state?.schema!==12)throw Error('Expected new package');const order=state.task.prefix.field.orders[0];
  expect(order).toMatchObject({status:row.phase,work_done_ms:row.done,terminal_at:row.terminal,settled:true});expect(state.facility).toMatchObject({current:'faulted',version:1,applied_repairs:[]});
  await f.advance(901000);expect(Reflect.get(await f.game.get_actor_view(f.view.run_id,'W'),'resources')).toEqual(Reflect.get(local,'resources'));
  const terminal=f.view.field_reports.find(item=>item.report.phase!=='accepted')!;expect(terminal.report.phase).toBe(row.phase);expect(terminal.delivery.received).toBe(row.terminal+1000);expect(Object.hasOwn(terminal.report,'facility_confirmation')).toBe(row.diagnosis);
  expect(f.view.repair_condition.status).toBe(row.diagnosis?'confirmed_faulted':'unknown');expect(valid_response({request_id:'cutoff-view',ok:true,view:f.view})).toBe(true);
 }finally{await f.store.delete();}
});

test('B32 E10 bad facility references and missing access never partially issue a record or repeat an already received inspection',async()=>{
 const f=await fixture('operable');
 try{
  await f.prepare();await f.issue('W-inspect');await f.advance(257000);const before=f.view,intent=f.option('B-record').intent,confirmation=before.field_reports.find(item=>item.report.facility_confirmation)!;
  const invalid=[
   {...intent,basis_delivery_refs:[confirmation.delivery.ref]},
   {...intent,basis_delivery_refs:intent.basis_delivery_refs.map(ref=>ref.id===confirmation.delivery.ref.id?{...ref,version:2}:ref)},
   {...intent,basis_delivery_refs:intent.basis_delivery_refs.map(ref=>ref.id===confirmation.delivery.ref.id?{...ref,run_id:'another-run'}:ref)},
   {...intent,basis_delivery_refs:intent.basis_delivery_refs.map(ref=>ref.id===confirmation.delivery.ref.id?{...ref,id:'future-not-received'}:ref)},
   {...intent,basis_delivery_refs:intent.basis_delivery_refs.map(ref=>ref.id===confirmation.delivery.ref.id?{...ref,kind:'facility_report'}:ref)},
   {...intent,basis_delivery_refs:intent.basis_delivery_refs.map(ref=>ref.id===confirmation.delivery.ref.id?before.field_reports.find(item=>item.report.phase==='accepted')!.delivery.ref:ref)},
  ];
  for(const [index,change]of invalid.entries()){
   const request={run_id:before.run_id,operation_id:'invalid-gate-'+index,expected_revision:before.revision,intent:change};
   await expect(f.game.apply_outcome_intent(request)).rejects.toMatchObject({code:index===0||index===5?'EVIDENCE_REQUIRED':'INVALID_REQUEST'});expect(await f.game.get_view(before.run_id)).toEqual(before);expect(await f.store.receipt(before.run_id,request.operation_id)).toBeUndefined();
  }
  await expect(f.apply(f.option('W-inspect').intent)).rejects.toMatchObject({code:'CONSTRAINT_DENIED'});expect(await f.game.get_view(before.run_id)).toEqual(before);
 }finally{await f.store.delete();}
});

test('B32 E01/E07/E08 local completion stays private until the actual diagnosis delivery',async()=>{
 const fixtures=[await fixture('operable',true),await fixture('faulted',true)];
 try{
  for(const f of fixtures){await f.advance(240000);await f.issue('W-inspect');await f.advance(256999);}
  const normalized=(view:ConflictingActionPlayerView)=>JSON.parse(JSON.stringify(view).replaceAll(view.run_id,'same-run'));
  const left=normalized(fixtures[0].view),right=normalized(fixtures[1].view);
  const differences:string[]=[];const compare=(a:unknown,b:unknown,path:string)=>{if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))compare(Reflect.get(a,key),Reflect.get(b,key),path+'.'+key);}else if(a!==b)differences.push(path+': '+JSON.stringify(a)+' / '+JSON.stringify(b));};compare(left,right,'view');
  expect(differences,JSON.stringify(differences)).toEqual([]);
  for(const f of fixtures)await f.advance(257000);
  expect(fixtures[0].view.repair_condition.status).toBe('confirmed_operable');expect(fixtures[1].view.repair_condition.status).toBe('confirmed_faulted');
 }finally{for(const f of fixtures)await f.store.delete();}
});

test.each([
 {accepted:835000,phase:'completed',done:60000,energy:6,wear:5,packs:2,condition:'operable',version:2},
 {accepted:835001,phase:'cutoff',done:59999,energy:6,wear:5,packs:2,condition:'faulted',version:1},
 {accepted:899999,phase:'cutoff',done:0,energy:0,wear:0,packs:0,condition:'faulted',version:1},
] as const)('B32 E09/E12 repair changes the facility only on full completion at $accepted',async row=>{
 const f=await fixture('faulted');
 try{
  await f.prepare();await f.advance(row.accepted-1000);await f.issue('W-repair');await f.advance(900000);
  const state=await f.store.read_committed(f.view.run_id);if(state?.schema!==12)throw Error('Expected new package');
  expect(state.facility).toMatchObject({current:row.condition,version:row.version});expect(state.facility.applied_repairs).toHaveLength(row.phase==='completed'?1:0);
  expect(state.task.prefix.field.orders.find(order=>order.payload.activity_ref.id==='W-repair')).toMatchObject({status:row.phase,work_done_ms:row.done,settled:true});
  const resources=Reflect.get(await f.game.get_actor_view(f.view.run_id,'W'),'resources');expect(resources).toMatchObject({work_energy:24-row.energy,durability:100-row.wear,repair_packs:2-row.packs,equipment_energy_reserved:0,packs_reserved:0});
  await f.advance(901000);expect(Reflect.get(await f.game.get_actor_view(f.view.run_id,'W'),'resources')).toEqual(resources);
  const report=f.view.field_reports.find(item=>item.report.typed_payload.activity_ref.id==='W-repair'&&item.report.phase!=='accepted')!.report;expect(Object.hasOwn(report,'facility_confirmation')).toBe(row.phase==='completed');
  expect(valid_response({request_id:'repair-boundary-view',ok:true,view:f.view})).toBe(true);
 }finally{await f.store.delete();}
});

test('B32 E12 coarse and fine advancement preserve the same work, reservations and immutable reports',async()=>{
 const fixtures=[await fixture('operable',true),await fixture('operable',true)];
 try{
  for(const f of fixtures){await f.advance(240000);await f.issue('W-inspect');}
  await fixtures[0].advance(257000);for(const to of [241000,246000,246001,252500,256000,257000])await fixtures[1].advance(to);
  expect(await fixtures[0].game.get_actor_view(fixtures[0].view.run_id,'W')).toEqual(await fixtures[1].game.get_actor_view(fixtures[1].view.run_id,'W'));
  expect(fixtures[0].view.field_reports).toEqual(fixtures[1].view.field_reports);expect(fixtures[0].view.actors).toEqual(fixtures[1].view.actors);
 }finally{for(const f of fixtures)await f.store.delete();}
});

test('B32 E03/E11 changing an assessment during inspection never changes its signed order, resource ledger or record timing',async()=>{
 const f=await fixture('operable');
 try{
  await f.prepare();await f.issue('W-inspect');await f.advance(246001);const before=await f.game.get_actor_view(f.view.run_id,'W');
  await f.apply({kind:'save_working_assessment',base_ref:null,draft:{target_scope:'B',explanations:['operable','faulted'],preferred:'faulted',basis_refs:[f.view.conflicting_action.reports[1].ref]}});
  expect(await f.game.get_actor_view(f.view.run_id,'W')).toEqual(before);await f.advance(257000);expect(f.view.conflicting_action.assessments[0].preferred).toBe('faulted');
  await f.issue('B-record');await f.advance(304000);expect(f.view.artifact_reports.find(item=>item.report.artifact?.site==='B')!.delivery.received).toBe(304000);expect(f.view.actors.find(actor=>actor.actor==='W')).toMatchObject({equipment_energy:22,durability:99,packs:2});
 }finally{await f.store.delete();}
});

test('B32 E07/E08 a forged completed DTO cannot turn the real acceptance into an early diagnosis',async()=>{
 const f=await fixture('operable');
 try{
  await f.advance(240000);await f.issue('W-inspect');await f.advance(242000);const view=f.view;
  expect(view.field_reports).toHaveLength(1);expect(view.field_reports[0].report.phase).toBe('accepted');expect(valid_response({request_id:'real-acceptance',ok:true,view})).toBe(true);
  const forged=structuredClone(view),entry=forged.field_reports[0];entry.report.phase='completed';entry.report.typed_payload.phase='completed';entry.report.facility_confirmation={target:'B',condition:'operable',version:1};forged.field_activities[0].status='completed';forged.repair_condition={site:'B',status:'confirmed_operable',confirmed_at:entry.delivery.received,evidence_ref:entry.delivery.ref.id};
  expect(valid_response({request_id:'premature-forged-completion',ok:true,view:forged})).toBe(false);expect(await f.game.get_view(view.run_id)).toEqual(view);
  await f.advance(257000);const completed=f.view;expect(valid_response({request_id:'real-completion',ok:true,view:completed})).toBe(true);
  for(const [key,value]of [['actor','R'],['activity','W-repair'],['issued_at',256000]] as const){const unrelated=structuredClone(completed);Reflect.set(unrelated.field_activities[0],key,value);expect(valid_response({request_id:'unrelated-order-'+key,ok:true,view:unrelated})).toBe(false);}
  const futureVersion=structuredClone(completed);futureVersion.field_reports[1].report.facility_confirmation!.version=2;expect(valid_response({request_id:'unearned-facility-version',ok:true,view:futureVersion})).toBe(false);
 }finally{await f.store.delete();}
});

test('B32 E07/E10 a real inspection after a delivered repair retains the lawful second facility version',async()=>{
 const f=await fixture('faulted');
 try{
  await f.prepare();await f.issue('W-repair');await f.advance(307000);await f.issue('W-inspect');await f.advance(324000);
  expect(f.view.field_reports.at(-1)?.report.facility_confirmation).toEqual({target:'B',condition:'operable',version:2});expect(f.view.actors.find(actor=>actor.actor==='W')).toMatchObject({equipment_energy:16,durability:94,packs:0});expect(valid_response({request_id:'real-second-version-inspection',ok:true,view:f.view})).toBe(true);
 }finally{await f.store.delete();}
});
