import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {hash} from '../src/core/scenario';
import {load_mission_definition,type MissionDefinition} from '../src/core/mission-definition';
import definition from '../src/core/mission-definition.json';
import {mission_draft} from './mission-fixtures';
import {mission_variant} from './mission-fixtures';
import {valid_response} from '../src/dto';
import {mission_preview} from '../src/mission-dto';

test('B22 combined position and capability proofs over32 reject preview and save before writing',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.position_reports=Array.from({length:31},(_,i)=>({id:'combined-'+i,origin:'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:0,evidence:'combined-'+i},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:1000}));}),store=new Persistence('b22-owned-t02-combined-evidence33',[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),advanced=await game.control_clock({run_id:view.run_id,operation_id:'deliver',expected_revision:1,intent:{kind:'advance',to:1000}}),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'all',children:[{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'},{kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true}]};
    await expect(game.preview_plan(view.run_id,advanced.view.revision,0,draft)).rejects.toThrow('EVIDENCE_REQUIRED');
    await expect(game.save_plan({run_id:view.run_id,operation_id:'save-too-many-proofs',expected_revision:advanced.view.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('EVIDENCE_REQUIRED');
    expect(await game.get_view(view.run_id)).toEqual(advanced.view);expect(await game.get_receipt(view.run_id,'save-too-many-proofs')).toBeNull();
  }finally{await store.delete();}
});

test('B22 31 same-time reports plus the initial proof remain publishable without dropping any proof',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.position_reports=Array.from({length:31},(_,i)=>({id:'same-time-'+i,origin:'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:0,evidence:'same-time-'+i},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:1000}));}),store=new Persistence('b22-owned-t02-evidence32',[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),advanced=await game.control_clock({run_id:view.run_id,operation_id:'deliver',expected_revision:1,intent:{kind:'advance',to:1000}});
    if(advanced.view.scenario_kind!=='play_mission'||advanced.view.position_knowledge.status==='conflicting')throw Error('Expected nonconflicting mission view');
    expect(advanced.view.position_knowledge.evidence_refs).toHaveLength(32);expect(valid_response({request_id:'delivered',ok:true,...advanced})).toBe(true);
    const draft=mission_draft(view.run_id);draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    const preview=await game.preview_plan(view.run_id,advanced.view.revision,0,draft);
    expect(preview.phases[0].gate.evidence_refs).toHaveLength(32);expect(mission_preview(preview)).toBe(true);
  }finally{await store.delete();}
});

test('B22 32 equal-time report proofs plus the initial proof exceed the evidence budget before any write',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.position_reports=Array.from({length:32},(_,i)=>({id:'same-time-'+i,origin:'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:0,evidence:'same-time-'+i},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:1000}));}),store=new Persistence('b22-owned-t02-evidence33',[],[variant]);
  try{await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

test.each(['link_ms','send_window_ms','hold_ms','deadline','receipt_grace'] as const)('B22 owned %s cannot silently replace its frozen timing contract',async field=>{
  const variant=await mission_variant(value=>{value.profile.parameters[field]=1;}),store=new Persistence('b22-owned-t02-fixed-'+field,[],[variant]);
  try{await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

test.each(['too_fast','future_source'] as const)('B22 owned %s position report is rejected before persistence',async kind=>{
  const variant=await mission_variant(value=>{value.catalogs.position_reports=[{id:'invalid-timing',origin:'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:0,evidence:'invalid-timing'},source_event_time:kind==='future_source'?{kind:'known',value:2000,evidence:'invalid-timing'}:{kind:'unknown'},reported_at:0,delivery_at:kind==='too_fast'?1:1000}];}),store=new Persistence('b22-owned-t02-causal-'+kind,[],[variant]);
  try{await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

test('B22 owned changed public geometry with the old geometry digest is rejected even with new private hashes',async()=>{
  const variant=await load_mission_definition(definition),scope=variant.catalogs.map.scopes.find(s=>s.id==='approximate');
  if(scope?.kind!=='point')throw Error('Expected the registered point');scope.typed_geometry.position=[80,150];
  await seal(variant);const store=new Persistence('b22-owned-t02-stale-public-geometry',[],[variant]);
  try{await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

test.each([['send_energy_cost',0],['send_energy_cost',2],['send_wear_cost',0],['send_wear_cost',2]] as const)('B22 owned %s=%i cannot redefine the frozen one-per-send charge',async(field,cost)=>{
  const variant=await mission_variant(value=>{value.profile.parameters[field]=cost;}),store=new Persistence('b22-owned-t02-cost-'+field+cost,[],[variant]);
  try{await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);}finally{await store.delete();}
});

async function seal(value:MissionDefinition):Promise<MissionDefinition>{
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash,...payload}=value;value.definition_hash=await hash(payload);
  return value;
}
async function short_lived_position():Promise<MissionDefinition>{
  const value=await load_mission_definition(definition);
  value.profile.parameters.position_max_age_ms=5000;
  value.profile.registry.find(entry=>entry.id==='position_max_age_ms')!.value=5000;
  value.catalogs.initial_evidence.max_age_ms=5000;
  return seal(value);
}

test('B22 T02 owned mission registration survives creation, preview, save and a fresh Game restore',async()=>{
  const variant=await short_lived_position(),owned=[variant],store=new Persistence('b22-owned-t02-registry',[],owned);
  owned.length=0;
  try{
    const game=new Game(store),created=await game.create_run(variant,'research','create');
    if(created.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const draft=mission_draft(created.run_id);
    expect((await game.preview_plan(created.run_id,created.revision,0,draft)).phases[0].estimated_move_ms).toBe(29500);
    const saved=await game.save_plan({run_id:created.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const restored=await new Game(store).restore(created.run_id,'restore');
    expect(restored.view).toMatchObject({scenario_kind:'play_mission',run_id:created.run_id,paused:true,plans:saved.view.plans});
  }finally{await store.delete();}
});

test('B22 T02 a self-signed mission variant is rejected without owned constructor registration',async()=>{
  const variant=await short_lived_position(),store=new Persistence('b22-owned-t02-unregistered');
  try{
    await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow('INVALID_DEFINITION');
    expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});

test.each(['missing_move','wrong_unit','zero_speed','registry_value','source_ref_missing','unknown_age'] as const)('B22 T02 even owned signed %s configuration is rejected before creation',async kind=>{
  const variant=await short_lived_position();
  if(kind==='missing_move')variant.capabilities=variant.capabilities.filter(c=>c.id!=='R:move');
  if(kind==='wrong_unit')variant.capabilities.find(c=>c.id==='R:move')!.unit='unregistered_unit';
  if(kind==='zero_speed')variant.capabilities.find(c=>c.id==='R:move')!.speed=0;
  if(kind==='registry_value')variant.profile.registry.find(entry=>entry.id==='position_max_age_ms')!.value=5001;
  if(kind==='source_ref_missing')Reflect.deleteProperty(variant.profile.registry[0],'source_ref');
  if(kind==='unknown_age'){
    Reflect.set(variant.profile.parameters,'position_max_age_ms','unknown');
    Reflect.set(variant.profile.registry.find(entry=>entry.id==='position_max_age_ms')!,'value','unknown');
  }
  await seal(variant);
  const store=new Persistence('b22-owned-t02-invalid-'+kind,[],[variant]);
  try{
    const expected=['missing_move','source_ref_missing'].includes(kind)?'CONFIG_PARAMETER_MISSING':kind==='wrong_unit'?'CONFIG_UNIT_MISMATCH':'INVALID_DEFINITION';
    await expect(new Game(store).create_run(variant,'research','create')).rejects.toThrow(expected);
    expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});
