import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {state_hash} from '../src/core/snapshot';
import {play_variant,movement_run} from './play-fixtures';

test('PG10 an actual IndexedDB abort rolls back discovery, resources, Report, Delivery and receipt; the identical operation retries exactly once',async()=>{
  const value=await play_variant(v=>{v.catalogs.engine_conditions.closed_at_x=160;}),run=await movement_run('atomic-discovery',value,[[50,150],[250,150]]);
  try{
    const safe=await run.advance(33449),before=await run.store.read_committed(run.run);
    const envelope={run_id:run.run,operation_id:'atomic-discovery',expected_revision:safe.revision,intent:{kind:'advance' as const,to:33450}};
    const native=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const request=native.apply(this,args);if(this.name==='runs'&&args[0]?.sim_time===33450)request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;};
    try{await expect(run.game.control_clock(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');}finally{IDBObjectStore.prototype.put=native;}
    expect(await run.store.read_committed(run.run)).toEqual(before);expect(await run.store.snapshot(run.run,safe.revision+1)).toBeUndefined();expect(await run.game.get_receipt(run.run,envelope.operation_id)).toBeNull();
    await expect(run.game.control_clock(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');
    const recovered=new Game(run.store),result=await recovered.control_clock(envelope),committed=await run.store.read_committed(run.run);
    expect(committed).toMatchObject({world:{resources:{movement_energy:18,equipment_energy:14,equipment_wear:98}},reports:[{kind:'accepted'},{kind:'blocked'}],deliveries:[{received:{value:2000}}]});
    expect(await recovered.control_clock(envelope)).toEqual(result);expect(await run.store.read_committed(run.run)).toEqual(committed);
    const delivered=await recovered.control_clock({run_id:run.run,operation_id:'atomic-delivery',expected_revision:result.view.revision,intent:{kind:'advance',to:34450}});
    expect(delivered.view).toMatchObject({status:'blocked',resources:{movement_energy:18,equipment_energy:14,equipment_wear:98}});
  }finally{await run.store.delete();}
});

test('PG10 semantic restore rejects rehashed progress, time, paid message and settlement corruption without repairing the owned archive',async()=>{
  const run=await movement_run('corrupt-progress',await play_variant(()=>{}),[[50,150],[150,150]]);
  try{
    await run.advance(10000);const safe=await run.store.read_committed(run.run);if(safe?.schema!==7)throw Error('Expected corridor');
    for(const change of [
      (v:typeof safe)=>{v.world.position.x.n='999';},
      (v:typeof safe)=>{v.activities[0].duration_ms.n='1';},
      (v:typeof safe)=>{v.activities[0].applied_causes.push({...v.activities[0].applied_causes[0]});},
      (v:typeof safe)=>{v.transmissions[1].energy_after=16;},
      (v:typeof safe)=>{v.reports[0].reported={kind:'known',value:0,evidence:'fake'};},
      (v:typeof safe)=>{v.queue=v.queue.filter(e=>e.kind!=='complete');},
      (v:typeof safe)=>{v.activities[0].settled=true;},
    ]){
      const bad=structuredClone(safe);change(bad);bad.integrity=await state_hash(bad);
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(run.store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(bad);tx.objectStore('snapshots').put({key:`${run.run}:${bad.revision}`,run_id:run.run,state:bad});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
      await expect(new Game(run.store).restore(run.run,'reject-corruption')).rejects.toThrow('INVALID_SAVE');
      expect(await run.store.read_committed(run.run)).toEqual(bad);expect(await run.store.receipt(run.run,'reject-corruption')).toBeUndefined();
    }
  }finally{await run.store.delete();}
});
