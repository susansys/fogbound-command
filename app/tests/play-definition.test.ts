import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {load_definition,hash,is_play_definition,type PlayDefinition} from '../src/core/scenario';
import playDefinition from './fixtures/play-corridor.json';
import {valid_response} from '../src/dto';

test('PG03 missing required schema7 geometry configuration rejects before any run or operation is committed',async()=>{
  const store=new Persistence('b21-owned-missing-geometry');
  const game=new Game(store);
  try{
    await expect(game.create_run({schema:7,contract:'0.5.1',id:'B21-CORRIDOR-01',version:1,profile:{parameters:{}}},'research','b21-missing-geometry')).rejects.toThrow('CONFIG_PARAMETER_MISSING');
    expect(await store.list_runs()).toEqual([]);
    expect(await store.creation('b21-missing-geometry')).toBeUndefined();
  }finally{await store.delete();}
});

test('PG03 a self-crossing area is rejected as invalid geometry before registration or persistence',async()=>{
  const invalid=structuredClone(playDefinition);
  const area=invalid.catalogs.map.scopes.find(x=>x.id==='area-with-hole')!;
  if(!area.typed_geometry||!('outer' in area.typed_geometry))throw Error('author fixture missing area');
  area.typed_geometry.outer=[[270,40],[330,100],[270,100],[330,40],[270,40]];
  const store=new Persistence('b21-owned-self-crossing');
  try{
    await expect(new Game(store).create_run(invalid,'research','b21-self-crossing')).rejects.toThrow('INVALID_REQUEST');
    expect(await store.list_runs()).toEqual([]);
    expect(await store.creation('b21-self-crossing')).toBeUndefined();
  }finally{await store.delete();}
});

test('PG01 registered schema7 preserves the six scope kinds, holes, disconnected members and point uncertainty',async()=>{
  const loaded=await load_definition(playDefinition);
  expect(loaded).toEqual(playDefinition);
  // The literal fixture is author input; the runtime must validate it before accepting it.
  expect(loaded).toMatchObject({schema:7,scenario_kind:'play_corridor',catalogs:{map:{extent:[400,300],scopes:expect.arrayContaining([
    expect.objectContaining({id:'approximate',kind:'point',typed_geometry:{position:[75.25,151.5]},uncertainty:{kind:'known',value:5,unit:'fictional_metre',evidence:'B21-INITIAL-GEOMETRY'}}),
    expect.objectContaining({id:'area-with-hole',typed_geometry:{outer:[[270,40],[330,40],[330,100],[270,100],[270,40]],holes:[[[290,60],[300,60],[300,70],[290,70],[290,60]]]}}),
    expect.objectContaining({id:'separate-regions',kind:'region_set',typed_geometry:{area_refs:['area-with-hole','detached-area']}}),
    expect.objectContaining({id:'reference-edge',kind:'edge',typed_geometry:{line:[[20,20],[40,30],[60,20]]}}),
    expect.objectContaining({id:'HA',kind:'corridor',typed_geometry:{centerline:[[50,150],[150,150]],width:20,area_ref:'HA-area'}}),
    expect.objectContaining({id:'pending-location',kind:'unresolved',typed_geometry:null,uncertainty:{kind:'unknown'}})
  ])}}});
});

test('PG03 required movement parameters and their registry units are checked before hashes',async()=>{
  const missing=structuredClone(playDefinition);
  Reflect.deleteProperty(missing.profile.parameters,'deadline');
  await expect(load_definition(missing)).rejects.toThrow('CONFIG_PARAMETER_MISSING');
  const wrong=structuredClone(playDefinition);
  wrong.profile.registry.find(x=>x.id==='base_speed')!.unit='metres';
  await expect(load_definition(wrong)).rejects.toThrow('CONFIG_UNIT_MISMATCH');
});

test('PG04 create, save and re-open retain the public geometry while private package hashes stay internal',async()=>{
  const store=new Persistence('b21-owned-initial-save');
  try{
    const game=new Game(store),view=await game.create_run(playDefinition,'research','b21-create');
    expect(view).toMatchObject({scenario_kind:'play_corridor',geometry:playDefinition.catalogs.map,position_knowledge:{status:'known_scope',scope:{id:'H',typed_geometry:{position:[50,150]}},observed:{kind:'known',value:0},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B21-INITIAL-POSITION'}}});
    expect(view).not.toHaveProperty('position');
    expect(valid_response({request_id:'b21-public',ok:true,view})).toBe(true);
    expect(view.geometry).not.toHaveProperty('T');
    expect(JSON.stringify(view)).not.toContain(playDefinition.definition_hash);
    expect(JSON.stringify(await store.list_runs())).not.toContain(playDefinition.definition_hash);
    await game.save({run_id:view.run_id,operation_id:'b21-initial-save',expected_revision:view.revision,intent:{kind:'save'}});
    const reopened=await new Game(store).get_view(view.run_id);
    expect(reopened.geometry).toEqual(view.geometry);
    expect(reopened).toMatchObject({scenario_kind:'play_corridor',position_knowledge:expect.objectContaining({status:'known_scope'})});
    expect(reopened.revision).toBe(2);
  }finally{await store.delete();}
});

async function ownedVariant(change:(value:PlayDefinition)=>void):Promise<PlayDefinition>{
  const value=await load_definition(playDefinition);if(!is_play_definition(value))throw Error('Expected schema7 author input');
  change(value);
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash:old,...body}=value;value.definition_hash=await hash(body);return value;
}
test('PG02 owned registrations retain an unresolved or uncertain initial basis without consulting the exact world origin',async()=>{
  for(const ref of ['pending-location','approximate']){
    const variant=await ownedVariant(value=>{value.catalogs.initial_evidence.scope_ref=ref;value.catalogs.initial_evidence.observed={kind:'unknown'};});
    const store=new Persistence('b21-owned-position-'+ref,[variant]);
    try{
      const game=new Game(store),view=await game.create_run(variant,'research','create-'+ref);
      if(view.scenario_kind!=='play_corridor')throw Error('Expected schema7 view');
      expect(view.position_knowledge).toMatchObject({status:ref==='pending-location'?'unresolved':'known_scope',observed:{kind:'unknown'},received:null});
      expect(view.can_issue).toBe(false);expect(view.gap).toBe('需要明确起点回报');
      if(ref==='pending-location'){
        expect(view.position_knowledge).not.toHaveProperty('scope');expect(view.position_knowledge).not.toHaveProperty('position');
      }else expect(view.position_knowledge).toMatchObject({scope:{typed_geometry:{position:[75.25,151.5]},uncertainty:{kind:'known',value:5}}});
      expect(valid_response({request_id:'owned-location',ok:true,view})).toBe(true);
      expect(await new Game(store).get_view(view.run_id)).toEqual(view);
    }finally{await store.delete();}
  }
});

test('PG04 a self-consistent private hash cannot authorize a false public geometry version',async()=>{
  const variant=await ownedVariant(value=>{
    value.catalogs.map.geometry_version='f'.repeat(64);
    for(const scope of value.catalogs.map.scopes)scope.geometry_version='f'.repeat(64);
  });
  await expect(load_definition(variant,[variant])).rejects.toThrow('INVALID_REQUEST');
});

test('PG04 changing a private closure keeps public geometry, view and run-list shape equivalent',async()=>{
  const closed=await ownedVariant(value=>{value.catalogs.engine_conditions.closed_at_x=160;});
  const normalStore=new Persistence('b21-owned-normal-identity'),closedStore=new Persistence('b21-owned-closed-identity',[closed]);
  try{
    const normal=await new Game(normalStore).create_run(playDefinition,'research','normal-identity'),blocked=await new Game(closedStore).create_run(closed,'research','closed-identity');
    expect(closed.definition_hash).not.toBe(playDefinition.definition_hash);
    expect({...blocked,run_id:'same-run'}).toEqual({...normal,run_id:'same-run'});
    expect((await closedStore.list_runs()).map(x=>({...x,run_id:'same-run'}))).toEqual((await normalStore.list_runs()).map(x=>({...x,run_id:'same-run'})));
  }finally{await normalStore.delete();await closedStore.delete();}
});

test('PG02 unknown observation rejects a fabricated zero even in an owned registered definition',async()=>{
  const variant=await ownedVariant(value=>{value.catalogs.initial_evidence.observed={kind:'unknown'};Reflect.set(value.catalogs.initial_evidence.observed,'value',0);});
  await expect(load_definition(variant,[variant])).rejects.toThrow('INVALID_REQUEST');
});

const invalidGeometryCases:Array<[string,(value:typeof playDefinition)=>void,string]>=[
  ['hole outside outer',v=>{v.catalogs.map.scopes.find(x=>x.id==='area-with-hole')!.typed_geometry!.holes=[[[280,20],[290,20],[290,30],[280,30],[280,20]]];},'INVALID_REQUEST'],
  ['point outside extent',v=>{v.catalogs.map.scopes[0].typed_geometry!.position=[401,150];},'INVALID_REQUEST'],
  ['nonfinite point',v=>{v.catalogs.map.scopes[0].typed_geometry!.position=[NaN,150];},'INVALID_REQUEST'],
  ['excess precision',v=>{v.catalogs.map.scopes[0].typed_geometry!.position=[50.001,150];},'INVALID_REQUEST'],
  ['wrong CRS',v=>{v.catalogs.map.crs_id='OTHER';},'INVALID_REQUEST'],
  ['wrong map version',v=>{v.catalogs.map.map_version=2;},'INVALID_REQUEST'],
  ['zero corridor width',v=>{v.catalogs.map.scopes.find(x=>x.id==='HA')!.typed_geometry!.width=0;},'INVALID_REQUEST'],
  ['corridor domain mismatch',v=>{v.catalogs.map.scopes.find(x=>x.id==='HA')!.typed_geometry!.width=22;},'INVALID_REQUEST'],
  ['missing region member',v=>{v.catalogs.map.scopes.find(x=>x.id==='separate-regions')!.typed_geometry!.area_refs=['not-a-registered-area'];},'INVALID_REQUEST'],
  ['region references another set',v=>{v.catalogs.map.scopes.find(x=>x.id==='separate-regions')!.typed_geometry!.area_refs=['separate-regions'];},'INVALID_REQUEST'],
  ['zero edge',v=>{v.catalogs.map.scopes.find(x=>x.id==='reference-edge')!.typed_geometry!.line=[[20,20],[20,20]];},'INVALID_REQUEST'],
  ['unresolved fake point',v=>{Reflect.set(v.catalogs.map.scopes.find(x=>x.id==='pending-location')!,'position',[0,0]);},'INVALID_REQUEST'],
  ['missing map unit',v=>{Reflect.deleteProperty(v.catalogs.map,'unit');},'CONFIG_PARAMETER_MISSING'],
  ['wrong map unit',v=>{v.catalogs.map.unit='real_metre';},'CONFIG_UNIT_MISMATCH'],
  ['missing uncertainty unit',v=>{Reflect.deleteProperty(v.catalogs.map.scopes[0].uncertainty,'unit');},'CONFIG_PARAMETER_MISSING'],
  ['whole corridor outside extent',v=>{v.catalogs.map.scopes.find(x=>x.id==='HA')!.typed_geometry!.centerline=[[50,150],[401,150]];},'INVALID_REQUEST'],
];
test.each(invalidGeometryCases)('PG03 %s rejects atomically and leaves the good registered definition usable',async(name,change,code)=>{
  const value=structuredClone(playDefinition);change(value);
  const store=new Persistence('b21-owned-invalid-'+name.replaceAll(' ','-'));
  try{
    await expect(new Game(store).create_run(value,'research','invalid-geometry')).rejects.toThrow(code);
    expect(await store.creation('invalid-geometry')).toBeUndefined();expect(await store.list_runs()).toEqual([]);
    expect(await load_definition(playDefinition)).toEqual(playDefinition);
  }finally{await store.delete();}
});
