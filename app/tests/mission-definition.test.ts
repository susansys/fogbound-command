import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_variant} from './mission-fixtures';

test.each([['parameter','CONFIG_PARAMETER_MISSING'],['unit_missing','CONFIG_PARAMETER_MISSING'],['unit_wrong','CONFIG_UNIT_MISMATCH'],['hash','INVALID_DEFINITION']] as const)('B22 T01 definition %s is rejected with its public configuration cause before creating a run',async(variant,code)=>{
  const store=new Persistence('b22-owned-t01-config-'+variant);
  try{
    const value=structuredClone(definition);
    if(variant==='parameter')delete (value.profile.parameters as Partial<typeof value.profile.parameters>).phase_budget;
    if(variant==='unit_missing')delete (value.profile.registry[0] as Partial<typeof value.profile.registry[number]>).unit;
    if(variant==='unit_wrong')value.profile.registry[0].unit='real_military_unit';
    if(variant==='hash')value.hashes.profile='0'.repeat(64);
    await expect(new Game(store).create_run(value,'research','create')).rejects.toThrow(code);
    expect(await store.list_runs()).toEqual([]);expect(await store.creation('create')).toBeUndefined();
  }finally{await store.delete();}
});

test('B22 T01 registration rejects missing mission configuration with its public cause before creating a run',async()=>{
  const store=new Persistence('b22-owned-t01-definition');
  try{
    await expect(new Game(store).create_run({schema:8,contract:'0.5.1',id:'B22-MISSION-01',version:1,profile:{parameters:{}}},'research','b22-missing-config')).rejects.toThrow('CONFIG_PARAMETER_MISSING');
    expect(await store.list_runs()).toEqual([]);
    expect(await store.creation('b22-missing-config')).toBeUndefined();
  }finally{await store.delete();}
});

test('B22 T01 registered mission creates an independent paused run with no saved or issued task',async()=>{
  const store=new Persistence('b22-owned-t01-create');
  try{
    const game=new Game(store);
    const view=await game.create_run(definition,'research','b22-create');
    expect(view).toMatchObject({scenario_kind:'play_mission',sim_time:0,paused:true,finished:false,mission:null,plans:[],issued_orders:[]});
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await store.list_runs()).toMatchObject([{scenario_kind:'play_mission',run_id:view.run_id}]);
  }finally{await store.delete();}
});

test('B22 an owned movement factor beyond safe scheduler time is rejected before creating a run',async()=>{
  const variant=await mission_variant(value=>{
    value.catalogs.movement_changes=[{id:'unsafe-time',at:25000,time_factor:Number.MAX_VALUE}];
    for(const [id,amount,unit] of [['unsafe-time-at',25000,'ms'],['unsafe-time-factor',Number.MAX_VALUE,'ratio']] as const){Reflect.set(value.profile.parameters,id,amount);value.profile.registry.push({...value.profile.registry[0],id,value:amount,unit,source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});}
  }),store=new Persistence('b22-owned-t03-unsafe-movement-factor',[],[variant]);
  try{await expect(new Game(store).create_run(variant,'research','unsafe-create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);expect(await store.creation('unsafe-create')).toBeUndefined();}finally{await store.delete();}
});
