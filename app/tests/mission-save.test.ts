import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft} from './mission-fixtures';

test.each(['mission','phase','route'] as const)('B22 unresolved %s reference version is rejected before preview or save',async kind=>{
  const store=new Persistence('b22-owned-t01-reference-version-'+kind);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    if(kind==='mission')draft.mission_ref.version=999;
    if(kind==='phase')draft.phases[1].dependencies[0].version=999;
    if(kind==='route')draft.phases[0].activity.route_ref.version=999;
    await expect(game.preview_plan(view.run_id,view.revision,0,draft)).rejects.toThrow('INVALID_REQUEST');
    await expect(game.save_plan({run_id:view.run_id,operation_id:'invalid-version',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'invalid-version')).toBeNull();
  }finally{await store.delete();}
});

test('B22 matching inline phase and route versions survive saving and public readback',async()=>{
  const store=new Persistence('b22-owned-t01-matching-version');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].version=2;draft.phases[1].dependencies[0].version=2;
    draft.routes[0].version=2;draft.phases[0].activity.route_ref.version=2;
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'save-matching-version',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    expect(saved.view.plans[0].draft).toEqual(draft);
    const current=await game.get_view(view.run_id);
    if(current.scenario_kind!=='play_mission')throw Error('Expected the mission public view');
    expect(current.plans[0].draft).toEqual(draft);
  }finally{await store.delete();}
});

test.each(['depth5','nodes33','route65','total129','text2001','wrong_type'] as const)('B22 PG05 %s rejects the complete input without truncating or committing',async variant=>{
  const store=new Persistence('b22-owned-t01-budget-'+variant);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    const input:Record<string,unknown>=draft;
    const leaf={kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true};
    if(variant==='depth5')input.objective={...draft.objective,success_expr:{kind:'not',child:{kind:'not',child:{kind:'not',child:{kind:'not',child:leaf}}}}};
    if(variant==='nodes33')input.objective={...draft.objective,success_expr:{kind:'any',children:Array.from({length:32},()=>({...leaf}))}};
    if(variant==='route65')draft.routes[0].path=Array.from({length:65},(_,i)=>[50+i,150]);
    if(variant==='total129')draft.routes=Array.from({length:3},(_,i)=>({id:'route-P'+(i+1),version:1,path:Array.from({length:43},(_,j)=>[50+j,150])}));
    if(variant==='text2001')draft.note='💡'.repeat(2001);
    if(variant==='wrong_type')input.note=5;
    await expect(game.save_plan({run_id:view.run_id,operation_id:'invalid',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:input}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'invalid')).toBeNull();
  }finally{await store.delete();}
});

test.each(['duplicate_phase','duplicate_route','unknown_scope','point_in','corridor_eq','reverse_route'] as const)('B22 T01 %s cannot become an ambiguous or unregistered saved reference',async variant=>{
  const store=new Persistence('b22-owned-t01-ref-'+variant);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    if(variant==='duplicate_phase'){draft.phases[1].id='P1';draft.phases[1].dependencies=[];}
    if(variant==='duplicate_route'){draft.routes[1].id=draft.routes[0].id;draft.phases[1].activity.route_ref.id=draft.routes[0].id;}
    if(variant==='unknown_scope')draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'does-not-exist'};
    if(variant==='point_in')draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'in',typed_value:'H'};
    if(variant==='corridor_eq')draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'HA'};
    if(variant==='reverse_route')draft.routes[0].path=[[50,150],[150,150],[100,150]];
    await expect(game.save_plan({run_id:view.run_id,operation_id:'invalid-reference',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each(['mission_id','authority_id','objective_dependency'] as const)('B22 T01 %s must resolve within this run and the registered single mission',async variant=>{
  const store=new Persistence('b22-owned-t01-root-'+variant);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    if(variant==='mission_id')draft.mission_ref.id='M2';
    if(variant==='authority_id')draft.intent.delegation_ref.id='missing-grant';
    if(variant==='objective_dependency')draft.objective.dependencies=[{run_id:view.run_id,kind:'objective',id:'missing-objective',version:1}];
    await expect(game.save_plan({run_id:view.run_id,operation_id:'invalid',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 PG05/08 retains 32 versions and rejects version33 without changing old receipts or the current draft',async()=>{
  const store=new Persistence('b22-owned-t01-plan-budget');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    let current:import('../src/mission-contracts').MissionPlayerView|null=null;
    let original:unknown;
    for(let i=0;i<32;i++){
      const draft=mission_draft(view.run_id);draft.note=i===0?'💡'.repeat(2000):'版本'+(i+1);
      const input:import('../src/mission-contracts').SavePlanEnvelope={run_id:view.run_id,operation_id:'save-'+i,expected_revision:i+1,intent:{kind:'save_plan',base_plan_ref:current?.mission?.current_plan_ref??null,expected_object_revision:i,draft}};
      if(i===0)original=structuredClone(input);
      current=(await game.save_plan(input)).view;
    }
    expect(current!.plans).toHaveLength(32);
    expect(current!.plans[0].draft.note).toBe('💡'.repeat(2000));
    const retry=await game.save_plan(original);
    expect(retry.receipt.revision).toBe(2);
    expect(retry.view).toEqual(current);
    await expect(game.save_plan({...original as object,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:mission_draft(view.run_id)}})).rejects.toThrow('OPERATION_ID_REUSED');
    await expect(game.save_plan({run_id:view.run_id,operation_id:'stale-object',expected_revision:33,intent:{kind:'save_plan',base_plan_ref:current!.mission!.current_plan_ref,expected_object_revision:0,draft:mission_draft(view.run_id)}})).rejects.toThrow('OBJECT_VERSION_CONFLICT');
    await expect(game.save_plan({run_id:view.run_id,operation_id:'version33',expected_revision:33,intent:{kind:'save_plan',base_plan_ref:current!.mission!.current_plan_ref,expected_object_revision:32,draft:mission_draft(view.run_id)}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(current);
  }finally{await store.delete();}
});

test('B22 PG01 preview and saving two phases persist an immutable draft without executing or consuming resources',async()=>{
  const store=new Persistence('b22-owned-t01-save');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    const before=await store.read_committed(view.run_id),draft=mission_draft(view.run_id);
    const preview=await game.preview_plan(view.run_id,view.revision,3,draft);
    expect(preview).toMatchObject({editing_seq:3,revision:1,phases:[{phase_id:'P1',estimated_move_ms:29500},{phase_id:'P2',estimated_move_ms:29500,assumptions:['假设前阶段已确认']}]});
    expect(await store.read_committed(view.run_id)).toEqual(before);
    const result=await game.save_plan({run_id:view.run_id,operation_id:'save-plan-1',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    expect(result.view).toMatchObject({revision:2,sim_time:0,mission:{object_revision:1,status:'draft'},plans:[{version:1,draft}],issued_orders:[]});
    expect(await game.get_view(view.run_id)).toEqual(result.view);
    const after=await store.read_committed(view.run_id);
    expect(after?.world).toEqual(before?.world);
    expect(after?.rng).toEqual(before?.rng);
    expect(result.view.resources).toEqual(view.resources);
    expect(result.receipt).toMatchObject({kind:'save_plan',revision:2,result:'committed'});
  }finally{await store.delete();}
});

test('B22 PG06/07 a nonexecutable route and literal note can be saved without any execution side effects',async()=>{
  const store=new Persistence('b22-owned-t01-unauthorized-draft');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),before=await store.read_committed(view.run_id),draft=mission_draft(view.run_id);
    draft.routes[0].path=[[50,150],[50,250]];draft.note='自动维修／尽快执行';
    const preview=await game.preview_plan(view.run_id,1,0,draft);expect(preview.phases[0].estimated_move_ms).toBeNull();expect(preview.phases[0].gap).not.toBe('');
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    expect(saved.view.plans[0].draft.note).toBe('自动维修／尽快执行');expect(saved.view.plans[0].draft.phases.every(p=>p.activity.kind==='move')).toBe(true);expect(saved.view.issued_orders).toEqual([]);
    const after=await store.read_committed(view.run_id);expect(after?.world).toEqual(before?.world);expect(after?.rng).toEqual(before?.rng);
  }finally{await store.delete();}
});

test('B22 PG05 dangling phase reference is rejected without silently dropping it',async()=>{
  const store=new Persistence('b22-owned-t01-dangling');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[1].dependencies[0].id='P3';
    await expect(game.save_plan({run_id:view.run_id,operation_id:'dangling',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 PG04 two distinct phases forming a cycle are rejected without saving a task',async()=>{
  const store=new Persistence('b22-owned-t01-two-cycle');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].dependencies=[{run_id:view.run_id,kind:'phase',id:'P2',version:1}];
    await expect(game.save_plan({run_id:view.run_id,operation_id:'two-cycle',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 PG03 self dependency is rejected before replacing a valid saved draft',async()=>{
  const store=new Persistence('b22-owned-t01-self-cycle');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'save-ok',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const before=await store.read_committed(view.run_id);
    draft.phases[0].dependencies=[{run_id:view.run_id,kind:'phase',id:'P1',version:1}];
    await expect(game.save_plan({run_id:view.run_id,operation_id:'self-cycle',expected_revision:2,intent:{kind:'save_plan',base_plan_ref:saved.view.mission!.current_plan_ref,expected_object_revision:1,draft}})).rejects.toThrow('INVALID_REQUEST');
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_receipt(view.run_id,'self-cycle')).toBeNull();
  }finally{await store.delete();}
});
