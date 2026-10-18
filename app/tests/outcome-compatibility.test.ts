import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition} from '../src/core/scenario';
import mission from '../src/core/mission-definition.json';
import intelligence from '../src/core/intelligence-definition.json';
import outcome from '../src/core/outcome-definition.json';
import {state_hash} from '../src/core/snapshot';

test.each([engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,playCorridorDefinition,mission,intelligence])('B24 E49 schema$schema owned package keeps its original identity and restore branch beside an outcome run',async definition=>{
 const store=new Persistence('b24-owned-t04-legacy-'+definition.schema);
 try{
  const game=new Game(store),old=await game.create_run(definition,'research','legacy-create'),saved=await game.save({run_id:old.run_id,operation_id:'legacy-save',expected_revision:old.revision,intent:{kind:'save'}}),original=await store.read_committed(old.run_id),created=await game.create_run(outcome,'research','new-outcome');
  expect(created).toMatchObject({scenario_kind:'play_outcome',sim_time:0,finished:false});expect(created.run_id).not.toBe(old.run_id);expect(await store.read_committed(old.run_id)).toEqual(original);expect(await game.get_view(old.run_id)).toEqual(saved.view);
  const fresh=new Game(store),restored=await fresh.restore(old.run_id,'old-branch-restore');expect(restored.view).toMatchObject({run_id:old.run_id,sim_time:saved.view.sim_time,paused:true});expect(restored.view.scenario_kind).toBe(saved.view.scenario_kind);expect(Object.hasOwn(restored.view,'scenario_kind')).toBe(Object.hasOwn(saved.view,'scenario_kind'));expect(await store.read_committed(old.run_id)).toMatchObject({schema:definition.schema,contract:definition.contract,definition_hash:definition.definition_hash,hashes:definition.hashes});expect(await fresh.get_view(created.run_id)).toEqual(created);
 }finally{await store.delete();}
});

test('B24 E50 actual restart creates a three-parent owned chain with stable RNG origin and preserved read-only parents',async()=>{
 const store=new Persistence('b24-owned-t04-parent-chain');
 try{
  const game=new Game(store);let current=await game.create_run(outcome,'research','root');const root=current.run_id,parents=[];
  for(let n=0;n<3;n++){
   const saved=await store.read_committed(current.run_id);if(saved?.schema!==10)throw Error('Owned parent absent');parents.push(saved);const child=await game.restart_run(current.run_id,'clone-'+n);expect(child).toMatchObject({source_run:current.run_id,scenario_kind:'play_outcome',sim_time:0,paused:true});expect(child.run_id).not.toBe(current.run_id);expect(await store.is_read_only(current.run_id)).toBe(true);expect(await store.read_committed(current.run_id)).toEqual(saved);const leaf=await store.read_committed(child.run_id);expect(leaf).toMatchObject({schema:10,definition_hash:outcome.definition_hash,hashes:outcome.hashes,rng:{origin:root},source_run:current.run_id});await expect(game.apply_outcome_intent({run_id:current.run_id,operation_id:'forbidden-'+n,expected_revision:saved.revision,intent:{kind:'rate',rate:2}})).rejects.toThrow('HISTORY_READ_ONLY');current=child;
  }
  expect(parents).toHaveLength(3);for(const parent of parents)expect(await store.read_committed(parent.run_id)).toEqual(parent);expect((await store.read_committed(current.run_id))?.source_run).toBe(parents[2].run_id);
 }finally{await store.delete();}
});

test.each(['schema','integrity','component_identity'] as const)('B24 E49 an owned %s corruption is refused and retained without a partial restore',async corruption=>{
 const store=new Persistence('b24-owned-t04-invalid-'+corruption);
 try{
  const game=new Game(store),initial=await game.create_run(outcome,'research','create'),damaged=await store.read_committed(initial.run_id);if(damaged?.schema!==10)throw Error('Owned outcome absent');
  if(corruption==='schema')Reflect.set(damaged,'schema',99);if(corruption==='component_identity')damaged.hashes.capabilities='0'.repeat(64);damaged.integrity=corruption==='integrity'?'0'.repeat(64):await state_hash(damaged);
  await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(store.name);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(damaged);tx.objectStore('snapshots').put({key:damaged.run_id+':'+damaged.revision,run_id:damaged.run_id,state:damaged});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
  await expect(new Game(store).restore(initial.run_id,'rejected-restore')).rejects.toThrow('INVALID_SAVE');expect(await store.read_committed(initial.run_id)).toEqual(damaged);expect(await store.receipt(initial.run_id,'rejected-restore')).toBeUndefined();
 }finally{await store.delete();}
});
