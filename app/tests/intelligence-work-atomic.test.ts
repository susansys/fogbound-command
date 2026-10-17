import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';

test.each(['preparation','source_validation'] as const)('B23 E19 actual transaction abort rolls back %s products, energy and reservations, then the original operation commits once',async kind=>{
  const store=new Persistence('b23-owned-t02-atomic-'+kind),native=IDBObjectStore.prototype.put;
  try{
    const game=new Game(store);let view=await game.create_run(await intelligence_definition(),'research','create');
    if(kind==='preparation'){
      const draft=await game.save_plan({run_id:view.run_id,operation_id:'draft',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得B处记录',repair_packs:2}}});
      if(draft.view.scenario_kind!=='play_intelligence'||!draft.view.plan)throw Error('Expected intelligence draft');
      ({view}=await game.request_preparation({run_id:view.run_id,operation_id:'prepare',expected_revision:draft.view.revision,intent:{kind:'request_preparation',plan_ref:draft.view.plan.ref}}));
    }else{
      ({view}=await game.control_clock({run_id:view.run_id,operation_id:'receive-source',expected_revision:view.revision,intent:{kind:'advance',to:86000}}));
      ({view}=await game.request_source_validation({run_id:view.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'D-R3',version:1}]}}));
    }
    const to=kind==='preparation'?146000:107000,envelope={run_id:view.run_id,operation_id:'complete-and-deliver',expected_revision:view.revision,intent:{kind:'advance' as const,to}};
    let aborted=false;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
      const request=native.apply(this,args);
      if(!aborted&&this.transaction.db.name===store.name&&this.name==='runs')request.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});
      return request;
    };
    await expect(game.control_clock(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');
    IDBObjectStore.prototype.put=native;expect(aborted).toBe(true);
    expect(await game.get_view(view.run_id)).toEqual(view);expect(await game.get_receipt(view.run_id,envelope.operation_id)).toBeNull();
    const fresh=new Game(store),retried=await fresh.control_clock(envelope);
    expect(retried.view).toMatchObject({processing:{energy_confirmed:kind==='preparation'?14:18,energy_reserved:0}});
    expect(Reflect.get(retried.view,kind==='preparation'?'preparation_results':'assessments')).toHaveLength(1);
    expect(Reflect.get(retried.view,'supply_commitments')).toHaveLength(kind==='preparation'?1:0);
    expect((await fresh.control_clock(envelope)).receipt).toEqual(retried.receipt);
    await expect(fresh.control_clock({...envelope,intent:{kind:'advance',to:to+1}})).rejects.toThrow('OPERATION_ID_REUSED');
    expect(await fresh.get_view(view.run_id)).toEqual(retried.view);
  }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});
