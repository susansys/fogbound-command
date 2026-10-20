import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';

test('NB3-AT004 public catalogue rejects missing source versions and inconsistent geometry mirrors',async()=>{
  const store=new Persistence('b33-owned-dto-'+crypto.randomUUID());
  try{
    const view=await new Game(store).create_run({schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},'research',crypto.randomUUID());
    if(view.scenario_kind!=='play_integrated_field')throw Error('New package expected');
    expect(valid_response({request_id:'catalogue',ok:true,view})).toBe(true);
    const unbound=structuredClone(view);unbound.model_catalog.parameters[0].source_ref.id='UNKNOWN-SOURCE';
    expect(valid_response({request_id:'unbound',ok:true,view:unbound})).toBe(false);
    const geometry=structuredClone(view);geometry.geometry.points.A[0]=175;
    expect(valid_response({request_id:'geometry',ok:true,view:geometry})).toBe(false);
    expect(valid_response({request_id:'world',ok:true,view:{...view,world:{private_weather:'wet'}}})).toBe(false);
  }finally{await store.delete();}
});
