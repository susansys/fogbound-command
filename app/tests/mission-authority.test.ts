import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';

test('B22 PG10 preview identifies the existing staff grant covering the normal current phase',async()=>{
  const store=new Persistence('b22-owned-t02-authority-normal');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    const preview=await game.preview_plan(view.run_id,view.revision,0,mission_draft(view.run_id));
    expect(preview.phases[0]).toMatchObject({authorization:{status:'met',session_role:'staff',grant_ref:{run_id:view.run_id,kind:'authority',id:'B22-STATIC-GRANT',version:1},dimensions:{mission:true,actor:true,action:true,space:true,time:true,risk:true},gap:''}});
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each(['mission','actor','action','space','time','risk'] as const)('B22 PG11 %s grant dimension is checked independently without side effects',async dimension=>{
  const variant=await mission_variant(value=>{
    const grant=value.catalogs.authority;
    if(dimension==='mission')grant.mission_scope=[];
    if(dimension==='actor')grant.actors=[];
    if(dimension==='action')grant.action_kinds=[];
    if(dimension==='space')grant.spatial_scope=['AB'];
    if(dimension==='time'){grant.valid_to_time_ms=30000;value.profile.parameters.grant_until=30000;}
    if(dimension==='risk')grant.risk_limits=[];
  }),store=new Persistence('b22-owned-t02-grant-'+dimension,[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    const preview=await game.preview_plan(view.run_id,view.revision,0,draft),actual=preview.phases[0].authorization;
    const dimensions={mission:true,actor:true,action:true,space:true,time:true,risk:true};dimensions[dimension]=false;
    expect(actual).toMatchObject({status:'denied',code:'AUTHORITY_DENIED',session_role:'staff',dimensions});
    expect(actual.gap).not.toBe('');expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});
