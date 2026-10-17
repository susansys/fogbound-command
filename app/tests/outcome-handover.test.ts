import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {hash} from '../src/core/scenario';
import {intelligence_definition,intelligence_variant} from './intelligence-fixtures';
import {valid_response} from '../src/dto';

// Authoring fixture for the independent B24 identity; expectations below are
// frozen contract literals, not values calculated by the return implementation.
async function outcomeDefinition(prefixOverride?:Awaited<ReturnType<typeof intelligence_definition>>){
  const prefix=prefixOverride??await intelligence_definition();
  const profile={...structuredClone(prefix.profile),id:'FIC-PLAY-B24-01',version:1,
    outcome:{source_ref:'B24-OUTCOME-DESIGN-1.0.0/outcome-contract',reception_seats:6,batch_people:3,handover_setup_ms:5000,handover_work:2,verification_work:2,return_R_ms:57000,return_W_ms:56000,return_energy:2,allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],R_H_terminal_actions:['return_terminal','handover','cleanup'],verification_energy:2,registry:[{"id":"reception_seats","value":6,"unit":"seat","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"batch_people","value":3,"unit":"person","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"handover_setup_ms","value":5000,"unit":"ms","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"handover_work","value":2,"unit":"work","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"verification_work","value":2,"unit":"work","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"verification_energy","value":2,"unit":"energy","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"return_R_ms","value":57000,"unit":"ms","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"return_W_ms","value":56000,"unit":"ms","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"},{"id":"return_energy","value":2,"unit":"energy","entry_version":1,"source_ref":"B24-OUTCOME-DESIGN-1.0.0/outcome-contract","source_type":"design_assumption","calibration_status":"uncalibrated"}]}};
  const rules={...structuredClone(prefix.rules),version:'b24-outcome-1',disabled_capabilities:['executing_replacement'],outcome_policy:'B24-OUTCOME-DESIGN-1.0.0'};
  const capabilities=[...prefix.capabilities,...[{"id":"R:return","actor":"R","action":"return","qualification":"none","equipment":"movement","unit":"fictional_metre","capacity":1},{"id":"W:return","actor":"W","action":"return","qualification":"none","equipment":"movement","unit":"fictional_metre","capacity":1},{"id":"H:reception","actor":"H","action":"receive","qualification":"receiver","equipment":"fixed_H","unit":"seat","capacity":6},{"id":"H:handover","actor":"H","action":"handover","qualification":"receiver","equipment":"fixed_H","unit":"batch","capacity":1},{"id":"INTEL:verify","actor":"INTEL","action":"verify_manifest","qualification":"verifier","equipment":"processing","unit":"work","capacity":1}]];
  const hashes={profile:await hash(profile),capabilities:await hash(capabilities),rules:await hash(rules),catalogs:await hash(prefix.catalogs),media:await hash([])};
  const body={schema:10 as const,contract:'0.5.1',id:'B24-OUTCOME-01',version:2,scenario_kind:'play_outcome' as const,prefix_definition:prefix,profile,capabilities,rules,catalogs:prefix.catalogs,hashes};
  return {...body,definition_hash:await hash(body)};
}

test('B24 schema10 starts as its separately registered scenario without registering or migrating a schema9 run',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-registered-identity');
  try{const game=new Game(store),view=await game.create_run(definition,'research','create');expect(view).toMatchObject({scenario_kind:'play_outcome',finished:false,source_run:null});expect(await store.list_runs()).toMatchObject([{run_id:view.run_id,scenario_kind:'play_outcome'}]);}finally{await store.delete();}
});

test('B24 E01/E57 one W return confirmation is only issued until the real1000ms recipient delivery',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-first-return',[],[],[],[definition]);
  try{
    const game=new Game(store);
    const initial=await game.create_run(definition,'research','create-outcome');
    expect(initial).toMatchObject({scenario_kind:'play_outcome',finished:false,handover:{capacity:6,received_personnel:0},return_candidates:[{actor:'R'},{actor:'W',available:true}]});
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
    expect(issued).toMatchObject({receipt:{kind:'return_and_deliver',result:'committed'},view:{return_plans:[{actor:'W',status:'issued',issued_at:0,accepted_at:null}],handover:{received_personnel:0}}});
    expect(issued.view).toMatchObject({decision_records:[{operation_id:'return-W',at:0,actor:'HQ',reason:{kind:'not_recorded'},knowledge:{actors:[{actor:'R',position_scope:'H'},{actor:'W',position_scope:'B'}]}}],continuation_records:[]});
    const received=await game.control_clock({run_id:initial.run_id,operation_id:'recipient-delivery',expected_revision:issued.view.revision,intent:{kind:'advance',to:1000}});
    expect(received.view).toMatchObject({return_plans:[{actor:'W',status:'issued',accepted_at:null}],handover:{received_personnel:0}});
    expect(received.view).toMatchObject({continuation_records:[]});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'B'},resources:{movement_energy_reserved:2}});
    const acknowledged=await game.control_clock({run_id:initial.run_id,operation_id:'HQ-acceptance',expected_revision:received.view.revision,intent:{kind:'advance',to:2000}});
    expect(acknowledged.view).toMatchObject({return_plans:[{actor:'W',status:'returning',accepted_at:1000}],handover:{received_personnel:0}});
    expect(acknowledged.view).toMatchObject({continuation_records:[{actor:'W',action:'return',at:1000,original_decision_ref:issued.view.decision_records[0].ref}]});
  }finally{await store.delete();}
});

test('B24 E58 HQ cannot sign a B-to-H return without its own B-position evidence and rejection preserves the run',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-public-return-gate',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    await expect(game.return_and_deliver({run_id:initial.run_id,operation_id:'return-R-without-B-evidence',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','R'),return_route_ref:ref('return_route','R-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-R'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).rejects.toThrow('EVIDENCE_REQUIRED');
    expect(await game.get_view(initial.run_id)).toEqual(initial);
  }finally{await store.delete();}
});

test('B24 E06/E57 W alone returns continuously with its real initial load8 and H receives3people without waiting for R',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-first-reception',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;return view;};
    await advance(30000);expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'B',point:[150,150]},resources:{movement_energy:20,movement_energy_reserved:2}});
    await advance(59000);expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'H',point:[50,150]},resources:{movement_energy:18,movement_energy_reserved:0}});expect(view).toMatchObject({actors:[{actor:'R'},{actor:'W',position_scope:'B'}]});
    await advance(60000);expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({actor:'H',reception:{reserved_personnel:3,received_personnel:0,batches:[{actor:'W',status:'running',started_at:60000}]}});expect(view).toMatchObject({handover:{received_personnel:0}});
    await advance(85000);expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:0,received_personnel:3,batches:[{actor:'W',status:'completed',completed_at:85000,artifact_refs:[]}]}});expect(view).toMatchObject({handover:{received_personnel:0}});
    await advance(86000);expect(view).toMatchObject({handover:{received_personnel:3},finished:false});
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'validate-while-manifest-running',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    expect(view).toMatchObject({processing:{energy_reserved:4,queue:[{kind:'source_validation',status:'queued',started_at:null}]}});
    await advance(106000);expect(view).toMatchObject({processing:{energy_confirmed:18,energy_reserved:2,queue:[{kind:'source_validation',status:'running',started_at:106000}]}});
    await advance(126000);expect(view).toMatchObject({processing:{energy_confirmed:16,energy_reserved:0,queue:[{kind:'source_validation',status:'completed',completed_at:126000}]}});
  }finally{await store.delete();}
});

test('B24 E60 an earlier manifest reserves its energy before later source jobs and cannot deadlock the shared processing queue',async()=>{
 const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-shared-energy-admission',[],[],[],[definition]);
 try{
  const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
  const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
  const source=async(id:string)=>game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}});
  await advance(1000);view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
  await advance(86000);view=(await source('first-source')).view;await advance(87000);expect(Reflect.get(view,'verification_feedback')??[]).toEqual([]);await advance(88000);expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'queued',subject_actor:'W',reason:'处理席位占用，等待核验'},delivery:{received:88000}}]);
  for(let i=0;i<8;i++)view=(await source('later-source-'+i)).view;
  const before=view;let refusal:string|null=null;try{await source('unfunded-ninth-source');}catch(error){refusal=error instanceof Error?error.message:String(error);}
  expect(refusal).toBe('CONSTRAINT_DENIED');expect(await game.get_view(initial.run_id)).toEqual(before);
  await advance(106000);expect(await game.get_actor_view(initial.run_id,'INTEL')).toMatchObject({verification_batches:[{status:'running',started_at:106000,reserved_energy:2}],resources:{energy:18,energy_reserved:18}});
  await advance(107000);expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'queued'}},{report:{phase:'accepted',reason:null},delivery:{received:107000}}]);expect(valid_response({request_id:'received-verification-status',ok:true,view})).toBe(true);
  await advance(127000);expect(Reflect.get(view,'verification_reports')).toMatchObject([{delivery:{received:127000}}]);
  await advance(286000);expect(await game.get_actor_view(initial.run_id,'INTEL')).toMatchObject({verification_batches:[{status:'completed',completed_at:126000,consumed_energy:2}],resources:{energy:0,energy_reserved:0}});
  expect(valid_response({request_id:'shared-energy-admission',ok:true,view})).toBe(true);
 }finally{await store.delete();}
});

test('B24 an unfunded manifest stops waiting at the entity deadline without inventing work, charges or personnel verification',async()=>{
 const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-unfunded-manifest-cutoff',[],[],[],[definition]);
 try{
  const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
  const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
  await advance(1000);view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
  await advance(86000);for(let i=0;i<10;i++)view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'earlier-source-'+i,expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
  await advance(286000);expect(await game.get_actor_view(initial.run_id,'INTEL')).toMatchObject({verification_batches:[{status:'queued',started_at:null,reserved_energy:0}],resources:{energy:0,energy_reserved:0}});
  await advance(900000);expect(await game.get_actor_view(initial.run_id,'INTEL')).toMatchObject({verification_batches:[{status:'cutoff',started_at:null,completed_at:900000,work_done_ms:0,consumed_energy:0,settled:true}],resources:{energy:0,energy_reserved:0}});
  expect(Reflect.get(view,'verification_reports')).toEqual([]);expect(Reflect.get(view,'handover')).toMatchObject({received_personnel:3});
  expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'hold',reason:'处理能源不足，等待核验条件'},delivery:{received:88000}}]);await advance(901000);expect(Reflect.get(view,'verification_feedback')).toMatchObject([{report:{phase:'hold'}},{report:{phase:'cutoff'},delivery:{received:901000}}]);expect(valid_response({request_id:'verification-cutoff',ok:true,view})).toBe(true);
 }finally{await store.delete();}
});

test('B24 E01/E02/E04/E08 path B keeps the public five-stage prefix and confirms two independent manifests by368000 with processing8',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-normal-B',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string,actor:string,basis:unknown[]=[])=>{view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis}})).view;};
    const returning=async(actor:string)=>{view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-'+actor,expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor',actor),return_route_ref:ref('return_route',actor+'-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+actor),basis_delivery_refs:Reflect.get(view,'field_reports').filter((r:{report:{actor:string;phase:string}})=>r.report.actor===actor&&r.report.phase==='completed').map((r:{delivery:{ref:unknown}})=>r.delivery.ref),allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;};
    const saved=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得两处记录并返回交付',repair_packs:2}}});view=saved.view;
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:Reflect.get(saved.view,'plan')!.ref}})).view;
    await issue('R-to-A','R');await advance(32000);await issue('A-record','R');await advance(80000);await issue('R-to-B','R');await advance(86000);
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(146000);await issue('W-repair','W',[Reflect.get(view,'preparation_results')[0].delivery.ref]);await advance(214000);
    await returning('W');await issue('B-record','R',[Reflect.get(view,'assessments')[0].delivery.ref,Reflect.get(view,'field_reports').find((r:{report:{repair_condition:string|null}})=>r.report.repair_condition==='repaired')!.delivery.ref]);
    await advance(262000);await returning('R');await advance(272000);
    expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:3,received_personnel:0,batches:[{actor:'W',status:'running',started_at:272000}]}});
    await advance(319000);expect(view).toMatchObject({handover:{received_personnel:3},verification_reports:[{report:{personnel:[{status:'verified'},{status:'verified'},{status:'verified'}]},delivery:{received:319000}}]});
    await advance(368000);expect(view).toMatchObject({finished:false,handover:{received_personnel:6},processing:{energy_confirmed:8,energy_reserved:0},verification_reports:[{delivery:{received:319000}},{report:{artifacts:[{status:'verified'},{status:'verified'}]},delivery:{received:368000}}]});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{site:'H'},resources:{movement_energy:16,record_energy:12,record_packs:0,durability:94,link_energy:7,link_durability:91},artifacts:[]});
    expect(valid_response({request_id:'normal-B-final',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('B24 E01/E02/E05/E08 normal A independently confirms both manifests at391000 and never auto-selects the five prefix stages',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-normal-A',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string,actor:string,basis:unknown[]=[])=>{view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis}})).view;};
    const returning=async(actor:string)=>{view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-'+actor,expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor',actor),return_route_ref:ref('return_route',actor+'-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+actor),basis_delivery_refs:Reflect.get(view,'field_reports').filter((r:{report:{actor:string;phase:string}})=>r.report.actor===actor&&r.report.phase==='completed').map((r:{delivery:{ref:unknown}})=>r.delivery.ref),allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;};
    await issue('R-to-A','R');await advance(32000);await issue('A-record','R');await advance(80000);await issue('R-to-B','R');await advance(86000);
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(108000);
    const saved=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'先核实档案，再安排维修与交付',repair_packs:2}}});view=saved.view;
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:Reflect.get(saved.view,'plan')!.ref}})).view;
    await advance(170000);await issue('W-repair','W',[Reflect.get(view,'preparation_results')[0].delivery.ref]);await advance(237000);
    await returning('W');await issue('B-record','R',[Reflect.get(view,'assessments')[0].delivery.ref,Reflect.get(view,'field_reports').find((r:{report:{repair_condition:string|null}})=>r.report.repair_condition==='repaired')!.delivery.ref]);
    await advance(285000);await returning('R');await advance(295000);
    expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{received_personnel:0,reserved_personnel:3,batches:[{actor:'W',started_at:295000,status:'running'}]}});
    await advance(342000);expect(view).toMatchObject({handover:{received_personnel:3},verification_reports:[{delivery:{received:342000}}]});
    await advance(390000);expect(view).toMatchObject({handover:{received_personnel:6},verification_reports:[{delivery:{received:342000}}]});
    await advance(391000);expect(view).toMatchObject({finished:false,processing:{energy_confirmed:8,energy_reserved:0},verification_reports:[{delivery:{received:342000}},{report:{artifacts:[{status:'verified'},{status:'verified'}]},delivery:{received:391000}}]});
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{movement_energy:16,record_energy:12,link_energy:7,link_durability:91}});
    expect(valid_response({request_id:'normal-A-final',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('B24 E06 a single A artifact can return directly with actual100metre cost and still needs a full20second manifest verification',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-one-A',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string)=>{view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;};
    await issue('R-to-A');await advance(32000);await issue('A-record');await advance(80000);
    expect(Reflect.get(view,'return_candidates')).toContainEqual(expect.objectContaining({actor:'R',available:true}));
    view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-A',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','R'),return_route_ref:ref('return_route','R-A-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-R'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    await advance(81000);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{movement_energy:19,movement_energy_reserved:1}});
    await advance(110000);expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({position:{site:'H'},resources:{movement_energy:18,movement_energy_reserved:0}});expect(Reflect.get(view,'actors')).toContainEqual(expect.objectContaining({actor:'R',position_scope:'A'}));
    await advance(111000);expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:3,batches:[{started_at:111000,status:'running'}]}});
    await advance(137000);expect(view).toMatchObject({handover:{received_personnel:3},verification_reports:[],processing:{energy_reserved:2}});
    await advance(156999);expect(view).toMatchObject({verification_reports:[]});
    await advance(158000);expect(view).toMatchObject({finished:false,handover:{received_personnel:3},processing:{energy_confirmed:18,energy_reserved:0},verification_reports:[{report:{artifacts:[{status:'verified'}]},delivery:{received:158000}}]});
    expect(view).toMatchObject({position_knowledge:{status:'known_scope',scope:{id:'H'},observed:{value:110000},received:111000,provenance:{kind:'delivered'}}});
    expect(Reflect.get(view,'actors')).toContainEqual(expect.objectContaining({actor:'R',movement_energy:18,link:{energy:11,durability:95},confirmed_at:111000}));
    expect(valid_response({request_id:'A-return-final',ok:true,view})).toBe(true);
    const receiver=await game.get_actor_view(initial.run_id,'H'),confirmations=Reflect.get(receiver,'handover_confirmations');
    expect(confirmations).toMatchObject([{actor:'R',at:136000},{actor:'H',at:136000}]);if(!Array.isArray(confirmations))throw Error('Missing actual bilateral confirmations');const confirmationRefs=confirmations.map((c:{ref:unknown})=>c.ref);
    const receipts=Reflect.get(receiver,'person_receipts');expect(receipts).toHaveLength(3);if(!Array.isArray(receipts))throw Error('Missing actual person receipts');for(const receipt of receipts)expect(receipt.confirmation_refs).toEqual(confirmationRefs);expect(Reflect.get(receiver,'custody_events')).toMatchObject([{from:'R',to:'H',confirmation_refs:confirmationRefs}]);
  }finally{await store.delete();}
});

test('B24 E03 R portable cutoff delivery has the same terminal status in the public view and Worker response contract',async()=>{
 const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-R-cutoff-dto',[],[],[],[definition]);
 try{
  const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
  const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
  for(const [id,to]of [['R-to-A',32000],['A-record',80000]] as const){view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;await advance(to);}
  await advance(880000);
  view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'late-return-R',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','R'),return_route_ref:ref('return_route','R-A-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-R'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
  await advance(900000);expect(Reflect.get(view,'return_plans')).toMatchObject([{actor:'R',status:'returning'}]);
  await advance(901000);
  expect(Reflect.get(view,'return_reports')).toMatchObject([{report:{phase:'accepted'}},{report:{phase:'cutoff'},delivery:{received:901000}}]);
  expect(Reflect.get(view,'return_plans')).toMatchObject([{actor:'R',status:'cutoff'}]);
  expect(valid_response({request_id:'R-cutoff',ok:true,view})).toBe(true);
  expect(await game.get_view(initial.run_id)).toEqual(view);
 }finally{await store.delete();}
});

test('B24 E60 simultaneous arrivals keep real FIFO across decimal ID boundaries and H reception runs beside independent INTEL work',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-same-time-fifo',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string)=>{view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;};
    await issue('R-to-A');await advance(32000);await issue('A-record');await advance(80000);await issue('R-to-B');await advance(111000);
    for(const id of ['save-one','save-two'])view=(await game.save({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'save'}})).view;
    expect(view.revision).toBe(9);
    for(const actor of ['W','R'])view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-'+actor,expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor',actor),return_route_ref:ref('return_route',actor+'-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+actor),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    await advance(171000);expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:3,received_personnel:0,batches:[{actor:'W',status:'running',started_at:171000},{actor:'R',status:'queued',started_at:null}]}});
    await advance(197000);expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:3,received_personnel:3,batches:[{actor:'W',status:'completed',completed_at:196000},{actor:'R',status:'running',started_at:196000}]}});expect(view).toMatchObject({processing:{energy_reserved:2}});
    await advance(218000);expect(view).toMatchObject({handover:{received_personnel:3},verification_reports:[{report:{artifacts:[]},delivery:{received:218000}}]});
    await advance(243000);expect(view).toMatchObject({handover:{received_personnel:6},processing:{energy_confirmed:16,energy_reserved:0},verification_reports:[{delivery:{received:218000}},{report:{artifacts:[{status:'verified'}]},delivery:{received:243000}}]});
  }finally{await store.delete();}
});

test('B24 E58 HQ respects its own pending field commitment and a signed return cannot be replaced with another field activity',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-public-commitment',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string)=>game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
    view=(await issue('R-to-A')).view;await advance(32000);view=(await issue('A-record')).view;await advance(80000);view=(await issue('R-to-B')).view;
    expect(Reflect.get(view,'return_candidates')).toContainEqual(expect.objectContaining({actor:'R',available:false,missing:expect.arrayContaining(['等待该编组上一指令的终态回报'])}));
    await advance(111000);
    view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-R',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','R'),return_route_ref:ref('return_route','R-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-R'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    const before=view;await expect(issue('B-record')).rejects.toThrow('CAPACITY_CONFLICT');expect(await game.get_view(initial.run_id)).toEqual(before);
    const options=Reflect.get(view,'field_options').filter((o:{intent:{actor_ref:{id:string}}})=>o.intent.actor_ref.id==='R');expect(options.length).toBeGreaterThan(0);expect(options.every((o:{available:boolean})=>!o.available)).toBe(true);
  }finally{await store.delete();}
});

test.each(['missing_material','broken_custody','wrong_manifest','damaged_content'] as const)('B24 E09 owned received-manifest fault %s cannot be verified or filled from private field truth',async kind=>{
  const definition=await outcomeDefinition();definition.catalogs=structuredClone(definition.catalogs);Reflect.set(definition.catalogs,'handover_faults',[{actor:'R',kind}]);definition.hashes.catalogs=await hash(definition.catalogs);const {definition_hash,...body}=definition;definition.definition_hash=await hash(body);
  const store=new Persistence('b24-owned-t01-manifest-fault-'+kind,[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=initial;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    for(const [id,to]of [['R-to-A',32000],['A-record',80000]] as const){view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;await advance(to);}
    view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-A',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','R'),return_route_ref:ref('return_route','R-A-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-R'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    await advance(158000);
    expect(view).toMatchObject({handover:{received_personnel:3},verification_reports:[{report:{artifacts:[{status:'inconclusive',reason:expect.any(String)}]}}]});
    const intel=await game.get_actor_view(initial.run_id,'INTEL');if(kind==='missing_material')expect(Reflect.get(intel,'received_manifests')).toMatchObject([{materials:[]}]);expect(valid_response({request_id:'manifest-fault',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('B24 E03 W cannot use the old B facility label to transmit a cutoff report from the middle of its return route',async()=>{
  const definition=await outcomeDefinition(),store=new Persistence('b24-owned-t01-w-no-portable',[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');let view=(await game.control_clock({run_id:initial.run_id,operation_id:'late-time',expected_revision:initial.revision,intent:{kind:'advance',to:880000}})).view;
    const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'past-cutoff',expected_revision:view.revision,intent:{kind:'advance',to:901000}})).view;
    expect(view).toMatchObject({return_reports:[{report:{phase:'accepted'},delivery:{channel:'B-fixed'}}],return_plans:[{actor:'W',status:'returning'}],handover:{received_personnel:0}});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'B'},resources:{link_energy:0,movement_energy:19,movement_energy_reserved:0}});
  }finally{await store.delete();}
});

test('B24 E04/E58 private absence of a W receiver channel leaves the same HQ preview and cannot accept a remote return order',async()=>{
  const hidden=await intelligence_variant(d=>Reflect.set(d.catalogs,'local_conditions',[{actor:'W',qualifications:null,equipment:null,record_energy:null,record_packs:null,position_scope:null,facility_authorized:false,source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E30'}]));
  const normal=await outcomeDefinition(),variant=await outcomeDefinition(hidden),baselineStore=new Persistence('b24-owned-t01-visible-channel',[],[],[],[normal]),hiddenStore=new Persistence('b24-owned-t01-hidden-channel',[],[],[],[variant]);
  try{
    const baseline=new Game(baselineStore),game=new Game(hiddenStore),visible=await baseline.create_run(normal,'research','create'),initial=await game.create_run(variant,'research','create');
    const neutral=(v:unknown,run:string)=>JSON.stringify(v).split(run).join('same-run');expect(neutral(initial,initial.run_id)).toBe(neutral(visible,visible.run_id));
    const input=(view:typeof initial)=>{const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});return {run_id:view.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}};};
    const issued=await game.return_and_deliver(input(initial)),normalIssued=await baseline.return_and_deliver(input(visible));expect(neutral(issued.view,initial.run_id)).toBe(neutral(normalIssued.view,visible.run_id));
    const after=await game.control_clock({run_id:initial.run_id,operation_id:'local-receive-gate',expected_revision:issued.view.revision,intent:{kind:'advance',to:107000}});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'B',point:[250,150]},resources:{movement_energy:20,movement_energy_reserved:0}});
    expect(after.view).toMatchObject({return_plans:[{actor:'W',status:'issued',accepted_at:null}],return_reports:[],handover:{received_personnel:0},verification_reports:[]});
  }finally{await baselineStore.delete();await hiddenStore.delete();}
});

test.each([
  {prepared:false,authority_valid:true,initial_occupied_seats:0},
  {prepared:true,authority_valid:false,initial_occupied_seats:0},
  {prepared:true,authority_valid:true,initial_occupied_seats:4},
])('B24 E04 H independently holds a batch without readiness/authority/three free seats: %j',async conditions=>{
  const definition=await outcomeDefinition();definition.catalogs=structuredClone(definition.catalogs);Reflect.set(definition.catalogs,'receiver_conditions',{...conditions,source_ref:'B24-OUTCOME-DESIGN-1.0.0/acceptance.md:E04'});definition.hashes.catalogs=await hash(definition.catalogs);const {definition_hash,...body}=definition;definition.definition_hash=await hash(body);
  const store=new Persistence('b24-owned-t01-receiver-'+JSON.stringify(conditions),[],[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
    const after=await game.control_clock({run_id:initial.run_id,operation_id:'after-receiver-gate',expected_revision:issued.view.revision,intent:{kind:'advance',to:107000}});
    expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{received_personnel:0,reserved_personnel:0,batches:[{actor:'W',status:'hold',started_at:null}]},person_receipts:[],custody_events:[]});
    expect(after.view).toMatchObject({handover:{received_personnel:0},reception_reports:[{report:{phase:'hold',reason:expect.any(String)}}],verification_reports:[],processing:{energy_confirmed:20,energy_reserved:0}});
    expect(valid_response({request_id:'receiver-hold',ok:true,...after})).toBe(true);
  }finally{await store.delete();}
});

test('B24 E02 one large advance and delivery-sized advances produce identical lawful return and reception facts',async()=>{
 const definition=await outcomeDefinition(),stores=[new Persistence('b24-owned-t01-big-step',[],[],[],[definition]),new Persistence('b24-owned-t01-small-steps',[],[],[],[definition])];
 try{
  const views=[];
  for(let i=0;i<stores.length;i++){
   const game=new Game(stores[i]),initial=await game.create_run(definition,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
   for(const to of i===0?[107000]:[1000,2000,30000,59000,60000,85000,86000,106000,107000])view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
   const {revision,replay_nodes,...facts}=view;views.push(JSON.stringify(facts).split(initial.run_id).join('same-run'));
  }
  expect(views[0]).toBe(views[1]);
 }finally{for(const store of stores)await store.delete();}
});
