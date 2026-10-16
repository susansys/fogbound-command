import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';

test('B23 initial positions retain the resolved PLAY roster: R at H and W at B',async()=>{
  const store=new Persistence('b23-owned-t01-initial-roster');
  try{
    const game=new Game(store),view=await game.create_run(await intelligence_definition(),'research','create');
    expect(Reflect.get(view,'actors')).toMatchObject([{actor:'R',position_scope:'H'},{actor:'W',position_scope:'B'}]);
    expect(await game.get_actor_view(view.run_id,'W')).toMatchObject({actor:'W',position_scope:'B'});
  }finally{await store.delete();}
});

test.each([['flat_parameter','CONFIG_PARAMETER_MISSING'],['flat_unit','CONFIG_UNIT_MISMATCH'],['resolved_entry','CONFIG_PARAMETER_MISSING'],['resolved_unit','CONFIG_UNIT_MISMATCH'],['profile_hash','INVALID_DEFINITION']] as const)('B23 %s fails with its configuration cause and creates no run',async(variant,code)=>{
  const store=new Persistence('b23-owned-t01-config-'+variant);
  try{
    const input=await intelligence_definition();
    if(variant==='flat_parameter')Reflect.deleteProperty(input.profile.parameters,'source_work');
    if(variant==='flat_unit')input.profile.registry[0].unit='invalid_unit';
    if(variant==='resolved_entry')input.profile.resolved_registry.shift();
    if(variant==='resolved_unit')input.profile.resolved_registry[0].type_unit='invalid_unit';
    if(variant==='profile_hash')input.hashes.profile='0'.repeat(64);
    await expect(new Game(store).create_run(input,'research','create')).rejects.toThrow(code);expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});

test('B23 missing the complete resolved inherited registry is a configuration error before run creation',async()=>{
  const store=new Persistence('b23-owned-t01-complete-resolved');
  try{
    const input=await intelligence_definition();Reflect.deleteProperty(input.profile,'resolved_registry');
    await expect(new Game(store).create_run(input,'research','create')).rejects.toThrow('CONFIG_PARAMETER_MISSING');
    expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});
