import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';
import type {MissionPlayerView} from '../src/mission-contracts';

async function signed_first(store:Persistence,input:unknown=definition){
  const game=new Game(store),created=await game.create_run(input,'research','create');
  const draft=mission_draft(created.run_id);
  const saved=await game.save_plan({run_id:created.run_id,operation_id:'save-original',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
  const issued=await game.issue_order({run_id:created.run_id,operation_id:'issue-first',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:saved.view.mission!.object_revision,plan_ref:saved.view.mission!.current_plan_ref,phase_ref:{run_id:created.run_id,kind:'phase',id:'P1',version:1},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(created.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}});
  if(issued.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
  return {game,view:issued.view};
}

test.each(['intent','objective'] as const)('B22 PG29 cannot rewrite shared signed %s by leaving its phase and route unchanged',async(field)=>{
  const store=new Persistence('b22-owned-t04-shared-signed-'+field);
  try{
    const {game,view}=await signed_first(store),before=await store.read_committed(view.run_id),draft=structuredClone(view.plans[0].draft);
    if(field==='intent'){draft.intent.version=2;draft.intent.purpose='改写已签任务目的';}
    else draft.objective.success_expr={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'A'};
    await expect(game.save_plan({run_id:view.run_id,operation_id:'rewrite-signed-intent',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:view.mission!.current_plan_ref,expected_object_revision:view.mission!.object_revision,draft}})).rejects.toThrow('STATE_CONFIRMATION_REQUIRED');
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'rewrite-signed-intent')).toBeNull();
  }finally{await store.delete();}
});

test('B22 PG28 a lawful blocked report cannot stand in for the predecessor confirmation needed to amend its future phase',async()=>{
  const variant=await mission_variant(value=>{
    value.catalogs.movement_obstacles=[{id:'future-amendment-obstacle',closed_at_x:100}];
    Reflect.set(value.profile.parameters,'future-amendment-obstacle-x',100);
    value.profile.registry.push({...value.profile.registry[0],id:'future-amendment-obstacle-x',value:100,unit:'fictional_metre',source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});
  }),store=new Persistence('b22-owned-t04-no-confirmed-predecessor',[],[variant]);
  try{
    const {game,view:original}=await signed_first(store,variant),progress=await game.control_clock({run_id:original.run_id,operation_id:'blocked-receipt',expected_revision:original.revision,intent:{kind:'advance',to:20000}});
    if(progress.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const view=progress.view,before=await store.read_committed(view.run_id);
    expect(view.issued_orders[0].status).toBe('blocked');expect(view.phase_results).toEqual([]);
    await expect(game.save_plan({run_id:view.run_id,operation_id:'amend-after-blocked',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:view.mission!.current_plan_ref,expected_object_revision:view.mission!.object_revision,draft:future_draft(view)}})).rejects.toThrow('STATE_CONFIRMATION_REQUIRED');
    expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test.each(['intent','phase','route'] as const)('B22 PG28 a stable %s version cannot be reused for different saved content',async(kind)=>{
  const store=new Persistence('b22-owned-t04-stable-version-'+kind);
  try{
    const game=new Game(store),created=await game.create_run(definition,'research','create'),original=mission_draft(created.run_id);
    const saved=await game.save_plan({run_id:created.run_id,operation_id:'save-original',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:original}});
    const before=await store.read_committed(created.run_id),draft=structuredClone(original);
    if(kind==='intent')draft.intent.purpose='第二个明确目的';
    if(kind==='phase')draft.phases[1].latest_finish_time_ms=71000;
    if(kind==='route')draft.routes[1].path=[[150,150],[200,150],[250,150]];
    const input={run_id:created.run_id,operation_id:'reuse-version',expected_revision:saved.view.revision,intent:{kind:'save_plan' as const,base_plan_ref:saved.view.mission!.current_plan_ref,expected_object_revision:saved.view.mission!.object_revision,draft}};
    await expect(game.save_plan(input)).rejects.toThrow('OBJECT_VERSION_CONFLICT');
    expect(await store.read_committed(created.run_id)).toEqual(before);
    if(kind==='intent')draft.intent.version=2;
    if(kind==='phase')draft.phases[1].version=2;
    if(kind==='route'){draft.routes[1].version=2;draft.phases[1].version=2;draft.phases[1].activity.route_ref.version=2;}
    const next=await game.save_plan({...input,operation_id:'save-new-version'});
    expect(next.view.plans).toHaveLength(2);expect(next.view.plans[0].draft).toEqual(original);expect(next.view.plans[1].draft).toEqual(draft);
    expect(next.view.issued_orders).toEqual([]);expect(next.view.resources).toEqual(saved.view.resources);
    const hostile=structuredClone(original);
    if(kind==='intent')hostile.intent.purpose='复用历史版本的第三种内容';
    if(kind==='phase')hostile.phases[1].latest_finish_time_ms=72000;
    if(kind==='route')hostile.routes[1].path=[[150,150],[175,150],[250,150]];
    await expect(game.save_plan({run_id:created.run_id,operation_id:'reuse-older-version',expected_revision:next.view.revision,intent:{kind:'save_plan',base_plan_ref:next.view.mission!.current_plan_ref,expected_object_revision:next.view.mission!.object_revision,draft:hostile}})).rejects.toThrow('OBJECT_VERSION_CONFLICT');
    expect(await game.get_view(created.run_id)).toEqual(next.view);
  }finally{await store.delete();}
});

test.each(['entry_gate','exit_gate','dependencies','remove_phase'] as const)('B22 PG28 future amendment does not rewrite registered %s after signing',async(change)=>{
  const store=new Persistence('b22-owned-t04-future-fields-'+change);
  try{
    const {game,view:original}=await signed_first(store),progress=await game.control_clock({run_id:original.run_id,operation_id:'confirmed-predecessor',expected_revision:original.revision,intent:{kind:'advance',to:31500}});
    if(progress.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const view=progress.view,before=await store.read_committed(view.run_id),draft=structuredClone(view.plans[0].draft);
    draft.phases[1].version=2;
    if(change==='entry_gate')draft.phases[1].entry_gate={kind:'compare',field_ref:'route.permitted',operator:'eq',typed_value:true};
    if(change==='exit_gate')draft.phases[1].exit_gate={kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true};
    if(change==='dependencies')draft.phases[1].dependencies=[];
    if(change==='remove_phase')draft.phases=draft.phases.slice(0,1);
    await expect(game.save_plan({run_id:view.run_id,operation_id:'rewrite-future-structure',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:view.mission!.current_plan_ref,expected_object_revision:view.mission!.object_revision,draft}})).rejects.toThrow('STATE_CONFIRMATION_REQUIRED');
    expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test('B22 the two stable phase budget cannot be escaped by renaming a phase in another plan',async()=>{
  const store=new Persistence('b22-owned-t04-stable-phase-budget');
  try{
    const game=new Game(store),created=await game.create_run(definition,'research','create'),draft=mission_draft(created.run_id);
    const saved=await game.save_plan({run_id:created.run_id,operation_id:'save-two-phases',expected_revision:created.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const before=await store.read_committed(created.run_id);draft.phases[1].id='P3';
    await expect(game.save_plan({run_id:created.run_id,operation_id:'rename-as-third-phase',expected_revision:saved.view.revision,intent:{kind:'save_plan',base_plan_ref:saved.view.mission!.current_plan_ref,expected_object_revision:saved.view.mission!.object_revision,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await store.read_committed(created.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test.each([0,2000,30500,31500])('B22 PG29 a new version cannot replace its already signed phase at %d',async(at)=>{
  const store=new Persistence('b22-owned-t04-signed-phase-'+at);
  try{
    const {game,view:issued}=await signed_first(store),progress=at?await game.control_clock({run_id:issued.run_id,operation_id:'signed-phase-progress',expected_revision:issued.revision,intent:{kind:'advance',to:at}}):{view:issued};
    if(progress.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const view=progress.view,before=await store.read_committed(view.run_id),draft=structuredClone(view.plans[0].draft);
    draft.phases[0].version=2;draft.routes[0].version=2;draft.routes[0].path=[[50,150],[100,150],[150,150]];draft.phases[0].activity.route_ref.version=2;draft.phases[1].version=2;draft.phases[1].dependencies[0].version=2;
    await expect(game.save_plan({run_id:view.run_id,operation_id:'replace-signed-phase',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:view.mission!.current_plan_ref,expected_object_revision:view.mission!.object_revision,draft}})).rejects.toThrow('STATE_CONFIRMATION_REQUIRED');
    expect(await store.read_committed(view.run_id)).toEqual(before);expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,'replace-signed-phase')).toBeNull();
  }finally{await store.delete();}
});

function future_draft(view:MissionPlayerView){
  const draft=structuredClone(view.plans.at(-1)!.draft),phase=draft.phases[1],route=draft.routes[1];
  phase.version=2;phase.earliest_start_time_ms=40000;phase.latest_finish_time_ms=71000;
  route.version=2;route.path=[[150,150],[200,150],[250,150]];phase.activity.route_ref.version=2;
  draft.note='仅修订未签的第二阶段';
  if(view.position_knowledge.status!=='conflicting')draft.evidence_refs=[...view.position_knowledge.evidence_refs];
  return draft;
}

test.each([30500,31500])('B22 PG28 future phase amendment at %d requires actual HQ confirmation and preserves the old result',async(at)=>{
  const store=new Persistence('b22-owned-t04-future-confirmation-'+at);
  try{
    const {game,view:original}=await signed_first(store),progress=await game.control_clock({run_id:original.run_id,operation_id:'first-progress',expected_revision:original.revision,intent:{kind:'advance',to:at}});
    if(progress.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const view=progress.view,before=await store.read_committed(view.run_id),draft=future_draft(view);
    const input={run_id:view.run_id,operation_id:'amend-future',expected_revision:view.revision,intent:{kind:'save_plan' as const,base_plan_ref:view.mission!.current_plan_ref,expected_object_revision:view.mission!.object_revision,draft}};
    if(at===30500){
      expect(view.phase_results).toEqual([]);expect(view.issued_orders[0].status).toBe('accepted');
      await expect(game.save_plan(input)).rejects.toThrow('STATE_CONFIRMATION_REQUIRED');
      expect(await store.read_committed(view.run_id)).toEqual(before);return;
    }
    expect(view.phase_results).toHaveLength(1);
    const saved=await game.save_plan(input),after=await store.read_committed(view.run_id);
    expect(saved.view.mission!.status).toBe('active');
    expect(saved.view.plans).toHaveLength(2);expect(saved.view.plans[0]).toEqual(view.plans[0]);
    expect(saved.view.phase_results).toEqual(view.phase_results);expect(saved.view.issued_orders).toEqual(view.issued_orders);
    expect(saved.view.reports).toEqual(view.reports);expect(saved.view.deliveries).toEqual(view.deliveries);
    for(const key of ['orders','phase_results','reports','deliveries','executions','world','rng'] as const)expect(Reflect.get(after!,key)).toEqual(Reflect.get(before!,key));
    const now=await game.control_clock({run_id:view.run_id,operation_id:'future-issue-time',expected_revision:saved.view.revision,intent:{kind:'advance',to:32000}});
    if(now.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const issued=await game.issue_order({run_id:view.run_id,operation_id:'issue-future',expected_revision:now.view.revision,intent:{kind:'issue_mission',expected_object_revision:now.view.mission!.object_revision,plan_ref:now.view.mission!.current_plan_ref,phase_ref:{run_id:view.run_id,kind:'phase',id:'P2',version:2},grant_ref:draft.intent.delegation_ref,preview:await game.preview_plan(view.run_id,now.view.revision,1,draft),evidence_refs:draft.evidence_refs}});
    const pending=await game.control_clock({run_id:view.run_id,operation_id:'future-arrived-unreceived',expected_revision:issued.view.revision,intent:{kind:'advance',to:69500}});
    expect(pending.view).toMatchObject({mission:{status:'active'},issued_orders:[{status:'arrived'},{status:'accepted'}]});
    const completed=await game.control_clock({run_id:view.run_id,operation_id:'future-result-received',expected_revision:pending.view.revision,intent:{kind:'advance',to:70500}});
    expect(completed.view).toMatchObject({status:'completed',finished:false,phase_results:[{phase_ref:{id:'P1',version:1},plan_ref:{version:1}},{phase_ref:{id:'P2',version:2},plan_ref:{version:2}}],resources:{movement_energy:18,equipment_energy:12,equipment_wear:96,hq_energy:14,hq_wear:98}});
  }finally{await store.delete();}
});
