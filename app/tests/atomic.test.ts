import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition} from '../src/core/scenario';
test('an actual storage transaction abort preserves the last committed view and receipt and blocks new candidates',async()=>{
  const store=new Persistence('atomic-fault'),game=new Game(store);
  let view=await game.create_run(engineeringDefinition,'research','create');
  const plan=await game.preview_plan(view.run_id,view.revision,1);
  view=(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}})).view;
  const safe=await game.control_clock({run_id:view.run_id,operation_id:'safe',expected_revision:view.revision,intent:{kind:'advance',to:6000}});view=safe.view;
  const native=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
    const request=native.apply(this,args);if(this.name==='runs')request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;
  };
  try{
    await expect(game.control_clock({run_id:view.run_id,operation_id:'failed',expected_revision:view.revision,intent:{kind:'advance',to:7000}})).rejects.toThrow('STORAGE_UNCONFIRMED');
  }finally{IDBObjectStore.prototype.put=native;}
  expect(await game.get_view(view.run_id)).toEqual(view);expect(view.position.x).toBe(50);
  expect(await game.get_receipt(view.run_id,'safe')).toEqual(safe.receipt);
  expect(await game.get_receipt(view.run_id,'failed')).toBeNull();
  await expect(game.control_clock({run_id:view.run_id,operation_id:'new-candidate',expected_revision:view.revision,intent:{kind:'advance',to:7000}})).rejects.toThrow('STORAGE_UNCONFIRMED');
  expect(await game.get_view(view.run_id)).toEqual(view);await store.delete();
});
test('explicit takeover is paused and fences a still-referencing older storage writer',async()=>{
  const store=new Persistence('writer-handover'),oldGame=new Game(store);
  let view=await oldGame.create_run(engineeringDefinition,'command','create');
  view=(await oldGame.tick(view.run_id,6000,'tick')).view;
  const next=new Game(store);const takeover=await next.takeover(view.run_id,'takeover');
  expect(takeover.view.run_id).toBe(view.run_id);expect(takeover.view.paused).toBe(true);expect(takeover.view.sim_time).toBe(6000);
  await expect(oldGame.control_clock({run_id:view.run_id,operation_id:'stale-writer',expected_revision:takeover.view.revision,intent:{kind:'continue'}})).rejects.toThrow('STALE_WRITER');
  expect(await next.get_view(view.run_id)).toEqual(takeover.view);
  await store.delete();
});
