import {test,expect} from 'vitest';import {Game} from '../src/core/game';import {Persistence} from '../src/core/persistence';import {outcome_definition_for_package} from '../src/core/outcome-definition';import registered from '../src/core/outcome-definition.json';import {state_hash} from '../src/core/snapshot';
async function runningW(name:string){const store=new Persistence(name),game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),'command','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
 const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});return{store,game,initial,issued};}

test.each(['command','research'] as const)('B24 cold recovery rejects a self-hashed array alias for %s mode through the owned Persistence fault seam',async mode=>{
 const store=new Persistence('b24-owned-t01-mode-alias-'+mode);
 try{
  const game=new Game(store),initial=await game.create_run(outcome_definition_for_package(registered.definition_hash),mode,'create');
  const realRead=store.read_committed.bind(store),committed=await realRead(initial.run_id);
  if(!committed||committed.schema!==10)throw Error('Owned outcome run absent');
  const forged=structuredClone(committed);Reflect.set(forged,'mode',[mode]);Reflect.set(forged.prefix,'mode',[mode]);forged.paused=false;forged.prefix.paused=false;forged.integrity=await state_hash(forged);
  store.read_committed=async run=>run===initial.run_id?structuredClone(forged):realRead(run);
  const realSnapshot=store.snapshot.bind(store);store.snapshot=async(run,revision)=>run===initial.run_id&&revision===1?structuredClone(forged):realSnapshot(run,revision);
  await expect(new Game(store).get_view(initial.run_id)).rejects.toThrow('INVALID_SAVE');
  expect(await realRead(initial.run_id)).toEqual(committed);
 }finally{await store.delete();}
});

test('B24 E11 core same-run takeover pauses a partially running reception and explicit continue completes only its remaining work',async()=>{
 const{store,game,initial}=await runningW('b24-owned-t01-core-reception-restore');
 try{
  const partial=await game.tick(initial.run_id,70000,'partial');const saved=await game.save({run_id:initial.run_id,operation_id:'save',expected_revision:partial.view.revision,intent:{kind:'save'}});
  expect(await game.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:3,received_personnel:0,batches:[{status:'running',started_at:60000}]}});
  const reopened=new Game(store),restored=await reopened.restore(initial.run_id,'restore');expect(restored.view).toMatchObject({run_id:initial.run_id,sim_time:70000,paused:true});
  await expect(reopened.tick(initial.run_id,85000,'not-continued')).rejects.toThrow('CLOCK_PAUSED');expect(await reopened.get_receipt(initial.run_id,'not-continued')).toBeNull();
  const continued=await reopened.control_clock({run_id:initial.run_id,operation_id:'continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});expect(continued.view.sim_time).toBe(saved.view.sim_time);
  const completed=await reopened.tick(initial.run_id,86000,'remaining');expect(completed.view).toMatchObject({handover:{received_personnel:3}});expect(await reopened.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{reserved_personnel:0,received_personnel:3,batches:[{completed_at:85000}]}});expect((await reopened.tick(initial.run_id,86000,'remaining')).receipt).toEqual(completed.receipt);
 }finally{await store.delete();}
});

test('B24 E11 actual owned transaction abort cannot leave half a reception or consume a once marker',async()=>{
 const{store,game,initial}=await runningW('b24-owned-t01-reception-abort'),native=IDBObjectStore.prototype.put;
 try{
  const before=(await game.tick(initial.run_id,70000,'partial')).view,local=await game.get_actor_view(initial.run_id,'H');let aborted=false;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const request=native.apply(this,args);if(!aborted&&this.transaction.db.name===store.name&&this.name==='runs')request.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});return request;};
  await expect(game.tick(initial.run_id,86000,'finish')).rejects.toThrow('STORAGE_UNCONFIRMED');IDBObjectStore.prototype.put=native;expect(aborted).toBe(true);
  expect(await game.get_view(initial.run_id)).toEqual(before);expect(await game.get_actor_view(initial.run_id,'H')).toEqual(local);expect(await game.get_receipt(initial.run_id,'finish')).toBeNull();
  const fresh=new Game(store),result=await fresh.tick(initial.run_id,86000,'finish');expect(result.view).toMatchObject({handover:{received_personnel:3},finished:false});expect((await fresh.tick(initial.run_id,86000,'finish')).receipt).toEqual(result.receipt);expect(await fresh.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{received_personnel:3,reserved_personnel:0}});
 }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B24 E07/E59 a committed response loss keeps one reception and verifies same-body retry, changed-body conflict and stale revision',async()=>{
 const {store,game,initial}=await runningW('b24-owned-t01-unknown-commit'),commit=store.commit_batch.bind(store);
 try{
  const before=(await game.tick(initial.run_id,70000,'partial')).view;let dropped=false;
  store.commit_batch=async(...args)=>{await commit(...args);if(!dropped){dropped=true;throw Error('owned commit acknowledgement loss');}};
  const envelope={run_id:initial.run_id,operation_id:'unknown-finish',expected_revision:before.revision,intent:{kind:'tick' as const,to:107000}};
  await expect(game.tick(initial.run_id,107000,envelope.operation_id)).rejects.toThrow('STORAGE_UNCONFIRMED');
  const receipt=await game.get_receipt(initial.run_id,envelope.operation_id),current=await game.get_view(initial.run_id),local=await game.get_actor_view(initial.run_id,'H');
  expect(receipt).toMatchObject({kind:'tick',sim_time:107000});expect(local).toMatchObject({reception:{received_personnel:3,reserved_personnel:0},person_receipts:[{person_id:'W-person-1'},{person_id:'W-person-2'},{person_id:'W-person-3'}]});
  expect(current).toMatchObject({handover:{received_personnel:3},processing:{energy_confirmed:18,energy_reserved:0}});
  expect((await game.tick(initial.run_id,107000,envelope.operation_id)).receipt).toEqual(receipt);expect(await game.get_view(initial.run_id)).toEqual(current);expect(await game.get_actor_view(initial.run_id,'H')).toEqual(local);
  await expect(game.tick(initial.run_id,107001,envelope.operation_id)).rejects.toThrow('OPERATION_CONFLICT');
  const fresh=new Game(store);await expect(fresh.save({run_id:initial.run_id,operation_id:'stale-new-operation',expected_revision:before.revision,intent:{kind:'save'}})).rejects.toThrow('STALE_REVISION');
  expect(await fresh.get_receipt(initial.run_id,'stale-new-operation')).toBeNull();expect(await fresh.get_view(initial.run_id)).toEqual(current);
 }finally{store.commit_batch=commit;await store.delete();}
});

test('B24 new same-definition run keeps the original rng origin and makes the parent read-only without changing its local facts',async()=>{
 const{store,game,initial}=await runningW('b24-owned-t01-parent-branch');
 try{await game.tick(initial.run_id,70000,'partial');const before=await game.get_actor_view(initial.run_id,'H'),child=await game.restart_run(initial.run_id,'new-run');expect(child.run_id).not.toBe(initial.run_id);expect(child).toMatchObject({source_run:initial.run_id,scenario_kind:'play_outcome',sim_time:0,paused:true});expect(await game.get_actor_view(initial.run_id,'H')).toEqual(before);const parent=await game.get_view(initial.run_id);expect(parent.can_issue).toBe(false);await expect(game.save({run_id:initial.run_id,operation_id:'write-parent',expected_revision:parent.revision,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');
  // RNG identity is private save metadata: this assertion uses the explicitly
  // agreed Persistence seam after the real public restart, without patching it.
  expect(await store.read_committed(child.run_id)).toMatchObject({source_run:initial.run_id,rng:{origin:initial.run_id}});
  expect(await new Game(store).get_view(child.run_id)).toMatchObject({run_id:child.run_id,source_run:initial.run_id});
 }finally{await store.delete();}
});

test.each([900,30000,70000,96000,106000])('B24 E11/E59 core restore at%i preserves issued/return/reception/verification steps and settles once after explicit continue',async at=>{
 const {store,game,initial}=await runningW('b24-owned-t01-step-restore-'+at);
 try{
  const partial=await game.tick(initial.run_id,at,'partial'),saved=await game.save({run_id:initial.run_id,operation_id:'save',expected_revision:partial.view.revision,intent:{kind:'save'}}),local=await game.get_actor_view(initial.run_id,'H');
  const fresh=new Game(store),restored=await fresh.restore(initial.run_id,'takeover');expect(restored.view).toMatchObject({run_id:initial.run_id,sim_time:at,paused:true});expect(await fresh.get_actor_view(initial.run_id,'H')).toEqual(local);
  await expect(game.control_clock({run_id:initial.run_id,operation_id:'old-writer',expected_revision:restored.view.revision,intent:{kind:'rate',rate:2}})).rejects.toThrow('STALE_WRITER');expect(await fresh.get_receipt(initial.run_id,'old-writer')).toBeNull();
  expect(await fresh.get_view(initial.run_id)).toEqual(restored.view);await expect(fresh.tick(initial.run_id,107000,'without-continue')).rejects.toThrow('CLOCK_PAUSED');
  await fresh.control_clock({run_id:initial.run_id,operation_id:'continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});const completed=await fresh.tick(initial.run_id,107000,'remaining');expect(completed.view).toMatchObject({handover:{received_personnel:3},processing:{energy_confirmed:18,energy_reserved:0},decision_records:Reflect.get(saved.view,'decision_records')});
  expect(await fresh.get_actor_view(initial.run_id,'H')).toMatchObject({reception:{received_personnel:3,reserved_personnel:0},person_receipts:[{person_id:'W-person-1'},{person_id:'W-person-2'},{person_id:'W-person-3'}]});expect((await fresh.tick(initial.run_id,107000,'remaining')).receipt).toEqual(completed.receipt);
 }finally{await store.delete();}
});
