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
