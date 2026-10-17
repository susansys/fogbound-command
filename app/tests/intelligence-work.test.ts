import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition,intelligence_variant} from './intelligence-fixtures';
import {intelligence_player_view} from '../src/intelligence-dto';
import type {Receipt} from '../src/contracts';
import type {IntelligencePlayerView} from '../src/intelligence-contracts';

test('B23 preparation draft saving binds a version but does not request processing or reserve supplies',async()=>{
  const store=new Persistence('b23-owned-t02-plan-only');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const envelope={run_id:initial.run_id,operation_id:'save-preparation-draft',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B处记录',repair_packs:2}}};
    const saved=await game.save_plan(envelope);
    expect(saved.receipt).toMatchObject({kind:'save_plan',revision:2,sim_time:0});
    expect(saved.view).toMatchObject({plan:{ref:{run_id:initial.run_id,kind:'plan',id:'P1',version:1},purpose:'取得B处记录',repair_packs:2},processing:{energy_confirmed:20,energy_reserved:0,queue:[]},supply_commitments:[]});
    expect(intelligence_player_view(saved.view)).toBe(true);
    expect((await game.save_plan(envelope)).receipt).toEqual(saved.receipt);
    expect(await new Game(store).get_view(initial.run_id)).toEqual(saved.view);
  }finally{await store.delete();}
});

test('B23 E16 the saved-plan budget rejects version thirty-three through a registered public error with no commit',async()=>{
  const store=new Persistence('b23-owned-t02-plan-budget');
  try{
    const game=new Game(store);let view=await game.create_run(await intelligence_definition(),'research','create');
    let ref:null|{run_id:string;kind:'plan';id:string;version:number}=null;
    for(let version=1;version<=32;version++){
      const saved:{receipt:Receipt;view:IntelligencePlayerView}=await game.save_plan({run_id:view.run_id,operation_id:'draft-'+version,expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:ref,draft:{purpose:'目的 '+version,repair_packs:2}}});
      view=saved.view;if(view.scenario_kind!=='play_intelligence'||!view.plan)throw Error('Expected intelligence draft');ref=view.plan.ref;
    }
    const before=await game.get_view(view.run_id);
    await expect(game.save_plan({run_id:view.run_id,operation_id:'draft-33',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:ref,draft:{purpose:'超出版本预算',repair_packs:2}}})).rejects.toThrow('CONSTRAINT_DENIED');
    expect(await game.get_view(view.run_id)).toEqual(before);expect(await game.get_receipt(view.run_id,'draft-33')).toBeNull();
  }finally{await store.delete();}
});

test('B23 E16 version references identify the same saved draft regardless of JSON key order',async()=>{
  const store=new Persistence('b23-owned-t02-plan-reference-order');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const first=await game.save_plan({run_id:initial.run_id,operation_id:'draft-one',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'原目的',repair_packs:2}}});
    const second=await game.save_plan({run_id:initial.run_id,operation_id:'draft-two',expected_revision:first.view.revision,intent:{kind:'save_plan',base_plan_ref:{version:1,id:'P1',kind:'plan',run_id:initial.run_id},draft:{purpose:'修订目的',repair_packs:2}}});
    expect(second.view).toMatchObject({plan:{ref:{version:2},purpose:'修订目的'},processing:{energy_confirmed:20,energy_reserved:0,queue:[]}});
    const before=await game.get_view(initial.run_id);
    await expect(game.request_preparation({run_id:initial.run_id,operation_id:'stale-plan',expected_revision:before.revision,intent:{kind:'request_preparation',plan_ref:{run_id:initial.run_id,kind:'plan',id:'P1',version:1}}})).rejects.toThrow('STALE_PLAN');
    expect(await game.get_view(initial.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test('B23 E14 source REC energy shortage keeps its positive pack stock and cannot borrow processing or movement energy',async()=>{
  const definition=await intelligence_variant(value=>{
    value.profile.parameters.source_energy=1;
    const alias=value.profile.registry.find(r=>r.id==='source_energy')!;alias.value=1;alias.source_ref='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E14';
    const resolved=value.profile.resolved_registry.find(r=>r.id==='PLAY S08 source_actor')!;
    if(typeof resolved.value!=='object'||resolved.value===null||Array.isArray(resolved.value))throw Error('Expected source registry');
    Reflect.set(resolved.value,'energy',1);resolved.source_ref='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E14';resolved.authoring_declaration='Owned E14 REC shortage fixture: energy1, pack1; unchanged complete4/3/1 recipe';
  });
  const store=new Persistence('b23-owned-t02-rec-shortage',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'source-blocked',expected_revision:1,intent:{kind:'advance',to:86000}});
    expect(await game.get_actor_view(view.run_id,'ArchiveSource')).toMatchObject({work:{status:'blocked',done_ms:0},resources:{energy:1,durability:100,packs:1,energy_reserved:0,packs_reserved:0},published_reports:[]});
    expect(view).toMatchObject({processing:{energy_confirmed:20,energy_reserved:0,queue:[]}});expect(Reflect.get(view,'received_reports')).toHaveLength(3);expect(Reflect.has(view,'source')).toBe(false);
    const unregistered=new Persistence('b23-owned-t02-no-variant-import');
    try{await expect(new Game(unregistered).create_run(definition,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await unregistered.list_runs()).toEqual([]);}finally{await unregistered.delete();}
  }finally{await store.delete();}
});

test('B23 E14 the registered owned processing-energy-one fixture rejects validation without borrowing other balances or reserving anything',async()=>{
  const definition=await intelligence_variant(value=>{
    value.profile.parameters.processing_energy=1;
    const alias=value.profile.registry.find(r=>r.id==='processing_energy')!;alias.value=1;alias.source_ref='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E14';
    const resolved=value.profile.resolved_registry.find(r=>r.id==='PLAY S15 work.energy')!;
    if(typeof resolved.value!=='object'||resolved.value===null||Array.isArray(resolved.value))throw Error('Expected processing registry');
    Reflect.set(resolved.value,'initial',1);resolved.source_ref='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E14';resolved.authoring_declaration='Owned E14 insufficient processing energy fixture: initial1; all work costs unchanged';
  });
  const store=new Persistence('b23-owned-t02-energy-one',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'receive-source',expected_revision:1,intent:{kind:'advance',to:86000}});
    expect(view).toMatchObject({processing:{energy_confirmed:1,energy_reserved:0,queue:[]}});
    await expect(game.request_source_validation({run_id:view.run_id,operation_id:'insufficient-energy',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'D-R3',version:1}]}})).rejects.toThrow('CONSTRAINT_DENIED');
    expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,'insufficient-energy')).toBeNull();
    expect(await game.get_actor_view(view.run_id,'W')).toMatchObject({resources:{repair_packs:2}});expect(await game.get_actor_view(view.run_id,'R')).toMatchObject({resources:{record_energy:20}});
  }finally{await store.delete();}
});

test.each(['preparation_first','validation_first'] as const)('B23 E13 E15 %s uses one seat, preserves the frozen input timeline and ends with processing energy twelve',async order=>{
  const store=new Persistence('b23-owned-t02-order-'+order);
  try{
    const game=new Game(store);let view=await game.create_run(await intelligence_definition(),'research','create');
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B处记录',repair_packs:2}}});
    if(saved.view.scenario_kind!=='play_intelligence'||!saved.view.plan)throw Error('Expected intelligence draft');
    view=saved.view;const plan=saved.view.plan.ref;
    const advance=async(to:number)=>{({view}=await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}}));};
    const prepare=async()=>{({view}=await game.request_preparation({run_id:view.run_id,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:plan}}));};
    if(order==='preparation_first')await prepare();
    await advance(86000);
    ({view}=await game.request_source_validation({run_id:view.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'D-R3',version:1}]}}));
    if(order==='validation_first'){await advance(107000);await advance(108000);await prepare();}
    await advance(order==='preparation_first'?166000:169000);
    expect(view).toMatchObject({processing:{energy_confirmed:12,energy_reserved:0},access:{green:'verified',blue:'unverified'},preparation:{status:'approved'},supply_commitments:[{quantity:2,status:'held'}]});
    expect(Reflect.get(view,'processing').queue).toMatchObject(order==='preparation_first'?[{kind:'preparation',started_at:85000,completed_at:145000},{kind:'source_validation',started_at:145000,completed_at:165000}]:[{kind:'source_validation',started_at:86000,completed_at:106000},{kind:'preparation',started_at:108000,completed_at:168000}]);
    expect(Reflect.get(view,'assessments')).toMatchObject([{delivery:{received:order==='preparation_first'?166000:107000}}]);
    expect(Reflect.get(view,'preparation_results')).toMatchObject([{delivery:{received:order==='preparation_first'?146000:169000}}]);
    expect(intelligence_player_view(view)).toBe(true);
  }finally{await store.delete();}
});

test('B23 E12 E13 a later lawful plan competes for the same two known packs and cannot receive a second conflicting approval',async()=>{
  const store=new Persistence('b23-owned-t02-conflicting-plans');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const first=await game.save_plan({run_id:initial.run_id,operation_id:'draft-one',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'先完成B记录',repair_packs:2}}});
    if(first.view.scenario_kind!=='play_intelligence'||!first.view.plan)throw Error('Expected first plan');
    const one=await game.request_preparation({run_id:initial.run_id,operation_id:'prepare-one',expected_revision:first.view.revision,intent:{kind:'request_preparation',plan_ref:first.view.plan.ref}});
    const second=await game.save_plan({run_id:initial.run_id,operation_id:'draft-two',expected_revision:one.view.revision,intent:{kind:'save_plan',base_plan_ref:first.view.plan.ref,draft:{purpose:'另一个已保存目的',repair_packs:2}}});
    if(second.view.scenario_kind!=='play_intelligence'||!second.view.plan)throw Error('Expected second plan');
    const two=await game.request_preparation({run_id:initial.run_id,operation_id:'prepare-two',expected_revision:second.view.revision,intent:{kind:'request_preparation',plan_ref:second.view.plan.ref}});
    expect(two.view).toMatchObject({processing:{energy_reserved:12,queue:[{accepted_sequence:1,status:'queued',plan:{ref:{version:1}}},{accepted_sequence:2,status:'queued',plan:{ref:{version:2}}}]},supply_commitments:[]});
    const complete=await game.control_clock({run_id:initial.run_id,operation_id:'both-finished',expected_revision:two.view.revision,intent:{kind:'advance',to:205000}});
    expect(complete.view).toMatchObject({preparation:{status:'under_review',plan_ref:{version:2}},processing:{energy_confirmed:8,energy_reserved:0,queue:[{started_at:85000,completed_at:145000},{started_at:145000,completed_at:205000}]},preparation_results:[{result:{status:'approved',plan_ref:{version:1}}}],supply_commitments:[{quantity:2,plan_ref:{version:1}}]});
    const received=await game.control_clock({run_id:initial.run_id,operation_id:'second-decision-received',expected_revision:complete.view.revision,intent:{kind:'advance',to:206000}});
    expect(received.view).toMatchObject({preparation:{status:'not_approved',plan_ref:{version:2}},preparation_results:[{result:{status:'approved',reservation_refs:[{kind:'reservation'}]}},{result:{status:'not_approved',reservation_refs:[],reason:'known_supplies_unavailable',plan_ref:{version:2}},delivery:{sent:205000,received:206000}}]});
    expect(Reflect.get(received.view,'supply_commitments')).toHaveLength(1);expect(intelligence_player_view(received.view)).toBe(true);
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{repair_packs:2}});
  }finally{await store.delete();}
});

test('B23 E12 completed preparation creates a version-bound approval and two-pack commitment, usable only after delivery',async()=>{
  const store=new Persistence('b23-owned-t02-preparation-approved');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B处记录',repair_packs:2}}});
    if(saved.view.scenario_kind!=='play_intelligence'||!saved.view.plan)throw Error('Expected intelligence draft');
    const accepted=await game.request_preparation({run_id:initial.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan.ref}});
    const complete=await game.control_clock({run_id:initial.run_id,operation_id:'finish-preparation',expected_revision:accepted.view.revision,intent:{kind:'advance',to:145000}});
    expect(complete.view).toMatchObject({processing:{energy_confirmed:14,energy_reserved:0,queue:[{started_at:85000,completed_at:145000,work_done_ms:60000,status:'completed'}]},preparation:{status:'under_review'},preparation_results:[],supply_commitments:[]});
    const delivered=await game.control_clock({run_id:initial.run_id,operation_id:'receive-preparation',expected_revision:complete.view.revision,intent:{kind:'advance',to:146000}});
    expect(delivered.view).toMatchObject({preparation:{status:'approved',plan_ref:saved.view.plan.ref},preparation_results:[{result:{status:'approved',completed_at:145000,plan_ref:saved.view.plan.ref,purpose:'取得B处记录'},delivery:{sent:145000,received:146000}}],supply_commitments:[{owner:'HQ',resource_owner:'W',resource:'repair_pack',quantity:2,from:145000,status:'held',plan_ref:saved.view.plan.ref}]});
    expect(await game.get_actor_view(initial.run_id,'W')).toMatchObject({resources:{repair_packs:2}});
    expect(intelligence_player_view(delivered.view)).toBe(true);
  }finally{await store.delete();}
});

test('B23 E11 explicit preparation queues six work behind the accepted job without committing W packs',async()=>{
  const store=new Persistence('b23-owned-t02-preparation-queue');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const saved=await game.save_plan({run_id:initial.run_id,operation_id:'draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B处记录',repair_packs:2}}});
    if(saved.view.scenario_kind!=='play_intelligence'||!saved.view.plan)throw Error('Expected saved intelligence draft');
    const request={run_id:initial.run_id,operation_id:'request-preparation',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan.ref}};
    const accepted=await game.request_preparation(request);
    expect(accepted.view).toMatchObject({processing:{energy_confirmed:20,energy_reserved:6,queue:[{kind:'preparation',status:'queued',started_at:null,work_required_ms:60000,work_done_ms:0}]},preparation:{status:'under_review'},supply_commitments:[]});
    expect(intelligence_player_view(accepted.view)).toBe(true);
    const waiting=await game.control_clock({run_id:initial.run_id,operation_id:'before-seat-free',expected_revision:accepted.view.revision,intent:{kind:'advance',to:84999}});
    expect(waiting.view).toMatchObject({processing:{queue:[{status:'queued',work_done_ms:0}]},preparation:{status:'under_review'},supply_commitments:[]});
    const begun=await game.control_clock({run_id:initial.run_id,operation_id:'seat-free',expected_revision:waiting.view.revision,intent:{kind:'advance',to:85000}});
    expect(begun.view).toMatchObject({processing:{energy_confirmed:20,energy_reserved:6,queue:[{kind:'preparation',status:'running',started_at:85000,work_done_ms:0}]},preparation:{status:'under_review'},supply_commitments:[]});
    expect((await game.request_preparation(request)).receipt).toEqual(accepted.receipt);
  }finally{await store.delete();}
});

test('B23 E17 validation consumes two work after received source evidence and becomes usable only after its own delivery',async()=>{
  const store=new Persistence('b23-owned-t02-source-validation');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const published=await game.control_clock({run_id:initial.run_id,operation_id:'source-published',expected_revision:1,intent:{kind:'advance',to:85000}});
    await expect(game.request_source_validation({run_id:initial.run_id,operation_id:'not-received-yet',expected_revision:published.view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}]}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(initial.run_id)).toEqual(published.view);expect(await game.get_receipt(initial.run_id,'not-received-yet')).toBeNull();
    const received=await game.control_clock({run_id:initial.run_id,operation_id:'receive-source',expected_revision:published.view.revision,intent:{kind:'advance',to:86000}});
    const request={run_id:initial.run_id,operation_id:'validate-source',expected_revision:received.view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}]}};
    const accepted=await game.request_source_validation(request);
    expect(accepted).toMatchObject({receipt:{kind:'request_source_validation'},view:{processing:{energy_confirmed:20,energy_reserved:2,queue:[{kind:'source_validation',status:'running',started_at:86000,work_required_ms:20000,work_done_ms:0}]},assessments:[],access:{green:'unverified'}}});
    const completed=await game.control_clock({run_id:initial.run_id,operation_id:'work-complete',expected_revision:Reflect.get(accepted,'view').revision,intent:{kind:'advance',to:106000}});
    expect(completed.view).toMatchObject({processing:{energy_confirmed:18,energy_reserved:0},assessments:[],access:{green:'unverified'}});
    const delivered=await game.control_clock({run_id:initial.run_id,operation_id:'product-received',expected_revision:completed.view.revision,intent:{kind:'advance',to:107000}});
    expect(delivered.view).toMatchObject({access:{green:'verified',blue:'unverified'},source_groups:[{independent_evidence_count:{kind:'unknown'}},{independent_evidence_count:{kind:'unknown'}}],assessments:[{assessment:{kind:'source_validation',completed_at:106000,conclusion:{kind:'access_verified',value:'green'}},delivery:{sent:106000,received:107000}}]});
    expect(intelligence_player_view(delivered.view)).toBe(true);
    expect(Reflect.get(delivered.view,'received_reports')[3].report).toEqual(Reflect.get(received.view,'received_reports')[3].report);
    expect(delivered.view.gap).toBe('B维修完成尚待合法回报');
  }finally{await store.delete();}
});
