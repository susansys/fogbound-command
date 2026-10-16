import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';
import type {IssueMissionEnvelope,MissionDecisionRecord,MissionEvaluationRecord,MissionDecisionHistory,AppendMissionExplanation} from '../src/mission-contracts';
import {valid_response} from '../src/dto';

function canonical_public(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical_public);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>[key,canonical_public(entry)]));
  return value;
}
async function decision_fixture(store:Persistence,reason?:string,selectedEvidence?:string[]){
  const game=new Game(store),created=await game.create_run(definition,'research','create'),draft=mission_draft(created.run_id);
  const saved=await game.save_plan({run_id:created.run_id,operation_id:'save',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
  const input:IssueMissionEnvelope={run_id:created.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:saved.view.mission!.object_revision,plan_ref:saved.view.mission!.current_plan_ref,phase_ref:{run_id:created.run_id,kind:'phase',id:'P1',version:1},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(created.run_id,saved.view.revision,0,draft),evidence_refs:selectedEvidence??draft.evidence_refs,...(reason===undefined?{}:{reason})}};
  const issued=await game.issue_order(input),record=issued.view.decision_records[0],ref={run_id:created.run_id,kind:'decision' as const,id:record.id,version:record.version};
  return {game,created,saved,input,issued,record,ref};
}

test('B22 PG30 successful issue automatically records the lawful then-context once with no invented reason',async()=>{
  const store=new Persistence('b22-owned-t04-auto-decision');
  try{
    const game=new Game(store),created=await game.create_run(definition,'research','create'),draft=mission_draft(created.run_id);
    const saved=await game.save_plan({run_id:created.run_id,operation_id:'save-original',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}}),before=saved.view;
    const input:IssueMissionEnvelope={run_id:before.run_id,operation_id:'issue-without-reason',expected_revision:before.revision,intent:{kind:'issue_mission',expected_object_revision:before.mission!.object_revision,plan_ref:before.mission!.current_plan_ref,phase_ref:{run_id:before.run_id,kind:'phase',id:'P1',version:1},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(before.run_id,before.revision,0,draft),evidence_refs:draft.evidence_refs}};
    const issued=await game.issue_order(input),records=Reflect.get(issued.view,'decision_records') as MissionDecisionRecord[];
    expect(records).toHaveLength(1);const record=records[0];
    expect(record).toMatchObject({run_id:before.run_id,version:1,actor:'staff',operation:'issue_mission',knowledge_revision:before.revision,at:0,actual_intent:draft.intent,selected_action:draft.phases[0].activity,plan_ref:input.intent.plan_ref,phase_ref:input.intent.phase_ref,authority_ref:input.intent.grant_ref,order_ref:issued.view.issued_orders[0].id,evidence_refs:draft.evidence_refs,reason_status:'not_recorded'});
    expect(record).not.toHaveProperty('declared_reason');
    // Independent standard SHA of the actual legal before-view catches hashing
    // private State or an earlier/later view instead of the deciding HQ view.
    expect(record.view_digest).toBe(createHash('sha256').update(JSON.stringify(canonical_public(before))).digest('hex'));
    expect(record.known_then).toMatchObject({mission:before.mission,plan:before.plans[0],position_knowledge:before.position_knowledge,resources:before.resources,phase_results:[],prior_orders:[],held_windows:[],outbound_sent_times:[],selected_received_evidence:[]});
    expect(JSON.stringify(record)).not.toMatch(/"(?:world|local|attempts|executions|sent_reports|pending_reports)":/);
    expect(valid_response({request_id:'decision-result',ok:true,...issued})).toBe(true);
    const committed=await store.read_committed(before.run_id),duplicate=await game.issue_order(input);
    expect(duplicate).toEqual(issued);expect(await store.read_committed(before.run_id)).toEqual(committed);
  }finally{await store.delete();}
});

test('B22 PG30 readonly finite evaluation distinguishes complete public context from an absent declared reason',async()=>{
  const store=new Persistence('b22-owned-t04-evaluate-no-reason');
  try{
    const game=new Game(store),created=await game.create_run(definition,'research','create'),draft=mission_draft(created.run_id);
    const saved=await game.save_plan({run_id:created.run_id,operation_id:'save',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const issued=await game.issue_order({run_id:created.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:saved.view.mission!.object_revision,plan_ref:saved.view.mission!.current_plan_ref,phase_ref:{run_id:created.run_id,kind:'phase',id:'P1',version:1},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(created.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}});
    const record=issued.view.decision_records[0],ref={run_id:created.run_id,kind:'decision' as const,id:record.id,version:record.version},before=await store.read_committed(created.run_id);
    const result=await game.evaluate_decision({run_id:created.run_id,view_revision:issued.view.revision,decision_ref:ref});
    expect(result.decision_ref).toEqual(ref);expect(result.view_revision).toBe(issued.view.revision);expect(result.known_at_time_ms).toBe(0);
    expect(result.checks.map(c=>[c.rule_ref.id,c.rule_ref.version,c.result])).toEqual([['context_completeness',1,'met'],['public_rule_compliance',1,'met'],['declared_reason_evaluability',1,'not_evaluable']]);
    expect(result.checks[0].known_then_refs).toEqual([ref,record.plan_ref,record.authority_ref]);expect(result.checks[2].known_then_refs).toEqual([ref]);expect(result.checks[2].missing).toEqual(['declared_reason']);
    expect(result).not.toHaveProperty('score');expect(await store.read_committed(created.run_id)).toEqual(before);expect(await game.get_view(created.run_id)).toEqual(issued.view);
  }finally{await store.delete();}
});

test.each(['B22-STATIC-GRANT','B21-INITIAL-TERRAIN','B21-INITIAL-ENVIRONMENT'])('B22 evaluation recognizes genuinely selected registered public evidence %s',async evidence=>{
  const store=new Persistence('b22-owned-t04-selected-'+evidence);
  try{
    const {game,issued,record,ref}=await decision_fixture(store,undefined,[evidence]),before=await store.read_committed(issued.view.run_id);expect(record.evidence_refs).toEqual([evidence]);
    const checked=await game.evaluate_decision({run_id:issued.view.run_id,view_revision:issued.view.revision,decision_ref:ref});expect(checked.checks.map(c=>c.result)).toEqual(['met','met','not_evaluable']);expect(checked.checks[0].missing).toEqual([]);expect(checked.checks[1].missing).toEqual([]);expect(await store.read_committed(issued.view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test.each(['report','delivery'] as const)('B22 evaluation preserves genuinely selected previously received acceptance %s',async selected=>{
  const store=new Persistence('b22-owned-t04-selected-acceptance-'+selected);
  try{
    const {game,issued}=await decision_fixture(store),run=issued.view.run_id;
    const arrived=await game.control_clock({run_id:run,operation_id:'arrived',expected_revision:issued.view.revision,intent:{kind:'advance',to:31500}});
    const before=await game.control_clock({run_id:run,operation_id:'next-window',expected_revision:arrived.view.revision,intent:{kind:'advance',to:32000}});if(before.view.scenario_kind!=='play_mission')throw Error('Expected mission view');const draft=before.view.plans[0].draft;
    const acceptance=before.view.reports.find(r=>r.kind==='accepted')!,delivery=before.view.deliveries.find(d=>d.report_ref===acceptance.id)!;
    expect(delivery.received).toBe(2000);expect(before.view.phase_results[0].known_report_delivery_refs).not.toContain(acceptance.id);
    const next=await game.issue_order({run_id:run,operation_id:'second-issue',expected_revision:before.view.revision,intent:{kind:'issue_mission',expected_object_revision:before.view.mission!.object_revision,plan_ref:before.view.mission!.current_plan_ref,phase_ref:{run_id:run,kind:'phase',id:'P2',version:1},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(run,before.view.revision,0,draft),evidence_refs:[selected==='report'?acceptance.id:delivery.id]}});
    const decision=next.view.decision_records[1],ref={run_id:run,kind:'decision' as const,id:decision.id,version:1};
    expect(decision.known_then.selected_received_evidence).toEqual([{kind:'mission_report',run_id:run,report_ref:acceptance.id,delivery_ref:delivery.id,origin:'R',target:'HQ',reported_at:1000,received_at:2000}]);
    const result=await game.evaluate_decision({run_id:run,view_revision:next.view.revision,decision_ref:ref});expect(result.checks.map(c=>c.result)).toEqual(['met','met','not_evaluable']);expect(valid_response({request_id:'selected-received',ok:true,...next})).toBe(true);
    for(const mutation of [{run_id:'foreign-run'},{received_at:32001},{delivery_ref:'unpaired-delivery'},{report_ref:'unselected-report'},{kind:'position_report',delivery_ref:'unpaired-delivery'}]){
      const forged=structuredClone(next);Object.assign(forged.view.decision_records[1].known_then.selected_received_evidence[0],mutation);expect(valid_response({request_id:'forged-received',ok:true,...forged})).toBe(false);
    }
    const restored=await new Game(store).restore(run,'restore-selected'),rechecked=await game.evaluate_decision({run_id:run,view_revision:restored.view.revision,decision_ref:ref});if(restored.view.scenario_kind!=='play_mission')throw Error('Expected mission view');expect(rechecked.checks).toEqual(result.checks);expect(restored.view.decision_records[1]).toEqual(decision);
    const past=await game.get_replay(run,0,next.view.revision);expect((await past.evaluate_decision({run_id:run,view_revision:next.view.revision,decision_ref:ref})).checks).toEqual(result.checks);
  }finally{await store.delete();}
});

test('B22 a selected old delivered position remains lawful after newer arrival replaces the current position',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.position_reports=[{id:'old-H-position',origin:'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:1000,evidence:'old-H-position'},source_event_time:{kind:'unknown'},reported_at:1000,delivery_at:2000}];}),store=new Persistence('b22-owned-t04-selected-old-position',[],[variant]);
  try{
    const game=new Game(store),created=await game.create_run(variant,'research','create'),draft=mission_draft(created.run_id),saved=await game.save_plan({run_id:created.run_id,operation_id:'save',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const issue=async(id:string,phase:string,view:typeof saved.view,refs:string[])=>game.issue_order({run_id:view.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_mission',expected_object_revision:view.mission!.object_revision,plan_ref:view.mission!.current_plan_ref,phase_ref:{run_id:view.run_id,kind:'phase',id:phase,version:1},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(view.run_id,view.revision,0,draft),evidence_refs:refs}});
    const first=await issue('issue-first','P1',saved.view,draft.evidence_refs),before=await game.control_clock({run_id:created.run_id,operation_id:'next-window',expected_revision:first.view.revision,intent:{kind:'advance',to:32000}});
    if(before.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(before.view.position_knowledge).toMatchObject({status:'known_scope',observed:{kind:'known',value:30500}});
    const second=await issue('issue-second','P2',before.view,['old-H-position']),decision=second.view.decision_records[1],ref={run_id:created.run_id,kind:'decision' as const,id:decision.id,version:1};
    expect(decision.known_then.selected_received_evidence).toEqual([{kind:'position_report',run_id:created.run_id,report_ref:'old-H-position',delivery_ref:'position-delivery-old-H-position',origin:'R',target:'HQ',reported_at:1000,received_at:2000,position_source:{report:{...variant.catalogs.position_reports![0],run_id:created.run_id},delivery:{id:'position-delivery-old-H-position',run_id:created.run_id,report_ref:'old-H-position',received:2000}}}]);
    expect((await game.evaluate_decision({run_id:created.run_id,view_revision:second.view.revision,decision_ref:ref})).checks.map(c=>c.result)).toEqual(['met','met','not_evaluable']);expect(valid_response({request_id:'old-position',ok:true,...second})).toBe(true);
    for(const mutation of ['pair','run','time','scope'] as const){
      const forged=structuredClone(second),proof=forged.view.decision_records[1].known_then.selected_received_evidence[0];if(proof.kind!=='position_report')throw Error('Expected position source');
      if(mutation==='pair')proof.position_source.delivery.report_ref='another-report';
      if(mutation==='run')proof.position_source.report.run_id='another-run';
      if(mutation==='time')proof.position_source.report.observed={kind:'known',value:32001,evidence:proof.report_ref};
      if(mutation==='scope')proof.position_source.report.scope_ref='unregistered-scope';
      expect(valid_response({request_id:'forged-old-position',ok:true,...forged})).toBe(false);
    }
    const restored=await new Game(store).restore(created.run_id,'restore');if(restored.view.scenario_kind!=='play_mission')throw Error('Expected mission view');expect(restored.view.decision_records[1]).toEqual(decision);
  }finally{await store.delete();}
});

test.each(['','   ','  按当时公开依据先核对联络点  '])('B22 PG30 preserves optional declaration %j without inventing a reason or scoring its quality',async(reason)=>{
  const store=new Persistence('b22-owned-t04-reason-'+reason.length);
  try{
    const {game,issued,record,ref}=await decision_fixture(store,reason),present=reason.trim().length>0;
    expect(record.reason_status).toBe(present?'recorded':'not_recorded');expect(record.declared_reason).toBe(present?reason:undefined);expect(Object.hasOwn(record,'declared_reason')).toBe(present);
    const before=await store.read_committed(issued.view.run_id),result=await game.evaluate_decision({run_id:issued.view.run_id,view_revision:issued.view.revision,decision_ref:ref});
    expect(result.checks.map(c=>c.result)).toEqual(['met','met',present?'met':'not_evaluable']);expect(result.checks[2].missing).toEqual(present?[]:['declared_reason']);expect(result).not.toHaveProperty('score');expect(await store.read_committed(issued.view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test('B22 PG30/36 actual later arrival and paused recovery do not rewrite the decision or evaluate it with newer HQ evidence',async()=>{
  const store=new Persistence('b22-owned-t04-decision-history');
  try{
    const {game,issued,record,ref,saved}=await decision_fixture(store),initial=await game.evaluate_decision({run_id:issued.view.run_id,view_revision:issued.view.revision,decision_ref:ref});
    const physical=await game.control_clock({run_id:issued.view.run_id,operation_id:'private-arrived',expected_revision:issued.view.revision,intent:{kind:'advance',to:30500}});
    const received=await game.control_clock({run_id:issued.view.run_id,operation_id:'arrival-received',expected_revision:physical.view.revision,intent:{kind:'advance',to:31500}}),restored=await game.restore(issued.view.run_id,'restore-record');
    expect(received.view).toMatchObject({position_knowledge:{status:'known_scope',scope:{kind:'point',typed_geometry:{position:[150,150]},uncertainty:{kind:'known',value:0}},provenance:{kind:'delivered'}}});expect(restored.view).toMatchObject({paused:true,sim_time:31500});
    if(restored.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(restored.view.decision_records).toEqual([record]);expect(record.known_then.position_knowledge).toMatchObject({status:'known_scope',scope:{id:'H'}});
    const after=await store.read_committed(issued.view.run_id),current=await game.evaluate_decision({run_id:issued.view.run_id,view_revision:restored.view.revision,decision_ref:ref});expect(current.checks).toEqual(initial.checks);expect(await store.read_committed(issued.view.run_id)).toEqual(after);
    const history=await game.get_replay(issued.view.run_id,0,issued.view.revision),past=await history.evaluate_decision({run_id:issued.view.run_id,view_revision:issued.view.revision,decision_ref:ref});expect(past.checks).toEqual(initial.checks);
    const earlier=await game.get_replay(issued.view.run_id,0,saved.view.revision);await expect(earlier.evaluate_decision({run_id:issued.view.run_id,view_revision:saved.view.revision,decision_ref:ref})).rejects.toThrow('INVALID_REQUEST');expect(await store.read_committed(issued.view.run_id)).toEqual(after);
  }finally{await store.delete();}
});

test.each(['stale','foreign_run','wrong_version','uploaded_record'] as const)('B22 finite evaluation rejects %s without writing a record or advancing the run',async(kind)=>{
  const store=new Persistence('b22-owned-t04-evaluation-ref-'+kind);
  try{
    const {game,issued,record,ref}=await decision_fixture(store),request:Record<string,unknown>={run_id:issued.view.run_id,view_revision:issued.view.revision,decision_ref:ref};
    if(kind==='stale')request.view_revision=issued.view.revision-1;
    if(kind==='foreign_run')request.decision_ref={...ref,run_id:'unregistered-other-run'};
    if(kind==='wrong_version')request.decision_ref={...ref,version:2};
    if(kind==='uploaded_record')request.record=record;
    const before=await store.read_committed(issued.view.run_id);await expect(game.evaluate_decision(request)).rejects.toThrow(kind==='stale'?'STALE_REVISION':'INVALID_REQUEST');expect(await store.read_committed(issued.view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test('B22 PG31 the registered historical public violation and missing-material pair use the same readonly evaluation without accepting an illegal order',async()=>{
  const sourceStore=new Persistence('b22-owned-t04-history-source');let store:Persistence|undefined;
  try{
    const source=new Game(sourceStore),created=await source.create_run(definition,'research','create-source'),draft=mission_draft(created.run_id);draft.intent.acceptable_risk='outside-registered-risk';
    const saved=await source.save_plan({run_id:created.run_id,operation_id:'save-denied-plan',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}}),view=saved.view,beforeSource=await sourceStore.read_committed(created.run_id);
    await expect(source.issue_order({run_id:created.run_id,operation_id:'illegal-normal-issue',expected_revision:view.revision,intent:{kind:'issue_mission',expected_object_revision:view.mission!.object_revision,plan_ref:view.mission!.current_plan_ref,phase_ref:{run_id:view.run_id,kind:'phase',id:'P1',version:1},grant_ref:draft.intent.delegation_ref,preview:await source.preview_plan(view.run_id,view.revision,0,draft),evidence_refs:draft.evidence_refs}})).rejects.toThrow('AUTHORITY_DENIED');
    expect(await sourceStore.read_committed(created.run_id)).toEqual(beforeSource);
    // Author the explicitly approved historical mechanism directory from real
    // lawful public context before registering its complete package. This is
    // not an accepted order or a State/Report insert into either Game.
    const complete:MissionEvaluationRecord={id:'history-public-risk-choice',run_id:view.run_id,version:1,actor:'staff',operation:'issue_mission',knowledge_revision:view.revision,view_digest:createHash('sha256').update(JSON.stringify(canonical_public(view))).digest('hex'),at:view.sim_time,actual_intent:structuredClone(draft.intent),selected_action:structuredClone(draft.phases[0].activity),plan_ref:view.mission!.current_plan_ref,phase_ref:{run_id:view.run_id,kind:'phase',id:'P1',version:1},authority_ref:draft.intent.delegation_ref,order_ref:'history-attempt-no-current-order',evidence_refs:[...draft.evidence_refs],reason_status:'not_recorded',known_then:{mission:structuredClone(view.mission!),plan:structuredClone(view.plans[0]),position_knowledge:structuredClone(view.position_knowledge),resources:structuredClone(view.resources),phase_results:[],prior_orders:[],held_windows:[],outbound_sent_times:[],selected_received_evidence:[]}};
    const missing=structuredClone(complete);missing.id='history-missing-position';delete missing.known_then.position_knowledge;
    const history:MissionDecisionHistory={id:'B22-AT236-HISTORY-01',version:1,source_ref:'B22-MISSION-DESIGN-1.0.0/mission-contract/AT236/registered-history',records:[{case_id:'complete_public_violation',record:complete},{case_id:'missing_necessary_evidence',record:missing}]};
    const variant=await mission_variant(value=>{Reflect.set(value.catalogs,'decision_history',history);});
    store=new Persistence('b22-owned-t04-registered-history',[],[variant]);const game=new Game(store),current=await game.create_run(variant,'research','create-catalog-run'),before=await store.read_committed(current.run_id);
    const assess=(record:MissionEvaluationRecord)=>game.evaluate_decision({run_id:current.run_id,view_revision:current.revision,decision_ref:{run_id:record.run_id,kind:'decision',id:record.id,version:record.version}});
    const full=await assess(complete),partial=await assess(missing);
    expect(full.checks.map(c=>c.result)).toEqual(['met','violated','not_evaluable']);expect(full.checks[1].violations).toEqual(['AUTHORITY_DENIED']);expect(full.checks[1].rule_ref).toEqual({id:'public_rule_compliance',version:1});
    expect(partial.checks.map(c=>c.result)).toEqual(['not_evaluable','not_evaluable','not_evaluable']);expect(partial.checks[1].missing).toEqual(['position_knowledge']);
    expect(full.record_source).toEqual({kind:'registered_history',catalog_ref:history.id,source_ref:history.source_ref});expect(full.run_id).toBe(current.run_id);expect(full.decision_ref.run_id).toBe(complete.run_id);
    expect(await store.read_committed(current.run_id)).toEqual(before);expect(await sourceStore.read_committed(created.run_id)).toEqual(beforeSource);
    const publicView=await game.get_view(current.run_id);expect(publicView).toMatchObject({decision_records:[],issued_orders:[],resources:{movement_energy:20,equipment_energy:16,hq_energy:16}});
  }finally{await store?.delete();await sourceStore.delete();}
});

test('B22 PG32 appends a separate atomic retrospective layer while the original reason, context and checks stay unchanged',async()=>{
  const store=new Persistence('b22-owned-t04-retrospective-append');
  try{
    const {game,issued,record,ref}=await decision_fixture(store),later=await game.control_clock({run_id:issued.view.run_id,operation_id:'later-time',expected_revision:issued.view.revision,intent:{kind:'advance',to:2000}}),before=await store.read_committed(issued.view.run_id);
    const originalCheck=await game.evaluate_decision({run_id:issued.view.run_id,view_revision:later.view.revision,decision_ref:ref});
    const input={run_id:issued.view.run_id,operation_id:'append-retrospective',expected_revision:later.view.revision,intent:{kind:'append_explanation' as const,decision_ref:ref,expected_object_revision:0,text:'事后回看：当时没有记录理由。'}};
    const appended=await game.append_explanation(input),after=await store.read_committed(issued.view.run_id);
    expect(appended.view.replay_nodes.find(n=>n.revision===issued.view.revision)?.label).toBe('下达阶段指令');
    expect(appended.view.replay_nodes.find(n=>n.revision===appended.view.revision)?.label).toBe('追加事后解释');
    expect(appended.receipt).toMatchObject({kind:'append_explanation',operation_id:input.operation_id,result:'committed'});expect(appended.view.sim_time).toBe(2000);expect(appended.view.decision_records).toEqual([record]);
    expect(appended.view.retrospective_explanations).toHaveLength(1);expect(appended.view.retrospective_explanations[0]).toMatchObject({run_id:issued.view.run_id,version:1,decision_ref:ref,text:input.intent.text,created_time_ms:2000,author:'staff',layer:'retrospective_inference'});
    expect(appended.view.decision_records[0].reason_status).toBe('not_recorded');expect(appended.view.decision_records[0]).not.toHaveProperty('declared_reason');
    for(const key of ['world','local','orders','attempts','executions','phase_results','reports','sent_reports','pending_reports','deliveries','known','rng','held_windows','outbound_messages','plans','mission','decision_records'])expect(Reflect.get(after!,key)).toEqual(Reflect.get(before!,key));
    const result=await game.evaluate_decision({run_id:issued.view.run_id,view_revision:appended.view.revision,decision_ref:ref});expect(result.checks).toEqual(originalCheck.checks);expect(result.checks[2].result).toBe('not_evaluable');expect(valid_response({request_id:'appended',ok:true,...appended})).toBe(true);
    expect(await game.append_explanation(input)).toEqual(appended);expect(await store.read_committed(issued.view.run_id)).toEqual(after);
  }finally{await store.delete();}
});

test.each(['stale_run','stale_object','unknown_record','wrong_version','foreign_run','empty','whitespace','text2001','forged_author'] as const)('B22 PG32 rejects retrospective %s before changing the run',async(kind)=>{
  const store=new Persistence('b22-owned-t04-append-reject-'+kind);
  try{
    const {game,issued,ref}=await decision_fixture(store),input:AppendMissionExplanation={run_id:issued.view.run_id,operation_id:'invalid-append',expected_revision:issued.view.revision,intent:{kind:'append_explanation',decision_ref:{...ref},expected_object_revision:0,text:'事后解释'}};
    if(kind==='stale_run')input.expected_revision--;
    if(kind==='stale_object')input.intent.expected_object_revision=1;
    if(kind==='unknown_record')input.intent.decision_ref.id='missing-decision';
    if(kind==='wrong_version')input.intent.decision_ref.version=2;
    if(kind==='foreign_run')input.intent.decision_ref.run_id='unregistered-other-run';
    if(kind==='empty')input.intent.text='';if(kind==='whitespace')input.intent.text='  ';if(kind==='text2001')input.intent.text='💡'.repeat(2001);
    if(kind==='forged_author')Reflect.set(input.intent,'author','commander');
    const before=await store.read_committed(issued.view.run_id);await expect(game.append_explanation(input)).rejects.toThrow(kind==='stale_run'?'STALE_REVISION':kind==='stale_object'?'OBJECT_VERSION_CONFLICT':'INVALID_REQUEST');expect(await store.read_committed(issued.view.run_id)).toEqual(before);expect(await game.get_receipt(issued.view.run_id,input.operation_id)).toBeNull();
  }finally{await store.delete();}
});

test('B22 PG32/36 explanation versions restore exactly while history and cloned parent remain readonly',async()=>{
  const store=new Persistence('b22-owned-t04-explanation-history-clone');
  try{
    const {game,issued,record,ref}=await decision_fixture(store),input={run_id:issued.view.run_id,operation_id:'explanation-one',expected_revision:issued.view.revision,intent:{kind:'append_explanation' as const,decision_ref:ref,expected_object_revision:0,text:'第一条事后说明'}};
    const one=await game.append_explanation(input),before=await store.read_committed(issued.view.run_id);
    await expect(game.append_explanation({...input,intent:{...input.intent,text:'改写同一操作'}})).rejects.toThrow('OPERATION_ID_REUSED');
    await expect(game.append_explanation({...input,operation_id:'stale-explanation',expected_revision:one.view.revision})).rejects.toThrow('OBJECT_VERSION_CONFLICT');expect(await store.read_committed(issued.view.run_id)).toEqual(before);
    const two=await game.append_explanation({...input,operation_id:'explanation-two',expected_revision:one.view.revision,intent:{...input.intent,expected_object_revision:1,text:'第二条独立说明'}});
    expect(two.view.retrospective_explanations.map(e=>e.version)).toEqual([1,2]);expect(two.view.retrospective_explanations[0]).toEqual(one.view.retrospective_explanations[0]);expect(two.view.decision_records).toEqual([record]);
    const history=await game.get_replay(issued.view.run_id,0,issued.view.revision),old=await history.get_view(issued.view.run_id);expect(old).toMatchObject({retrospective_explanations:[],decision_records:[record]});
    await expect(history.append_explanation({...input,operation_id:'write-history'})).rejects.toThrow('HISTORY_READ_ONLY');
    const fresh=new Game(store),restored=await fresh.restore(issued.view.run_id,'restore-explanations');expect(restored.view).toMatchObject({run_id:issued.view.run_id,paused:true,sim_time:0,retrospective_explanations:two.view.retrospective_explanations,decision_records:[record]});
    const parent=await store.read_committed(issued.view.run_id),clone=await fresh.restart_run(issued.view.run_id,'clone-current');expect(clone.run_id).not.toBe(issued.view.run_id);expect(clone).toMatchObject({source_run:issued.view.run_id,paused:true,decision_records:[],retrospective_explanations:[]});
    const cloned=await store.read_committed(clone.run_id);expect(cloned!.rng.origin).toBe(parent!.rng.origin);expect(cloned!.rng.seed).toBe(parent!.rng.seed);expect(await store.read_committed(issued.view.run_id)).toEqual(parent);
    await expect(fresh.append_explanation({...input,operation_id:'write-parent',expected_revision:restored.view.revision})).rejects.toThrow('HISTORY_READ_ONLY');expect(await store.read_committed(issued.view.run_id)).toEqual(parent);
  }finally{await store.delete();}
});

test('B22 PG32 actual explanation transaction abort preserves the complete prior state and resolves the original identity before a fresh append',async()=>{
  const store=new Persistence('b22-owned-t04-explanation-atomic-abort'),put=IDBObjectStore.prototype.put;
  try{
    const {game,issued,ref,record}=await decision_fixture(store),before=await store.read_committed(issued.view.run_id),input={run_id:issued.view.run_id,operation_id:'aborted-explanation',expected_revision:issued.view.revision,intent:{kind:'append_explanation' as const,decision_ref:ref,expected_object_revision:0,text:'只允许完整追加'}};
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const request=put.apply(this,args);if(this.transaction.db.name===store.name&&this.name==='runs')request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;};
    await expect(game.append_explanation(input)).rejects.toThrow('STORAGE_UNCONFIRMED');IDBObjectStore.prototype.put=put;
    expect(await store.read_committed(issued.view.run_id)).toEqual(before);expect(await game.get_receipt(issued.view.run_id,input.operation_id)).toBeNull();
    const fresh=new Game(store),restored=await fresh.restore(issued.view.run_id,'restore-after-abort');await expect(fresh.append_explanation(input)).rejects.toThrow('STALE_REVISION');
    const appended=await fresh.append_explanation({...input,operation_id:'confirmed-new-explanation',expected_revision:restored.view.revision});expect(appended.view.retrospective_explanations).toHaveLength(1);expect(appended.view.decision_records).toEqual([record]);
  }finally{IDBObjectStore.prototype.put=put;await store.delete();}
});
