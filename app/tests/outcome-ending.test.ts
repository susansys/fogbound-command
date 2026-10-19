import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import registered from '../src/core/outcome-definition.json';
import {valid_response} from '../src/dto';
import {hash} from '../src/core/scenario';
import type {OutcomeDefinition} from '../src/core/outcome-definition';

async function driver(name:string,definition:OutcomeDefinition=registered as OutcomeDefinition,mode:'command'|'research'='research') {
  const store=new Persistence('b24-owned-t02-'+name,[],[],[],[definition]),game=new Game(store);
  let view=await game.create_run(definition,mode,'create');
  const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
  return {store,game,run,get view(){return view;},
    advance:async(to:number)=>{view=(mode==='command'?await game.tick(run,to,'to-'+to):await game.control_clock({run_id:run,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;},
    issue:async(id:string,actor='R',basis:unknown[]=[])=>{view=(await game.apply_outcome_intent({run_id:run,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis}})).view;},
    returning:async(actor:'R'|'W',site:string)=>{view=(await game.return_and_deliver({run_id:run,operation_id:'return-'+actor,expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor',actor),return_route_ref:ref('return_route',actor+'-'+site+'-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+actor),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;},
    abort:async()=>{view=(await game.apply_outcome_intent({run_id:run,operation_id:'abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;},
    prepare:async()=>{view=(await game.apply_outcome_intent({run_id:run,operation_id:'plan',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得两处记录并返回交付',repair_packs:2}}})).view;const plan=Reflect.get(view,'plan');if(!plan)throw Error('Owned preparation plan missing');view=(await game.apply_outcome_intent({run_id:run,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:plan.ref}})).view;},
    source:async()=>{view=(await game.apply_outcome_intent({run_id:run,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;},
  };
}

async function narrowDefinition(){
  const value=structuredClone(registered) as OutcomeDefinition;
  value.profile.parameters.deadline=380000;
  const deadline=value.profile.registry.find(e=>e.id==='deadline')!;
  deadline.value=380000;deadline.source_ref='B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E16';
  value.hashes.profile=await hash(value.profile);
  const {definition_hash,...body}=value;value.definition_hash=await hash(body);return value;
}

async function hardDefinition(){
  const value=structuredClone(registered) as OutcomeDefinition;
  Reflect.set(value.catalogs,'hard_boundary',{id:'B24-OUTCOME-HARD-BOUNDARY-02',version:1,hard_close_time:391000});
  value.hashes.catalogs=await hash(value.catalogs);
  const {definition_hash,...body}=value;value.definition_hash=await hash(body);return value;
}

async function receiptDefinition(delay:10000|10001){
  const value=structuredClone(registered) as OutcomeDefinition;
  Reflect.set(value.catalogs,'verification_receipt_delay',delay);
  value.hashes.catalogs=await hash(value.catalogs);
  const {definition_hash,...body}=value;value.definition_hash=await hash(body);return value;
}

test.each([815000,815001])('B24 E14/E15 H reception from return issued at%i must finish by900000 and never produces a late manifest',async(issued)=>{
  const d=await driver('H-reception-boundary-'+issued);
  try {
    await d.advance(issued);await d.returning('W','B');await d.advance(900000);
    const exact=issued===815000;
    expect(await d.game.get_actor_view(d.run,'H')).toMatchObject({reception:{received_personnel:exact?3:0,reserved_personnel:0,batches:[{status:exact?'completed':'cutoff',started_at:issued+60000,completed_at:900000}]}});
    const local=await d.game.get_actor_view(d.run,'H');
    expect(Reflect.get(local,'person_receipts')).toHaveLength(exact?3:0);
    expect(Reflect.get(local,'handover_confirmations')).toHaveLength(exact?2:0);
    await d.advance(901000);
    expect(d.view).toMatchObject({handover:{received_personnel:exact?3:0},processing:{energy_confirmed:20,energy_reserved:0}});
    expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({verification_batches:exact?[{status:'cutoff',started_at:null,completed_at:901000,work_done_ms:0,consumed_energy:0,settled:true}]:[]});
    expect(Reflect.get(d.view,'verification_reports')).toEqual([]);
    await d.advance(910000);
    expect({...await d.game.get_actor_view(d.run,'H'),sim_time:900000}).toEqual(local);
    expect(d.view).toMatchObject({finished:true,outcome:{result:'failure',confirmed_people:[]},processing:{energy_confirmed:20,energy_reserved:0}});
    expect(valid_response({request_id:'H-reception-boundary',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test.each([841000,841001])('B24 E14/E15 W return issued at%i settles movement once at900000 and grace cannot start H reception',async(issued)=>{
  const d=await driver('return-deadline-boundary-'+issued);
  try {
    await d.advance(issued);await d.returning('W','B');await d.advance(900000);
    const exact=issued===841000,local=await d.game.get_actor_view(d.run,'W');
    expect(local).toMatchObject({position:{site:exact?'H':'B'},resources:{movement_energy:18,movement_energy_reserved:0}});
    await d.advance(901000);
    expect(await d.game.get_actor_view(d.run,'H')).toMatchObject({reception:{received_personnel:0,reserved_personnel:0,batches:exact?[{status:'queued',ready_at:901000,started_at:null,completed_at:null}]:[]},person_receipts:[],handover_confirmations:[],custody_events:[]});
    expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({verification_batches:[],resources:{energy:20,energy_reserved:0}});
    expect(Reflect.get(d.view,'return_reports').filter((r:{report:{phase:string}})=>r.report.phase==='completed')).toHaveLength(exact?1:0);
    await d.advance(910000);
    expect({...await d.game.get_actor_view(d.run,'W'),sim_time:900000}).toEqual(local);
    expect(d.view).toMatchObject({finished:true,outcome:{result:'failure',confirmed_people:[]},handover:{received_personnel:0}});
    expect(valid_response({request_id:'return-deadline-boundary',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test('B24 E19 only an independently registered no-obligations variant may finish immediately; it creates no personnel or safety receipts',async()=>{
  const value=structuredClone(registered) as OutcomeDefinition;
  Reflect.set(value.catalogs,'no_public_obligations',{id:'B24-OUTCOME-NO-OBLIGATIONS-01',version:1,source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E19'});
  value.hashes.catalogs=await hash(value.catalogs);const {definition_hash,...body}=value;value.definition_hash=await hash(body);
  const d=await driver('no-obligations',value);
  try {
    await d.abort();expect(d.view).toMatchObject({finished:true,sim_time:0,public_obligations:[],outcome:{result:'aborted',finished_at:0,confirmed_people:[],missing_people:[]},handover:{received_personnel:0}});
    expect(await d.game.get_actor_view(d.run,'W')).toMatchObject({position:{site:'B'},resources:{movement_energy:20,movement_energy_reserved:0}});
    expect(await d.game.get_actor_view(d.run,'H')).toMatchObject({person_receipts:[]});
    expect(valid_response({request_id:'no-obligations',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test.each([10000,10001] as const)('B24 E15 completed-at900000 verification receipt with delay%i is counted only through the grace edge',async(delay)=>{
  const d=await driver('receipt-grace-'+delay,await receiptDefinition(delay));
  try {
    await d.advance(794000);await d.returning('W','B');await d.advance(910000);
    expect(d.view).toMatchObject({finished:true,sim_time:910000,outcome:{result:'failure',confirmed_people:delay===10000?['W-person-1','W-person-2','W-person-3']:[]}});
    expect(Reflect.get(d.view,'verification_reports')).toHaveLength(delay===10000?1:0);
    expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({verification_batches:[{completed_at:900000,status:'completed',consumed_energy:2}],published_reports:[{observed:{value:900000},source_published:900000}]});
    expect(valid_response({request_id:'grace',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test('B24 E17 registered HARD-BOUNDARY-02 is public, splits a large step and wins at391000 without an invented hidden disaster',async()=>{
  const d=await driver('hard-close',await hardDefinition());
  try {
    expect(d.view).toMatchObject({hard_boundary:{id:'B24-OUTCOME-HARD-BOUNDARY-02',version:1,hard_close_time:391000}});
    await d.advance(390999);expect(d.view.finished).toBe(false);
    await d.advance(910000);expect(d.view).toMatchObject({sim_time:391000,finished:true,outcome:{result:'failure',finished_at:391000,scoring_cutoff:391000}});
    expect(valid_response({request_id:'hard',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test('B24 E17 real A final confirmation at391000 keeps its acquired details but HARD-BOUNDARY-02 wins over success',async()=>{
  const d=await driver('hard-same-time-A',await hardDefinition());
  try {
    await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.issue('R-to-B');await d.advance(86000);await d.source();await d.advance(108000);await d.prepare();await d.advance(170000);
    await d.issue('W-repair','W',[Reflect.get(d.view,'preparation_results')[0].delivery.ref]);await d.advance(237000);await d.returning('W','B');
    await d.issue('B-record','R',[Reflect.get(d.view,'assessments')[0].delivery.ref,Reflect.get(d.view,'field_reports').find((r:{report:{repair_condition:string}})=>r.report.repair_condition==='repaired').delivery.ref]);await d.advance(285000);await d.returning('R','B');
    await d.advance(390999);expect(d.view.finished).toBe(false);
    await d.advance(910000);
    expect(d.view).toMatchObject({sim_time:391000,finished:true,outcome:{result:'failure',finished_at:391000,qualified_artifacts:[expect.any(String),expect.any(String)],missing_people:[]},processing:{energy_confirmed:8,energy_reserved:0}});
    expect(valid_response({request_id:'hard-A',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test('B24 E16 a separately registered narrow outcome has the public380000 entity deadline without changing its schema9 prefix identity',async()=>{
  const definition=await narrowDefinition(),d=await driver('narrow-public',definition);
  try {expect(d.view).toMatchObject({public_rules:{deadline:380000,receipt_grace:10000}});expect(definition.prefix_definition.definition_hash).toBe(registered.prefix_definition.definition_hash);}
  finally {await d.store.delete();}
});

test.each([0,379999,900001])('B24 rejects unapproved self-consistent outcome deadline %i instead of accepting a new timing policy',async(deadline)=>{
  const value=await narrowDefinition();value.profile.parameters.deadline=deadline;value.profile.registry.find(e=>e.id==='deadline')!.value=deadline;
  value.hashes.profile=await hash(value.profile);const {definition_hash,...body}=value;value.definition_hash=await hash(body);
  const store=new Persistence('b24-owned-t02-invalid-deadline-'+deadline,[],[],[],[value]);
  try {await expect(new Game(store).create_run(value,'research','create')).rejects.toThrow('INVALID_DEFINITION');}
  finally {await store.delete();}
});

test.each(['A','B'] as const)('B24 E16 narrow380000 path %s keeps actual prefix work and cannot use grace to finish a cutoff manifest',async(route)=>{
  const d=await driver('narrow-'+route,await narrowDefinition());
  try {
    if(route==='B')await d.prepare();
    await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.issue('R-to-B');await d.advance(86000);await d.source();
    if(route==='A'){await d.advance(108000);await d.prepare();await d.advance(170000);}else await d.advance(146000);
    await d.issue('W-repair','W',[Reflect.get(d.view,'preparation_results')[0].delivery.ref]);await d.advance(route==='A'?237000:214000);await d.returning('W','B');
    await d.issue('B-record','R',[Reflect.get(d.view,'assessments')[0].delivery.ref,Reflect.get(d.view,'field_reports').find((r:{report:{repair_condition:string}})=>r.report.repair_condition==='repaired').delivery.ref]);
    await d.advance(route==='A'?285000:262000);await d.returning('R','B');await d.advance(390000);
    if(route==='B')expect(d.view).toMatchObject({sim_time:368000,finished:true,outcome:{result:'success',finished_at:368000},processing:{energy_confirmed:8,energy_reserved:0}});
    else {
      expect(d.view).toMatchObject({sim_time:390000,finished:true,outcome:{result:'failure',scoring_cutoff:380000,qualified_artifacts:[]},processing:{energy_confirmed:9,energy_reserved:0}});
      expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({verification_batches:[{status:'completed'},{started_at:370000,status:'cutoff',work_done_ms:10000,consumed_energy:1,settled:true}]});
      expect(Reflect.get(d.view,'verification_reports')).toHaveLength(1);
    }
    expect(valid_response({request_id:'narrow-final',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test('B24 E19 no qualified artifact at the ordinary deadline ends once as failure after the receipt grace',async()=>{
  const store=new Persistence('b24-owned-t02-ordinary-failure');
  try {
    const game=new Game(store), initial=await game.create_run(registered,'research','create');
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'to-end',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
    expect(final).toMatchObject({sim_time:910000,finished:true,paused:true,outcome:{result:'failure',finished_at:910000,scoring_cutoff:900000,qualified_artifacts:[]}});
    expect(valid_response({request_id:'ordinary-failure',ok:true,view:final})).toBe(true);
  } finally { await store.delete(); }
});

test('B24 E16/E21 narrow cleanup cuts running preparation at380000, charges three work units once and releases its unused reservation',async()=>{
  const definition=await narrowDefinition(),d=await driver('narrow-preparation-cleanup',definition);
  try {
    await d.advance(350000);await d.prepare();await d.advance(370000);await d.abort();await d.advance(380000);
    expect(d.view).toMatchObject({finished:true,sim_time:380000,termination:{cleanup_deadline:380000},outcome:{result:'aborted'},processing:{energy_confirmed:17,energy_reserved:0,queue:[{kind:'preparation',started_at:350000,completed_at:380000,status:'cutoff',work_done_ms:30000}]},preparation_results:[]});
    expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({resources:{energy:17,energy_reserved:0}});
    expect(valid_response({request_id:'narrow-preparation-cutoff',ok:true,view:d.view})).toBe(true);
    const restored=await d.game.restore(d.run,'restore-cutoff');expect(restored.view).toMatchObject({finished:true,processing:{energy_confirmed:17,energy_reserved:0},preparation_results:[]});
    expect(definition.prefix_definition.definition_hash).toBe(registered.prefix_definition.definition_hash);
  } finally {await d.store.delete();}
});

test.each([360000,360001,365000])('B24 E14/E16 narrow source request at%i completes only when all work fits before380000',async(issued)=>{
  const d=await driver('narrow-source-cutoff-'+issued,await narrowDefinition());
  try {
    await d.advance(issued);await d.source();await d.advance(390000);
    const exact=issued===360000;
    expect(d.view).toMatchObject({finished:true,sim_time:390000,outcome:{result:'failure'},processing:{energy_confirmed:18,energy_reserved:0,queue:[{status:exact?'completed':'cutoff',started_at:issued,completed_at:380000,work_done_ms:380000-issued}]}});
    const assessments=Reflect.get(d.view,'assessments');expect(assessments).toHaveLength(exact?1:0);
    if(exact)expect(assessments).toMatchObject([{assessment:{completed_at:380000},delivery:{received:381000}}]);
    expect(valid_response({request_id:'source-entity-cutoff',ok:true,view:d.view})).toBe(true);
    const restored=await d.game.restore(d.run,'restore-source-cutoff');expect(restored.view).toMatchObject({finished:true,processing:{energy_confirmed:18,energy_reserved:0}});
  } finally {await d.store.delete();}
});

test('B24 narrow deadline releases a source reservation queued behind an earlier manifest even while another job is cut off',async()=>{
  const d=await driver('narrow-queued-head-cutoff',await narrowDefinition());
  try {
    await d.advance(279000);await d.returning('W','B');await d.advance(350000);await d.prepare();await d.advance(367000);await d.source();await d.advance(380000);
    expect(d.view).toMatchObject({finished:false,processing:{energy_confirmed:17,energy_reserved:0,queue:[{kind:'preparation',status:'cutoff',completed_at:380000},{kind:'source_validation',status:'cutoff',started_at:null,completed_at:380000,work_done_ms:0}]},assessments:[]});
    expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({resources:{energy:17,energy_reserved:0},verification_batches:[{status:'cutoff',settled:true}]});
    await d.advance(390000);expect(d.view).toMatchObject({finished:true,processing:{energy_confirmed:17,energy_reserved:0},assessments:[]});
  } finally {await d.store.delete();}
});

test('B24 DTO rejects completed verification after the entity deadline even with a matching late HQ receipt and personnel vector',async()=>{
  const d=await driver('dto-late-complete-verification');
  try {
    await d.advance(794000);await d.returning('W','B');await d.advance(910000);
    expect(valid_response({request_id:'actual-exact-deadline',ok:true,view:d.view})).toBe(true);
    const altered=structuredClone(d.view),verification=Reflect.get(altered,'verification_reports')[0];
    expect(verification.report.observed.value).toBe(900000);
    verification.report.observed.value+=1;verification.report.source_published+=1;
    verification.delivery.sent+=1;verification.delivery.received+=1;
    for(const continuation of Reflect.get(altered,'continuation_records'))if(continuation.report_ref.id===verification.report.ref.id)continuation.at+=1;
    for(const person of Reflect.get(altered,'outcome').personnel_status)if(person.id.startsWith('W-')){person.verified_at+=1;person.confirmed_at+=1;}
    expect(valid_response({request_id:'invented-late-complete',ok:true,view:altered})).toBe(false);
  } finally {await d.store.delete();}
});

test.each([794000,794001])('B24 E14 real W return issued at %i distinguishes exact verification deadline from one millisecond late and settles once',async(issued)=>{
  const d=await driver('deadline-ms-'+issued);
  try {
    await d.advance(issued);await d.returning('W','B');await d.advance(900000);
    const exact=issued===794000;
    expect(await d.game.get_actor_view(d.run,'INTEL')).toMatchObject({verification_batches:[{status:exact?'completed':'cutoff',completed_at:900000,work_done_ms:exact?20000:19999,consumed_energy:2,settled:true}],resources:{energy:18,energy_reserved:0}});
    await d.advance(910000);
    expect(d.view).toMatchObject({finished:true,outcome:{result:'failure',confirmed_people:exact?['W-person-1','W-person-2','W-person-3']:[],qualified_artifacts:[]},processing:{energy_confirmed:18,energy_reserved:0}});
    expect(valid_response({request_id:'deadline-ms',ok:true,view:d.view})).toBe(true);
  } finally { await d.store.delete(); }
});

test.each([[false,false],[true,false],[false,true],[true,true]])('B24 E18 partial retains one real timely artifact; all personnel=%s abort=%s never changes its legal ending time',async(allPeople,abort)=>{
  const d=await driver('partial-'+allPeople+'-'+abort);
  try {
    if(allPeople)await d.returning('W','B');
    await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.returning('R','A');await d.advance(158000);
    expect(d.view).toMatchObject({finished:false,verification_reports:expect.any(Array)});
    await d.advance(160000);if(abort)await d.abort();
    const end=abort?(allPeople?160000:280000):910000;
    if(!abort||!allPeople)await d.advance(abort?280000:910000);
    expect(d.view).toMatchObject({finished:true,sim_time:end,outcome:{result:'partial',finished_at:end,scoring_cutoff:abort?160000:900000,qualified_artifacts:[expect.any(String)],missing_people:allPeople?[]:['W-person-1','W-person-2','W-person-3']},processing:{energy_confirmed:allPeople?16:18,energy_reserved:0}});
    if(abort)expect(Reflect.get(d.view,'termination')).toMatchObject({cleanup_deadline:280000});
    expect(valid_response({request_id:'partial',ok:true,view:d.view})).toBe(true);
  } finally { await d.store.delete(); }
});

test.each([false,true])('B24 E18 a public hard ending overrides one qualified artifact with all personnel=%s without changing settled costs',async(allPeople)=>{
  const d=await driver('hard-partial-'+allPeople,await hardDefinition());
  try {
    if(allPeople)await d.returning('W','B');
    await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.returning('R','A');await d.advance(390999);
    expect(d.view.finished).toBe(false);
    const before=structuredClone(d.view);
    expect(Reflect.get(before,'verification_reports')).toHaveLength(allPeople?2:1);
    await d.advance(910000);
    expect(d.view).toMatchObject({finished:true,sim_time:391000,outcome:{result:'failure',finished_at:391000,qualified_artifacts:['ART-O2'],missing_people:allPeople?[]:['W-person-1','W-person-2','W-person-3']}});
    expect(Reflect.get(d.view,'processing')).toMatchObject({energy_confirmed:allPeople?16:18,energy_reserved:0,queue:[]});
    const resourceVector=(v:typeof d.view)=>Reflect.get(v,'actors').map((a:{actor:string;movement_energy:number;link:{energy:number;durability:number}|null})=>[a.actor,a.movement_energy,a.link?.energy??null,a.link?.durability??null]);
    expect(resourceVector(d.view)).toEqual(resourceVector(before));
    expect(valid_response({request_id:'hard-over-partial',ok:true,view:d.view})).toBe(true);
  } finally {await d.store.delete();}
});

test('B24 E21 early cleanup closure waits for a necessary actual HQ processing terminal delivery, not INTEL private completion',async()=>{
  const d=await driver('public-cleanup-settlement');
  try {
    await d.returning('W','B');await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.returning('R','A');await d.advance(158000);await d.source();await d.advance(160000);await d.abort();
    expect(d.view).toMatchObject({finished:false,termination:{cleanup_deadline:280000}});
    await d.advance(178000);expect(d.view.finished).toBe(false);
    await d.advance(179000);expect(d.view).toMatchObject({finished:true,sim_time:179000,termination:{cleanup_deadline:280000},outcome:{result:'partial',finished_at:179000,scoring_cutoff:160000,missing_people:[]},processing:{energy_confirmed:14,energy_reserved:0}});
  } finally {await d.store.delete();}
});

// Shared terminal/accounting obligations from both browser command orderings.
// These ticks exercise the public command clock; they do not certify wall time,
// DOM/Worker wiring, or replace the retained complete command browser witness.
test.each(['verification-first','preparation-first'] as const)('B24 command %s preserves both complete manifests and the independently fixed final resource vector',async(order)=>{
  const d=await driver('ci-accounting-'+order,registered as OutcomeDefinition,'command');
  try {
    const preparationFirst=order==='preparation-first';
    if(preparationFirst)await d.prepare();
    await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.issue('R-to-B');await d.advance(86000);await d.source();
    if(preparationFirst)await d.advance(146000);
    else {await d.advance(108000);await d.prepare();await d.advance(170000);}
    await d.issue('W-repair','W',[Reflect.get(d.view,'preparation_results')[0].delivery.ref]);
    await d.advance(preparationFirst?214000:237000);await d.returning('W','B');
    await d.issue('B-record','R',[Reflect.get(d.view,'assessments')[0].delivery.ref,Reflect.get(d.view,'field_reports').find((r:{report:{repair_condition:string}})=>r.report.repair_condition==='repaired').delivery.ref]);
    await d.advance(preparationFirst?262000:285000);await d.returning('R','B');
    const finish=preparationFirst?368000:391000;
    await d.advance(finish-1);expect(d.view.finished).toBe(false);
    await d.advance(finish);
    expect(d.view).toMatchObject({mode:'command',paused:true,sim_time:finish,finished:true,outcome:{result:'success',finished_at:finish,missing_people:[],confirmed_people:['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3']},processing:{energy_confirmed:8,energy_reserved:0},actors:[{actor:'R',movement_energy:16,link:{energy:7,durability:91}},{actor:'W',movement_energy:18}]});
    expect(Reflect.get(d.view,'outcome').qualified_artifacts).toHaveLength(2);
    expect(Reflect.get(d.view,'return_reports')).toHaveLength(4);
    expect(Reflect.get(d.view,'reception_reports')).toHaveLength(4);
    expect(Reflect.get(d.view,'verification_reports')).toHaveLength(2);
    const decisions=Reflect.get(d.view,'decision_records') as {intent:{kind:string;activity_ref?:{id:string};actor_ref?:{id:string}}}[];
    expect(decisions.filter(r=>r.intent.kind==='issue_activity').map(r=>r.intent.activity_ref?.id)).toEqual(['R-to-A','A-record','R-to-B','W-repair','B-record']);
    expect(decisions.filter(r=>r.intent.kind==='return_and_deliver').map(r=>r.intent.actor_ref?.id)).toEqual(['W','R']);
    expect(valid_response({request_id:'complete-command-'+order,ok:true,view:d.view})).toBe(true);
  }finally{await d.store.delete();}
});

test('B24 command an intent whose real clock reaches success cannot add primary work after that boundary',async()=>{
  const d=await driver('command-intent-finishes-first',registered as OutcomeDefinition,'command');
  try {
    await d.prepare();await d.issue('R-to-A');await d.advance(32000);await d.issue('A-record');await d.advance(80000);await d.issue('R-to-B');await d.advance(86000);await d.source();await d.advance(146000);
    await d.issue('W-repair','W',[Reflect.get(d.view,'preparation_results')[0].delivery.ref]);await d.advance(214000);await d.returning('W','B');await d.issue('B-record','R',[Reflect.get(d.view,'assessments')[0].delivery.ref,Reflect.get(d.view,'field_reports').find((r:{report:{repair_condition:string}})=>r.report.repair_condition==='repaired').delivery.ref]);await d.advance(262000);await d.returning('R','B');await d.advance(367000);
    const before=d.view;
    await expect(d.game.apply_outcome_intent({run_id:d.run,operation_id:'late-primary-with-clock',expected_revision:before.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:d.run,kind:'report_delivery',id:'D-R3',version:1}]}},368000)).rejects.toThrow('RUN_ENDED');
    expect(await d.game.get_view(d.run)).toEqual(before);expect(await d.game.get_receipt(d.run,'late-primary-with-clock')).toBeNull();
    await d.advance(368000);expect(d.view).toMatchObject({finished:true,outcome:{result:'success'},processing:{energy_confirmed:8,energy_reserved:0}});
  } finally {await d.store.delete();}
});
