import {legacy_view,legacy_result,legacy_state} from './legacy-branch';
import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition} from '../src/core/scenario';
import {createHash} from 'node:crypto';
test('a saved committed 17000ms point restores the same run paused and resumes to exactly one completion',async()=>{
  const store=new Persistence('save-resume'),game=new Game(store);
  let view=legacy_view(await game.create_run(engineeringDefinition,'research','create'));
  const plan=await game.preview_plan(view.run_id,view.revision,1);
  view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}}))).view;
  view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:17000}}))).view;
  const saved=legacy_result(await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}}));
  expect(saved.receipt.sim_time).toBe(17000);expect(saved.receipt.revision).toBe(saved.view.revision);
  const fresh=new Game(store);const restored=legacy_result(await fresh.restore(view.run_id,'restore'));view=restored.view;
  expect(restored.receipt.snapshot_revision).toBe(saved.receipt.revision);
  expect(view.run_id).toBe(saved.view.run_id);expect(view.sim_time).toBe(17000);expect(view.paused).toBe(true);
  expect(view.position).toMatchObject({x:106.6,observed:16000,received:17000});
  view=(legacy_result(await fresh.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:33800}}))).view;
  expect(view.log.filter(x=>x.kind==='complete_receipt')).toHaveLength(1);
  expect(view.resources).toMatchObject({equipment_energy:8,equipment_wear:92,movement_energy:18});await store.delete();
});
test.each(['credential','early','late','duplicate'])('a self-consistent serialized package with an invalid pending delivery %s is refused before resume',async(fault)=>{
  const store=new Persistence(`bad-delivery-${fault}`),game=new Game(store);let view=legacy_view(await game.create_run(engineeringDefinition,'research','create'));
  const plan=await game.preview_plan(view.run_id,view.revision,1);view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}}))).view;
  view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:6000}}))).view;
  // An authored serialized fault, not a patch of running Game/World: both stored copies carry a valid checksum.
  const bad=structuredClone((legacy_state(await store.read_committed(view.run_id)))!);
  if(fault==='credential')bad.schedule.find(x=>x.kind==='fix_receipt')!.payload!.position!.evidence='missing-delivery';
  else if(fault==='duplicate'){bad.schedule.push(structuredClone(bad.schedule.find(x=>x.kind==='fix'&&x.index===2)!));bad.schedule.sort((a,b)=>a.at-b.at);}
  else{bad.schedule.find(x=>x.kind==='fix_receipt'&&x.index===2)!.at=fault==='early'?6001:12001;bad.schedule.sort((a,b)=>a.at-b.at);}
  const ordered=(value:unknown):unknown=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Record<string,unknown>)[key])])):value;
  const {integrity,...body}=bad;bad.integrity=createHash('sha256').update(JSON.stringify(ordered(body))).digest('hex');
  await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(bad);tx.objectStore('snapshots').put({key:`${bad.run_id}:${bad.revision}`,run_id:bad.run_id,state:bad});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
  await expect(new Game(store).restore(view.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
  expect((legacy_state(await store.read_committed(view.run_id)))?.integrity).toBe(bad.integrity);expect(await game.get_receipt(view.run_id,'restore')).toBeNull();await store.delete();
});
const corruptions=[
  {label:'schema',apply:(s:Record<string,unknown>)=>{s.schema=3;}},
  {label:'contract',apply:(s:Record<string,unknown>)=>{s.contract='0.5';}},
  {label:'definition',apply:(s:Record<string,unknown>)=>{s.definition_hash='0'.repeat(64);}},
  {label:'profile-registry',apply:(s:Record<string,unknown>)=>{(s.hashes as Record<string,string>).profile='0'.repeat(64);}},
  {label:'capabilities',apply:(s:Record<string,unknown>)=>{(s.hashes as Record<string,string>).capabilities='0'.repeat(64);}},
  {label:'integrity',apply:(s:Record<string,unknown>)=>{s.integrity='0'.repeat(64);}},
  {label:'reference',apply:(s:Record<string,unknown>)=>{(s.known as {delivery:{report_id:string}}).delivery.report_id='missing-report';}},
];
test.each(corruptions)('restore rejects a corrupted $label snapshot and preserves the original artifact',async({label,apply})=>{
  const store=new Persistence(`bad-save-${label}`),game=new Game(store);
  const view=legacy_view(await game.create_run(engineeringDefinition,'research','create'));
  const native=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){
    const serialized=structuredClone(value) as {state?:Record<string,unknown>};
    if(this.name==='snapshots'&&serialized.state)apply(serialized.state);
    return key===undefined?native.call(this,serialized):native.call(this,serialized,key);
  };
  let saved;
  try{saved=legacy_result(await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}}));}finally{IDBObjectStore.prototype.put=native;}
  const fresh=new Game(store);await expect(fresh.restore(view.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
  expect(legacy_view(await game.get_view(view.run_id))).toEqual(saved.view);expect(legacy_state(await store.snapshot(view.run_id,saved.view.revision))).toBeDefined();expect(await game.get_receipt(view.run_id,'restore')).toBeNull();
  await store.delete();
});
