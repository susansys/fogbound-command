import {expect,test} from 'vitest';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';

test.each(['AUTHORITY_DENIED','EVIDENCE_REQUIRED','CONSTRAINT_HOLD','CONSTRAINT_DENIED','CAPACITY_CONFLICT','STATE_CONFIRMATION_REQUIRED'])('B22 the public %s refusal crosses Transport without becoming CHANNEL_UNCERTAIN',code=>{
  expect(valid_response({request_id:'actual-refusal',ok:false,code})).toBe(true);
  expect(valid_response({request_id:'private-detail',ok:false,code,world_position:[50,150]})).toBe(false);
});

test('B22 issue requests and the actual frozen order view cross the Worker seam without client identity',async()=>{
  const store=new Persistence('b22-owned-t02-issue-protocol');
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),draft=mission_draft(initial.run_id);
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}}),preview=await game.preview_plan(initial.run_id,saved.view.revision,0,draft);
    const ref=<K extends string>(kind:K,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const envelope={run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission' as const,expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview,evidence_refs:['B22-INITIAL-POSITION']}};
    expect(valid_request({request_id:'send',kind:'issue_mission',envelope})).toBe(true);
    const issued=await game.issue_order(envelope);
    expect(valid_response({request_id:'send',ok:true,...issued})).toBe(true);
    expect(valid_request({request_id:'fake',kind:'issue_mission',envelope,actor_context:'commander'})).toBe(false);
  }finally{await store.delete();}
});

test.each(['unresolved','delivered','conflicting'] as const)('B22 actual %s mission knowledge crosses the strict Worker response seam',async kind=>{
  const variant=await mission_variant(value=>{
    if(kind==='unresolved')value.catalogs.initial_evidence.scope_ref='pending-location';
    else value.catalogs.position_reports=[{id:'position-report',origin:'R',target:'HQ',scope_ref:'A',observed:{kind:'known',value:kind==='delivered'?1000:0,evidence:'position-report'},source_event_time:{kind:'unknown'},reported_at:1000,delivery_at:2000}];
  }),store=new Persistence('b22-owned-t02-response-'+kind,[],[variant]);
  try{
    const game=new Game(store),initial=await game.create_run(variant,'research','create');
    const view=kind==='unresolved'?initial:(await game.control_clock({run_id:initial.run_id,operation_id:'advance',expected_revision:1,intent:{kind:'advance',to:2000}})).view;
    expect(valid_response({request_id:'legal',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});
test('B22 T01 Worker boundary carries only the discriminated mission request and legal mission view',async()=>{
  const store=new Persistence('b22-owned-t01-protocol');
  try{
    expect(valid_request({request_id:'new',kind:'create',mode:'research',operation_id:'create',definition_ref:'B22-MISSION-01'})).toBe(true);
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    expect(valid_response({request_id:'new',ok:true,view})).toBe(true);
    const draft=mission_draft(view.run_id),preview=await game.preview_plan(view.run_id,view.revision,4,draft);
    expect(valid_request({request_id:'preview',kind:'preview_mission',run_id:view.run_id,revision:1,editing_seq:4,draft})).toBe(true);
    expect(valid_response({request_id:'preview',ok:true,mission_preview:preview})).toBe(true);
    expect(valid_request({request_id:'fake',kind:'preview_mission',run_id:view.run_id,revision:1,editing_seq:4,draft,actor_context:'commander'})).toBe(false);
    expect(valid_response({request_id:'leak',ok:true,view:{...view,engine_conditions:{hidden:true}}})).toBe(false);
  }finally{await store.delete();}
});

test.each(['private_condition','false_authorization'] as const)('B22 strict gate preview DTO rejects %s corruption',async kind=>{
  const store=new Persistence('b22-owned-t02-gate-dto-'+kind);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),preview=await game.preview_plan(view.run_id,view.revision,0,mission_draft(view.run_id));
    expect(valid_response({request_id:'legal',ok:true,mission_preview:preview})).toBe(true);
    if(kind==='private_condition')Reflect.set(preview.phases[0].gate.conditions[0],'condition',{kind:'compare',field_ref:'world.position',operator:'eq',typed_value:[50,150]});
    if(kind==='false_authorization')preview.phases[0].authorization.dimensions.space=false;
    expect(valid_response({request_id:'corrupt',ok:true,mission_preview:preview})).toBe(false);
  }finally{await store.delete();}
});

test('B22 a definite stale pause can carry only a strict legal current mission view',async()=>{
  const store=new Persistence('b22-owned-t03-stale-pause-view');
  try{
    const view=await new Game(store).create_run(definition,'research','create');
    expect(valid_response({request_id:'stale-pause',ok:false,code:'STALE_REVISION',mission_view:view})).toBe(true);
    expect(valid_response({request_id:'wrong-error',ok:false,code:'AUTHORITY_DENIED',mission_view:view})).toBe(false);
    expect(valid_response({request_id:'private-view',ok:false,code:'STALE_REVISION',mission_view:{...view,world:{position:[250,150]}}})).toBe(false);
    expect(valid_response({request_id:'not-current-proof',ok:false,code:'STALE_REVISION',mission_view:{...view,mission:{id:'M1',status:'completed'}}})).toBe(false);
  }finally{await store.delete();}
});

test('B22 actual readonly evaluation and separate explanation cross Transport without user-supplied identity or record upload',async()=>{
  const store=new Persistence('b22-owned-t04-record-transport');
  try{
    const game=new Game(store),created=await game.create_run(definition,'research','create'),draft=mission_draft(created.run_id),saved=await game.save_plan({run_id:created.run_id,operation_id:'save',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const ref=<K extends string>(kind:K,id:string)=>({run_id:created.run_id,kind,id,version:1});
    const issued=await game.issue_order({run_id:created.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:saved.view.mission!.object_revision,plan_ref:saved.view.mission!.current_plan_ref,phase_ref:ref('phase','P1'),grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(created.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}}),decision_ref=ref('decision',issued.view.decision_records[0].id);
    const request={kind:'evaluate_decision',request_id:'evaluate',run_id:created.run_id,view_revision:issued.view.revision,decision_ref};
    expect(valid_request(request)).toBe(true);expect(valid_request({...request,record:issued.view.decision_records[0]})).toBe(false);expect(valid_request({...request,actor_context:'commander'})).toBe(false);
    const evaluation=await game.evaluate_decision({run_id:created.run_id,view_revision:issued.view.revision,decision_ref});expect(valid_response({request_id:'evaluate',ok:true,mission_evaluation:evaluation})).toBe(true);
    for(const corrupt of ['private_field','score','wrong_rule','wrong_version','reordered_rules','foreign_reference','missing_decision_ref','met_with_missing','violation_without_proof','unknown_missing','unknown_violation','unregistered_source'] as const){
      const bad=structuredClone(evaluation);
      if(corrupt==='private_field')Reflect.set(bad,'world_position',[250,150]);if(corrupt==='score')Reflect.set(bad,'score',100);
      if(corrupt==='wrong_rule')Reflect.set(bad.checks[0].rule_ref,'id','final_result');if(corrupt==='wrong_version')bad.checks[0].rule_ref.version=2;
      if(corrupt==='reordered_rules')bad.checks.reverse();if(corrupt==='foreign_reference')bad.checks[0].known_then_refs[1].run_id='unregistered-other-run';
      if(corrupt==='missing_decision_ref')bad.checks[0].known_then_refs.shift();if(corrupt==='met_with_missing')bad.checks[0].missing=['resources'];
      if(corrupt==='violation_without_proof')bad.checks[1].result='violated';if(corrupt==='unknown_missing')bad.checks[2].missing=['private_world'];
      if(corrupt==='unknown_violation'){bad.checks[1].result='violated';bad.checks[1].violations=['PRIVATE_CONDITION_FALSE'];}
      if(corrupt==='unregistered_source')Reflect.set(bad,'record_source',{kind:'registered_history',catalog_ref:'uploaded-records',source_ref:'arbitrary'});
      expect(valid_response({request_id:'bad-'+corrupt,ok:true,mission_evaluation:bad}),corrupt).toBe(false);
    }
    const envelope={run_id:created.run_id,operation_id:'append',expected_revision:issued.view.revision,intent:{kind:'append_explanation' as const,decision_ref,expected_object_revision:0,text:'事后补充，原理由保留'}};
    expect(valid_request({kind:'append_explanation',request_id:'append',envelope})).toBe(true);expect(valid_request({kind:'append_explanation',request_id:'append',envelope,actor_context:'commander'})).toBe(false);
    expect(valid_response({request_id:'append',ok:true,...await game.append_explanation(envelope)})).toBe(true);
  }finally{await store.delete();}
});
