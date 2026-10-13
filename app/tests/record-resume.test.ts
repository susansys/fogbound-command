import {createHash} from 'node:crypto';
import {expect,test} from 'vitest';
import type {Envelope} from '../src/contracts';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition,recordEngineeringDefinition} from '../src/core/scenario';
import type {State} from '../src/core/state';

function ordered(value:unknown):unknown{
  return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Record<string,unknown>)[key])])):value;
}
function integrity(state:State){
  const {integrity:_integrity,...body}=state;
  return createHash('sha256').update(JSON.stringify(ordered(body))).digest('hex');
}
async function writeState(store:Persistence,state:State){
  state.integrity=integrity(state);
  await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(state);tx.objectStore('snapshots').put({key:`${state.run_id}:${state.revision}`,run_id:state.run_id,state});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
}
async function issueRecord(name:string){
  const store=new Persistence(name),game=new Game(store);
  let view=await game.create_run(recordEngineeringDefinition,'research','create');
  const plan=await game.preview_plan(view.run_id,view.revision,1);
  const envelope:Envelope={run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}};
  view=(await game.issue_order(envelope)).view;
  return {store,game,view,plan,envelope};
}

test.each([17001,26000])('record saved at %sms restores the same run paused without wall-clock catch-up and completes once',async(point)=>{
  const {store,game,view:issued}=await issueRecord(`record-resume-${point}`);
  try{
    let view=(await game.control_clock({run_id:issued.run_id,operation_id:`advance-${point}`,expected_revision:issued.revision,intent:{kind:'advance',to:point}})).view;
    const beforeSaveState=await store.read_committed(view.run_id);
    const saved=await game.save({run_id:view.run_id,operation_id:`save-${point}`,expected_revision:view.revision,intent:{kind:'save'}});
    expect(saved.receipt.sim_time).toBe(point);
    expect(saved.receipt.revision).toBe(saved.view.revision);
    const fresh=new Game(store);
    const restored=await fresh.restore(view.run_id,`restore-${point}`);
    expect(restored.receipt.snapshot_revision).toBe(saved.receipt.revision);
    expect(restored.view.run_id).toBe(saved.view.run_id);
    expect(restored.view.sim_time).toBe(point);
    expect(restored.view.paused).toBe(true);
    expect(restored.view.artifacts).toEqual([]);
    expect(restored.view.resources.record_energy).toBe(20);
    expect(await store.read_committed(view.run_id)).toMatchObject({world:{record_artifacts:beforeSaveState?.world.record_artifacts}});
    view=(await fresh.control_clock({run_id:view.run_id,operation_id:`finish-${point}`,expected_revision:restored.view.revision,intent:{kind:'advance',to:47000}})).view;
    expect(view.sim_time).toBe(47000);
    expect(view.artifacts).toHaveLength(1);
    expect(view.artifacts?.[0]).toMatchObject({id:'artifact-record',report_id:'REPORT-A',delivery_id:'DELIVERY-A',completed:46000,verified:false,activity_id:'record.complete.0'});
    expect(view.log.filter(x=>x.kind==='complete_receipt')).toHaveLength(1);
    expect(view.resources).toMatchObject({record_energy:16,record_wear:97,record_packs:1,hq_energy:15,hq_wear:99,confirmed_at:47000});
  }finally{await store.delete();}
});

test('record replay separates 6000/7000 and 46000/47000 knowledge without mutating the source run',async()=>{
  const {store,game,view,plan}=await issueRecord('record-replay-boundaries');
  try{
    const current=(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:47000}})).view;
    const committed=await store.read_committed(view.run_id);
    const expectations=[
      {at:6000,work:0,artifacts:0,logKind:'accepted_receipt'},
      {at:7000,work:0,artifacts:0,logKind:'fix_receipt'},
      {at:46000,work:4,artifacts:0,logKind:'fix_receipt'},
      {at:47000,work:4,artifacts:1,logKind:'complete_receipt'},
    ] as const;
    for(const item of expectations){
      const history=await game.get_replay(view.run_id,item.at);
      const known=await history.get_view(view.run_id);
      expect(known.sim_time).toBe(item.at);
      expect(known.artifacts).toHaveLength(item.artifacts);
      expect(known.log.at(-1)?.kind).toBe(item.logKind);
      await expect(history.save({run_id:view.run_id,operation_id:`history-save-${item.at}`,expected_revision:known.revision,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');
      await expect(history.issue_order({run_id:view.run_id,operation_id:`history-issue-${item.at}`,expected_revision:known.revision,intent:{kind:'issue',command_id:`history-${item.at}`,plan}})).rejects.toThrow('HISTORY_READ_ONLY');
    }
    expect(await store.read_committed(view.run_id)).toEqual(committed);
    expect(current.artifacts).toHaveLength(1);
  }finally{await store.delete();}
});

test('same-scenario Record restart creates a new run, preserves the source as read-only, and returns to the new current run',async()=>{
  const {store,game,view}=await issueRecord('record-restart');
  try{
    const source=(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:47000}})).view;
    const before=await store.read_committed(source.run_id),snapshot=await store.snapshot(source.run_id,source.revision);
    const fresh=await game.restart_run(source.run_id,'restart-record');
    expect(fresh.run_id).not.toBe(source.run_id);
    expect(fresh.scenario_kind).toBe('record');
    expect(fresh.source_run).toBe(source.run_id);
    expect(fresh.sim_time).toBe(0);
    expect(fresh.artifacts).toEqual([]);
    expect((await game.get_view(source.run_id)).can_issue).toBe(false);
    expect(await game.restart_run(source.run_id,'restart-record')).toEqual(fresh);
    await expect(game.control_clock({run_id:source.run_id,operation_id:'source-write',expected_revision:source.revision,intent:{kind:'advance',to:47001}})).rejects.toThrow('HISTORY_READ_ONLY');
    expect(await store.read_committed(source.run_id)).toEqual(before);
    expect(await store.snapshot(source.run_id,source.revision)).toEqual(snapshot);
  }finally{await store.delete();}
});

test('record restore rejects an old Move-shaped package without migration',async()=>{
  const store=new Persistence('record-old-package-move'),game=new Game(store);
  try{
    const view=await game.create_run(engineeringDefinition,'research','create');
    const bad=structuredClone((await store.read_committed(view.run_id))!);
    bad.schema=5;
    bad.scenario_kind='record';
    await writeState(store,bad);
    await expect(new Game(store).restore(view.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
    expect((await store.read_committed(view.run_id))?.integrity).toBe(bad.integrity);
    expect(await game.get_receipt(view.run_id,'restore')).toBeNull();
  }finally{await store.delete();}
});

test('record restore rejects a mismatched Record package hash without migration',async()=>{
  const {store,game,view}=await issueRecord('record-mutated-package');
  try{
    const bad=structuredClone((await store.read_committed(view.run_id))!);
    bad.definition_hash='0'.repeat(64);
    await writeState(store,bad);
    await expect(new Game(store).restore(view.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
    expect((await store.read_committed(view.run_id))?.integrity).toBe(bad.integrity);
    expect(await game.get_receipt(view.run_id,'restore')).toBeNull();
  }finally{await store.delete();}
});


