import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft} from './mission-fixtures';
import {state_hash} from '../src/core/snapshot';

test('B22 T01 restoring the committed mission keeps the same version and run while requiring explicit continue',async()=>{
  const name='b22-owned-t01-recovery',first=new Persistence(name);
  try{
    const game=new Game(first),view=await game.create_run(definition,'command','create'),draft=mission_draft(view.run_id);
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'save-draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const second=new Persistence(name),fresh=new Game(second);
    const restored=await fresh.restore(view.run_id,'restore');
    expect(restored.view).toMatchObject({scenario_kind:'play_mission',run_id:view.run_id,paused:true,sim_time:0,plans:saved.view.plans,mission:saved.view.mission,issued_orders:[]});
    expect(restored.view.resources).toEqual(saved.view.resources);
    await expect(fresh.tick(view.run_id,1000,'hidden-tick')).rejects.toThrow('CLOCK_PAUSED');
    const resumed=await fresh.control_clock({run_id:view.run_id,operation_id:'continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});
    expect(resumed.view.paused).toBe(false);
    const advanced=await fresh.tick(view.run_id,1000,'visible-tick');
    expect(advanced.view).toMatchObject({sim_time:1000,plans:saved.view.plans,issued_orders:[],resources:saved.view.resources});
  }finally{await first.delete();}
});

test('B22 PG09 actual draft transaction abort keeps the whole previous version and no receipt',async()=>{
  const store=new Persistence('b22-owned-t01-transaction-abort');
  const native=IDBObjectStore.prototype.put;
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),before=await store.read_committed(view.run_id);
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
      const request=native.apply(this,args);
      if(this.transaction.db.name===store.name&&this.name==='runs')request.addEventListener('success',()=>this.transaction.abort(),{once:true});
      return request;
    };
    await expect(game.save_plan({run_id:view.run_id,operation_id:'aborted-save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:mission_draft(view.run_id)}})).rejects.toThrow('STORAGE_UNCONFIRMED');
    IDBObjectStore.prototype.put=native;
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'aborted-save')).toBeNull();
    const fresh=new Game(store),restored=await fresh.restore(view.run_id,'restore');
    const result=await fresh.save_plan({run_id:view.run_id,operation_id:'new-save',expected_revision:restored.view.revision,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:mission_draft(view.run_id)}});
    expect(result.view.plans).toHaveLength(1);
  }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B22 T01 viewing a retained advancing mission uses its latest committed plan and stays read-only',async()=>{
  const store=new Persistence('b22-owned-t01-retained');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    await game.save_plan({run_id:view.run_id,operation_id:'save-plan',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:mission_draft(view.run_id)}});
    const advanced=await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:2,intent:{kind:'advance',to:1000}});
    const history=await game.get_replay(view.run_id,1000),retained=await history.get_view(view.run_id);
    expect(retained).toMatchObject({sim_time:1000,scenario_kind:'play_mission',plans:[{version:1}],resources:advanced.view.resources});
    await expect(history.save_plan({run_id:view.run_id,operation_id:'forbidden',expected_revision:3,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft:mission_draft(view.run_id)}})).rejects.toThrow('HISTORY_READ_ONLY');
    expect(await game.get_view(view.run_id)).toEqual(advanced.view);
  }finally{await store.delete();}
});

test('B22 T01 a self-consistent owned archive cannot invent a missing parent run during recovery',async()=>{
  const store=new Persistence('b22-owned-t01-lineage');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),state=await store.read_committed(view.run_id);
    if(!state||state.schema!==8)throw Error('Expected owned mission state');
    state.source_run='b22-missing-parent';state.integrity=await state_hash(state);
    await new Promise<void>((resolve,reject)=>{
      const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(state);tx.objectStore('snapshots').put({key:`${state.run_id}:${state.revision}`,run_id:state.run_id,state});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};
    });
    await expect(new Game(store).restore(view.run_id,'restore-bad')).rejects.toThrow('INVALID_SAVE');
    expect(await store.read_committed(view.run_id)).toEqual(state);
    expect(await store.receipt(view.run_id,'restore-bad')).toBeUndefined();
  }finally{await store.delete();}
});
