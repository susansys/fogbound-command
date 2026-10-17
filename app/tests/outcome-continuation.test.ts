import {test,expect} from 'vitest';import {Game} from '../src/core/game';import {Persistence} from '../src/core/persistence';import {hash} from '../src/core/scenario';import {outcome_definition_for_package} from '../src/core/outcome-definition';import registered from '../src/core/outcome-definition.json';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';

test('B24 current independent profile rejects a rehashed owned handover-work unit mismatch before creating a run',async()=>{
  const definition=outcome_definition_for_package(registered.definition_hash);
  const values:Array<[string,number,string]>=[['reception_seats',6,'seat'],['batch_people',3,'person'],['handover_setup_ms',5000,'ms'],['handover_work',2,'ms'],['verification_work',2,'work'],['verification_energy',2,'energy'],['return_R_ms',57000,'ms'],['return_W_ms',56000,'ms'],['return_energy',2,'energy']];
  Reflect.set(definition.profile.outcome,'verification_energy',2);
  Reflect.set(definition.profile.outcome,'registry',values.map(([id,value,unit])=>({id,value,unit,entry_version:1,source_ref:'B24-OUTCOME-DESIGN-1.0.0/outcome-contract',source_type:'design_assumption',calibration_status:'uncalibrated'})));
  definition.hashes.profile=await hash(definition.profile);const {definition_hash,...body}=definition;definition.definition_hash=await hash(body);
  const store=new Persistence('b24-owned-t01-wrong-unit',[],[],[],[definition]);
  try{await expect(new Game(store).create_run(definition,'research','bad-unit')).rejects.toThrow('CONFIG_UNIT_MISMATCH');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

test('B24 rejects an owned rehashed outer capability catalog that loses a declared prefix movement capability',async()=>{
  const definition=outcome_definition_for_package(registered.definition_hash),before=definition.capabilities.length;
  definition.capabilities=definition.capabilities.filter(c=>c.id!=='R:move');expect(definition.capabilities).toHaveLength(before-1);
  definition.hashes.capabilities=await hash(definition.capabilities);const {definition_hash,...body}=definition;definition.definition_hash=await hash(body);
  const store=new Persistence('b24-owned-t01-missing-capability',[],[],[],[definition]);
  try{await expect(new Game(store).create_run(definition,'research','bad-capability')).rejects.toThrow('CONFIG_CAPABILITY_MISSING');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

test('B24 Transport accepts only the registered new scenario and the closed outcome command family',()=>{
 expect(valid_request({kind:'create',request_id:'create',operation_id:'new-run',mode:'command',definition_ref:'B24-OUTCOME-01'})).toBe(true);
 const envelope={run_id:'owned-run',operation_id:'advance',expected_revision:1,intent:{kind:'advance',to:1000}};
 expect(valid_request({kind:'operate_outcome',request_id:'outcome-request',envelope})).toBe(true);
 expect(valid_request({kind:'operate_outcome',request_id:'outcome-request',envelope,world:{}})).toBe(false);
 expect(valid_request({kind:'operate_outcome',request_id:'outcome-request',envelope:{...envelope,intent:{kind:'set_outcome',result:'success'}}})).toBe(false);
});

test('B24 actual Game views cross the response contract while private fields and future deliveries fail closed',async()=>{
 const store=new Persistence('b24-owned-t01-response-contract');
 try{
  const game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),'research','create');
  expect(valid_response({request_id:'initial',ok:true,view:initial})).toBe(true);
  const ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
  const localCompleted=await game.control_clock({run_id:initial.run_id,operation_id:'local-verification',expected_revision:issued.view.revision,intent:{kind:'advance',to:106000}});
  expect(localCompleted.view).toMatchObject({verification_reports:[]});
  expect(await game.get_actor_view(initial.run_id,'INTEL')).toMatchObject({actor:'INTEL',verification_batches:[{status:'completed',started_at:86000,completed_at:106000,consumed_energy:2}],resources:{energy:18,energy_reserved:0},published_reports:[{source_published:106000}]});
  expect(await game.get_actor_view(initial.run_id,'ArchiveSource')).toMatchObject({actor:'ArchiveSource',work:{status:'completed'},resources:{energy:16,durability:97,packs:0}});
  const after=await game.control_clock({run_id:initial.run_id,operation_id:'after-reception',expected_revision:localCompleted.view.revision,intent:{kind:'advance',to:107000}});
  if(after.view.scenario_kind!=='play_outcome')throw Error('Expected registered schema10 response');
  expect(after.view).toMatchObject({reception_reports:[{report:{subject_actor:'W',original_decision_ref:issued.view.decision_records[0].ref}},{report:{subject_actor:'W',original_decision_ref:issued.view.decision_records[0].ref}}],verification_reports:[{report:{subject_actor:'W',original_decision_ref:issued.view.decision_records[0].ref,reception_ref:{kind:'reception_batch'}}}]});
  expect(valid_response({request_id:'current',ok:true,...after})).toBe(true);
  expect(after.view).toMatchObject({decision_records:[{operation_id:'return-W',reason:{kind:'not_recorded'}}],continuation_records:[{action:'return',actor:'W',at:1000},{action:'handover_batch',actor:'H',at:60000},{action:'verify_manifest',actor:'INTEL',at:106000},{action:'notify_HQ',actor:'INTEL',at:106000}]});
  const original=issued.view.decision_records[0].ref;expect(after.view.continuation_records.every(c=>JSON.stringify(c.original_decision_ref)===JSON.stringify(original))).toBe(true);
  const privateValue=structuredClone(after.view);Reflect.set(privateValue,'prefix',{});expect(valid_response({request_id:'private',ok:true,view:privateValue})).toBe(false);
  const privateKnowledge=structuredClone(after.view);Reflect.set(Reflect.get(privateKnowledge,'decision_records')[0].knowledge,'world',{});expect(valid_response({request_id:'private-knowledge',ok:true,view:privateKnowledge})).toBe(false);
  const future=structuredClone(after.view);Reflect.get(future,'return_reports')[0].delivery.received=107001;expect(valid_response({request_id:'future',ok:true,view:future})).toBe(false);
 }finally{await store.delete();}
});

test('B24 T01 prefix confirmations keep their original HQ knowledge and do not defer recording until the later debrief ticket',async()=>{
 const store=new Persistence('b24-owned-t01-original-prefix-decisions');
 try{
  const game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),'research','create');
  const planEnvelope={run_id:initial.run_id,operation_id:'save-plan',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'保留这次计划确认的当时认知',repair_packs:2}}};
  const plan=await game.apply_outcome_intent(planEnvelope),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'move-R',expected_revision:plan.view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
  expect(issued.view).toMatchObject({decision_records:[{operation_id:'save-plan',at:0,knowledge:{plan:null},reason:{kind:'not_recorded'}},{operation_id:'move-R',at:0,knowledge:{plan:{purpose:'保留这次计划确认的当时认知'}},reason:{kind:'not_recorded'}}],continuation_records:[]});
  const records=structuredClone(issued.view.decision_records),after=await game.control_clock({run_id:initial.run_id,operation_id:'arrived-A',expected_revision:issued.view.revision,intent:{kind:'advance',to:32000}});
  expect(Reflect.get(after.view,'decision_records')).toEqual(records);expect((await game.apply_outcome_intent(planEnvelope)).receipt).toEqual(plan.receipt);expect(Reflect.get(await game.get_view(initial.run_id),'decision_records')).toEqual(records);expect(valid_response({request_id:'prefix-records',ok:true,...after})).toBe(true);
 }finally{await store.delete();}
});

test('B24 T01 optional player reason is immutable, while completed return retries cannot invent another decision or repeat the batch',async()=>{
 const store=new Persistence('b24-owned-t01-optional-return-reason');
 try{
  const game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const envelope={run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000},reason:'先接收这一组人员，不等待另一组。'}};
  const issued=await game.return_and_deliver(envelope);expect(issued.view).toMatchObject({decision_records:[{reason:{kind:'recorded',text:envelope.intent.reason}}]});
  const completed=await game.control_clock({run_id:initial.run_id,operation_id:'completed',expected_revision:issued.view.revision,intent:{kind:'advance',to:107000}}),before=await game.get_actor_view(initial.run_id,'H');
  expect((await game.return_and_deliver(envelope)).receipt).toEqual(issued.receipt);await expect(game.return_and_deliver({...envelope,intent:{...envelope.intent,reason:'事后更换理由'}})).rejects.toThrow('OPERATION_ID_REUSED');
  await expect(game.return_and_deliver({...envelope,operation_id:'return-again',expected_revision:completed.view.revision})).rejects.toThrow('CAPACITY_CONFLICT');expect(await game.get_actor_view(initial.run_id,'H')).toEqual(before);expect(await game.get_view(initial.run_id)).toEqual(completed.view);expect(Reflect.get(completed.view,'decision_records')).toEqual(issued.view.decision_records);expect(valid_response({request_id:'recorded-reason',ok:true,...completed})).toBe(true);
 }finally{await store.delete();}
});

test('B24 E58 the recipient checks the frozen effective window at actual delivery, not only at HQ signature',async()=>{
 const store=new Persistence('b24-owned-t01-expired-return-window');
 try{
  const game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:500}}});
  const after=await game.control_clock({run_id:initial.run_id,operation_id:'past-window',expected_revision:issued.view.revision,intent:{kind:'advance',to:2000}});
  expect(after.view).toMatchObject({return_plans:[{actor:'W',status:'hold',accepted_at:null}],return_reports:[{report:{phase:'refused'}}],continuation_records:[]});expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({position:{site:'B',point:[250,150]},resources:{movement_energy:20,movement_energy_reserved:0}});
 }finally{await store.delete();}
});

test('B24 E58 a syntactically valid future delivery cannot become a return basis before HQ receives it',async()=>{
 const store=new Persistence('b24-owned-t01-invisible-return-basis');
 try{
  const game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  await expect(game.return_and_deliver({run_id:initial.run_id,operation_id:'future-basis',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[ref('report_delivery','D-R3')],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).rejects.toThrow('EVIDENCE_REQUIRED');
  expect(await game.get_view(initial.run_id)).toEqual(initial);expect(await game.get_receipt(initial.run_id,'future-basis')).toBeNull();
 }finally{await store.delete();}
});
