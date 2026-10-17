import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft} from './mission-fixtures';
import {state_hash} from '../src/core/snapshot';
import {engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition} from '../src/core/scenario';

test('B22 T01 restoring the committed mission keeps the same version and run while requiring explicit continue',async()=>{
  const name='b22-owned-t01-recovery',first=new Persistence(name);
  try{
    const game=new Game(first),view=await game.create_run(definition,'command','create'),draft=mission_draft(view.run_id);
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'save-draft',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
    const second=new Persistence(name),fresh=new Game(second);
    const restored=await fresh.restore(view.run_id,'restore');
    expect(restored.view).toMatchObject({scenario_kind:'play_mission',run_id:view.run_id,paused:true,sim_time:0,plans:saved.view.plans,mission:saved.view.mission,issued_orders:[]});
    expect(Reflect.get(restored.view,'resources')).toEqual(Reflect.get(saved.view,'resources'));
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
    expect(retained).toMatchObject({sim_time:1000,scenario_kind:'play_mission',plans:[{version:1}],resources:Reflect.get(advanced.view,'resources')});
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

test.each([engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition,definition])('B22 PG34 schema $schema keeps its original package and recovery branch beside the new mission run',async registered=>{
  const store=new Persistence('b22-owned-t04-compat-'+registered.schema);
  try{
    const game=new Game(store),legacy=await game.create_run(registered,'research','original-create'),before=await store.read_committed(legacy.run_id);
    const mission=await game.create_run(definition,'research','new-mission');expect(mission.run_id).not.toBe(legacy.run_id);expect(await store.read_committed(legacy.run_id)).toEqual(before);
    const recovered=await new Game(store).restore(legacy.run_id,'original-restore'),after=await store.read_committed(legacy.run_id);
    expect(recovered.view).toMatchObject({run_id:legacy.run_id,sim_time:legacy.sim_time,paused:true});expect(after!.schema).toBe(registered.schema);expect(after!.definition_hash).toBe(registered.definition_hash);expect(after!.hashes).toEqual(before!.hashes);expect(Reflect.get(after!,'world')).toEqual(Reflect.get(before!,'world'));expect(after!.rng).toEqual(before!.rng);
    const listed=await store.list_runs();
    if(registered.schema===8){expect(listed).toHaveLength(1);expect([legacy.run_id,mission.run_id]).toContain(listed[0].run_id);expect(listed[0].scenario_kind).toBe('play_mission');}
    else expect(listed.map(r=>r.run_id).sort()).toEqual([legacy.run_id,mission.run_id].sort());
    expect(await store.read_committed(mission.run_id)).toMatchObject({schema:8,definition_hash:definition.definition_hash});
  }finally{await store.delete();}
});

test.each(['integrity','definition_hash','capability_hash','unknown_schema','invented_decision','invented_explanation'] as const)('B22 PG34 corrupted owned mission %s is refused without deleting or migrating its original bytes',async kind=>{
  const store=new Persistence('b22-owned-t04-corrupt-'+kind);
  try{
    const game=new Game(store),created=await game.create_run(definition,'research','create'),damaged=await store.read_committed(created.run_id);if(!damaged||damaged.schema!==8)throw Error('Expected owned mission');
    if(kind==='definition_hash')damaged.definition_hash='0'.repeat(64);if(kind==='capability_hash')damaged.hashes.capabilities='0'.repeat(64);if(kind==='unknown_schema')Reflect.set(damaged,'schema',99);
    if(kind==='invented_decision')Reflect.set(damaged,'decision_records',[{id:'invented-no-issue',reason_status:'recorded',declared_reason:'不可补造'}]);
    if(kind==='invented_explanation')Reflect.set(damaged,'retrospective_explanations',[{id:'invented-no-decision',text:'不可补造'}]);
    damaged.integrity=kind==='integrity'?'0'.repeat(64):await state_hash(damaged);
    await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(damaged);tx.objectStore('snapshots').put({key:`${damaged.run_id}:${damaged.revision}`,run_id:damaged.run_id,state:damaged});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
    await expect(new Game(store).restore(created.run_id,'refused-restore')).rejects.toThrow('INVALID_SAVE');expect(await store.read_committed(created.run_id)).toEqual(damaged);expect(await store.receipt(created.run_id,'refused-restore')).toBeUndefined();
  }finally{await store.delete();}
});

test('B22 command restart creates one paused child with the same RNG origin and requires explicit continue',async()=>{
  const store=new Persistence('b22-owned-t04-command-clone');
  try{
    const game=new Game(store),created=await game.create_run(definition,'command','create');expect(created.paused).toBe(false);
    await game.control_clock({run_id:created.run_id,operation_id:'pause-parent',expected_revision:created.revision,intent:{kind:'pause',reason:'manual'}});const parent=await store.read_committed(created.run_id);
    const child=await game.restart_run(created.run_id,'restart-command');expect(child).toMatchObject({source_run:created.run_id,mode:'command',sim_time:0,paused:true});expect(child.run_id).not.toBe(created.run_id);expect(await store.read_committed(created.run_id)).toEqual(parent);
    expect(await game.restart_run(created.run_id,'restart-command')).toEqual(child);const childState=await store.read_committed(child.run_id);expect(childState!.rng.origin).toBe(parent!.rng.origin);expect(childState!.rng.seed).toBe(parent!.rng.seed);
    await expect(game.control_clock({run_id:created.run_id,operation_id:'write-parent',expected_revision:parent!.revision,intent:{kind:'continue'}})).rejects.toThrow('HISTORY_READ_ONLY');
    const fresh=new Game(store),restored=await fresh.restore(child.run_id,'restore-child');expect(restored.view).toMatchObject({run_id:child.run_id,paused:true,sim_time:0});await expect(fresh.tick(child.run_id,1000,'paused-child-tick')).rejects.toThrow('CLOCK_PAUSED');
    const continued=await fresh.control_clock({run_id:child.run_id,operation_id:'continue-child',expected_revision:restored.view.revision,intent:{kind:'continue'}});expect(continued.view.paused).toBe(false);const tick=await fresh.tick(child.run_id,1000,'explicit-child-tick');expect(tick.view).toMatchObject({sim_time:1000,source_run:created.run_id,issued_orders:[]});expect(await store.read_committed(created.run_id)).toEqual(parent);
  }finally{await store.delete();}
});
