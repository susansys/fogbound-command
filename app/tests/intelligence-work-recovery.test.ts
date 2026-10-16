import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';

test.each(['preparation','source_validation'] as const)('B23 E18 saved partial %s resumes the same remaining work and reservations once',async kind=>{
  const store=new Persistence('b23-owned-t02-partial-'+kind);
  try{
    const game=new Game(store);let view=await game.create_run(await intelligence_definition(),'command','create');
    if(kind==='preparation'){
      const saved=await game.save_plan({run_id:view.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B处记录',repair_packs:2}}});
      if(saved.view.scenario_kind!=='play_intelligence'||!saved.view.plan)throw Error('Expected intelligence draft');
      ({view}=await game.request_preparation({run_id:view.run_id,operation_id:'prepare',expected_revision:saved.view.revision,intent:{kind:'request_preparation',plan_ref:saved.view.plan.ref}}));
    }else{
      ({view}=await game.tick(view.run_id,86000,'receive-source'));
      ({view}=await game.request_source_validation({run_id:view.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'D-R3',version:1}]}}));
    }
    const at=kind==='preparation'?115000:96000;
    ({view}=await game.tick(view.run_id,at,'partial'));
    expect(view).toMatchObject({processing:{energy_confirmed:20,energy_reserved:kind==='preparation'?6:2,queue:[{status:'running',work_done_ms:kind==='preparation'?30000:10000}]}});
    ({view}=await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}}));
    const fresh=new Game(store),restored=await fresh.restore(view.run_id,'restore');
    expect(restored.view).toMatchObject({run_id:view.run_id,sim_time:at,paused:true});expect(Reflect.get(restored.view,'processing')).toEqual(Reflect.get(view,'processing'));
    await expect(fresh.tick(view.run_id,at+1000,'paused-tick')).rejects.toThrow('CLOCK_PAUSED');
    const continued=await fresh.control_clock({run_id:view.run_id,operation_id:'continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});
    expect(continued.view.sim_time).toBe(at);
    const finalTime=kind==='preparation'?146000:107000,final=await fresh.tick(view.run_id,finalTime,'finish');
    expect(final.view).toMatchObject({processing:{energy_confirmed:kind==='preparation'?14:18,energy_reserved:0,queue:[{status:'completed',started_at:kind==='preparation'?85000:86000,completed_at:kind==='preparation'?145000:106000}]}});
    expect(Reflect.get(final.view,kind==='preparation'?'preparation_results':'assessments')).toHaveLength(1);
    expect((await fresh.tick(view.run_id,finalTime,'finish')).receipt).toEqual(final.receipt);
  }finally{await store.delete();}
});
