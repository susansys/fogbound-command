import {createHash} from 'node:crypto';
import {expect,test} from 'vitest';
import type {Envelope, PlayerView} from '../src/contracts';
import {Game} from '../src/core/game';
import {project_player_view} from '../src/core/knowledge';
import {Persistence} from '../src/core/persistence';
import {recordEngineeringDefinition} from '../src/core/scenario';
import type {State} from '../src/core/state';
import {player_view} from '../src/dto';

function ordered(value:unknown):unknown{
  return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Record<string,unknown>)[key])])):value;
}
function integrity(state:State){
  const {integrity: _integrity,...body}=state;
  return createHash('sha256').update(JSON.stringify(ordered(body))).digest('hex');
}
async function writeState(store:Persistence,state:State){
  state.integrity=integrity(state);
  await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(state);tx.objectStore('snapshots').put({key:`${state.run_id}:${state.revision}`,run_id:state.run_id,state});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
}
async function recordIssued(name:string,preIssue=0){
  const store=new Persistence(name),game=new Game(store);
  let start=await game.create_run(recordEngineeringDefinition,'research','create');
  if(preIssue)start=(await game.control_clock({run_id:start.run_id,operation_id:'pre-issue',expected_revision:start.revision,intent:{kind:'advance',to:preIssue}})).view;
  const plan=await game.preview_plan(start.run_id,start.revision,1);
  const envelope:Envelope={run_id:start.run_id,operation_id:'issue',expected_revision:start.revision,intent:{kind:'issue',command_id:'record',plan}};
  const issued=await game.issue_order(envelope);
  return {store,game,view:issued.view,envelope,receipt:issued.receipt};
}

test('record frozen operation retry reuses the original receipt and conflicting reuse does not spend or produce again',async()=>{
  const {store,game,view,envelope,receipt}=await recordIssued('record-retry');
  try{
    const repeat=await game.issue_order(envelope);
    expect(repeat.receipt).toEqual(receipt);
    expect(repeat.view).toEqual(view);
    const changed=structuredClone(envelope);
    if(changed.intent.kind!=='issue')throw new Error('bad fixture');
    changed.intent.command_id='record-other';
    await expect(game.issue_order(changed)).rejects.toThrow('OPERATION_CONFLICT');
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await store.read_committed(view.run_id)).toMatchObject({revision:view.revision,world:{hq_energy:16,hq_wear:100,record_artifacts:[]}});
  }finally{await store.delete();}
});

test.each([6000,46000,47000])('record transaction abort at %sms rolls back the whole candidate and keeps the safe receipt',async(target)=>{
  const {store,game,view}=await recordIssued(`record-abort-${target}`);
  try{
    const safeTo=target===6000?2000:target===46000?7000:46000;
    const safe=await game.control_clock({run_id:view.run_id,operation_id:'safe',expected_revision:view.revision,intent:{kind:'advance',to:safeTo}});
    const native=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
      const value=args[0] as {sim_time?:number};
      const request=native.apply(this,args);
      if(this.name==='runs'&&value?.sim_time===target)request.addEventListener('success',()=>this.transaction.abort(),{once:true});
      return request;
    };
    try{
      await expect(game.control_clock({run_id:view.run_id,operation_id:'failed',expected_revision:safe.view.revision,intent:{kind:'advance',to:target}})).rejects.toThrow('STORAGE_UNCONFIRMED');
    }finally{IDBObjectStore.prototype.put=native;}
    expect(await game.get_view(view.run_id)).toEqual(safe.view);
    expect(await game.get_receipt(view.run_id,'safe')).toEqual(safe.receipt);
    expect(await game.get_receipt(view.run_id,'failed')).toBeNull();
    await expect(game.control_clock({run_id:view.run_id,operation_id:'after-fault',expected_revision:safe.view.revision,intent:{kind:'advance',to:target}})).rejects.toThrow('STORAGE_UNCONFIRMED');
    expect(await game.get_view(view.run_id)).toEqual(safe.view);
  }finally{await store.delete();}
});

test('record explicit takeover pauses the same run and fences the older writer generation',async()=>{
  const store=new Persistence('record-writer-handover'),oldGame=new Game(store);
  try{
    let view=await oldGame.create_run(recordEngineeringDefinition,'command','create');
    view=(await oldGame.tick(view.run_id,2500,'tick')).view;
    const next=new Game(store);
    const takeover=await next.restore(view.run_id,'takeover');
    expect(takeover.view.run_id).toBe(view.run_id);
    expect(takeover.view.paused).toBe(true);
    expect(takeover.view.sim_time).toBe(view.sim_time);
    await expect(oldGame.control_clock({run_id:view.run_id,operation_id:'stale-writer',expected_revision:takeover.view.revision,intent:{kind:'continue'}})).rejects.toThrow('STALE_WRITER');
    expect(await next.get_view(view.run_id)).toEqual(takeover.view);
  }finally{await store.delete();}
});

const corruptions=[
  {label:'disallowed-frozen-plan',advance:2000,apply:(s:State)=>{
    if(s.order&&'kind' in s.order.plan)s.order.plan.allowed=false;
    for(const input of s.inputs)if(input.envelope.intent.kind==='issue')input.envelope.intent.plan.allowed=false;
  }},
  {label:'stale-frozen-plan',preIssue:100,advance:2000,apply:(s:State)=>{
    if(s.order)s.order.plan.revision=1;
    for(const input of s.inputs)if(input.envelope.intent.kind==='issue')input.envelope.intent.plan.revision=1;
  }},
  {label:'illegal-clock-mode',advance:2000,apply:(s:State)=>{
    for(const input of s.inputs)if(input.envelope.intent.kind==='advance')input.envelope.intent={kind:'tick',to:input.envelope.intent.to};
  }},
  {label:'crossed-record-reference',advance:999,apply:(s:State)=>{
    if(s.order&&'kind' in s.order.plan&&s.order.plan.kind==='record')s.order.plan.report_id='MISSING';
    for(const input of s.inputs)if(input.envelope.intent.kind==='issue'&&'kind' in input.envelope.intent.plan&&input.envelope.intent.plan.kind==='record')input.envelope.intent.plan.report_id='MISSING';
  }},
  {label:'missing-events',advance:999,apply:(s:State)=>{s.schedule=[];}},
  {label:'world-energy-conservation',advance:999,apply:(s:State)=>{s.world.record_energy={numerator:0,denominator:1,unit:'record_energy'};}},
  {label:'known-energy-evidence',advance:2000,apply:(s:State)=>{s.known.resources.record_energy=999;}},
  {label:'wrong-quantity-unit',advance:17001,apply:(s:State)=>{s.world.record_work!.unit='record_energy';}},
  {label:'non-reduced-quantity',advance:26000,apply:(s:State)=>{s.world.record_work={numerator:4,denominator:2,unit:'record_work'};}},
  {label:'lost-reservation',advance:26000,apply:(s:State)=>{s.world.record_energy_reserved={numerator:0,denominator:1,unit:'record_energy'};}},
  {label:'duplicate-consumption-cause',advance:47000,apply:(s:State)=>{s.world.record_causes!.push('record.settle');}},
  {label:'record-work',advance:17001,apply:(s:State)=>{s.world.record_work={numerator:4,denominator:1,unit:'record_work'};}},
  {label:'artifact-reference',advance:47000,apply:(s:State)=>{s.world.record_artifacts![0].report_id='MISSING';s.known.artifacts![0].report_id='MISSING';}},
  {label:'receipt-artifact-on-start',advance:1000,apply:(s:State)=>{s.schedule.find(x=>x.kind==='accepted_receipt')!.payload={...s.schedule.find(x=>x.kind==='accepted_receipt')!.payload!,artifacts:[{id:'artifact-record',report_id:'REPORT-A',delivery_id:'DELIVERY-A',completed:1000,verified:false,activity_id:'record.accept.0'}]};}},
  {label:'event-phase',advance:2000,apply:(s:State)=>{s.schedule.find(x=>x.kind==='fix')!.phase=20;}},
  {label:'duplicate-event',advance:2000,apply:(s:State)=>{s.schedule.push(structuredClone(s.schedule.find(x=>x.kind==='fix')!));s.schedule.sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id));}},
  {label:'activity-log',advance:47000,apply:(s:State)=>{s.log.find(x=>x.kind==='complete_receipt')!.activity_id='record.wrong.0';}},
];
test.each(corruptions)('record restore rejects a self-consistent corrupted $label package',async(corruption)=>{
  const {label,advance,apply}=corruption;
  const {store,game,view}=await recordIssued(`record-bad-${label}`,'preIssue' in corruption?corruption.preIssue:0);
  try{
    const current=(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:advance}})).view;
    const bad=structuredClone((await store.read_committed(current.run_id))!);
    apply(bad);
    await writeState(store,bad);
    await expect(new Game(store).restore(current.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
    expect((await store.read_committed(current.run_id))?.integrity).toBe(bad.integrity);
    expect(await game.get_receipt(current.run_id,'restore')).toBeNull();
  }finally{await store.delete();}
});

test('private record world variants with the same legal known evidence do not change the PlayerView',async()=>{
  const {store,game,view}=await recordIssued('record-private-variant');
  try{
    const atStart=(await game.control_clock({run_id:view.run_id,operation_id:'advance',expected_revision:view.revision,intent:{kind:'advance',to:7000}})).view;
    const committed=(await store.read_committed(view.run_id))!;
    const variant=structuredClone(committed);
    variant.world.record_work={numerator:7,denominator:2,unit:'record_work'};
    variant.world.record_energy={numerator:1,denominator:1,unit:'record_energy'};
    variant.world.record_artifacts=[{id:'artifact-private',report_id:'REPORT-A',delivery_id:'DELIVERY-A',completed:6999,verified:false,activity_id:'private.complete.0'}];
    const projected=project_player_view(variant);
    expect(projected).toEqual(atStart satisfies PlayerView);
    expect(player_view(projected)).toBe(true);
    expect(JSON.stringify(projected)).not.toContain('artifact-private');
  }finally{await store.delete();}
});

test('Record restore rejects a rewritten restoration snapshot reference even with a new checksum',async()=>{
  const {store,game,view}=await recordIssued('record-bad-restore-reference');
  try{
    await game.restore(view.run_id,'first-restore');
    const bad=structuredClone((await store.read_committed(view.run_id))!);
    const input=bad.inputs.find(x=>x.envelope.intent.kind==='restore')!;
    if(input.envelope.intent.kind==='restore')input.envelope.intent.snapshot_revision=1;
    await writeState(store,bad);
    await expect(new Game(store).restore(view.run_id,'second-restore')).rejects.toThrow('INVALID_SAVE');
    expect((await store.read_committed(view.run_id))?.integrity).toBe(bad.integrity);
  }finally{await store.delete();}
});

test('Record restore rejects time advancement without a committed input',async()=>{
  const store=new Persistence('record-unrecorded-time'),game=new Game(store);
  try{
    const view=await game.create_run(recordEngineeringDefinition,'research','create');
    const bad=structuredClone((await store.read_committed(view.run_id))!);
    bad.sim_time=1;
    await writeState(store,bad);
    await expect(new Game(store).restore(view.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
    expect((await store.read_committed(view.run_id))?.integrity).toBe(bad.integrity);
  }finally{await store.delete();}
});

test('Record restore rejects an out-of-range adopted clock even when completion clips the resulting time',async()=>{
  const store=new Persistence('record-invalid-clock-bound'),game=new Game(store);
  try{
    const start=await game.create_run(recordEngineeringDefinition,'command','create');
    const plan=await game.preview_plan(start.run_id,start.revision,1);
    const issued=await game.issue_order({run_id:start.run_id,operation_id:'issue',expected_revision:start.revision,intent:{kind:'issue',command_id:'record',plan}});
    const completed=await game.save({run_id:start.run_id,operation_id:'save',expected_revision:issued.view.revision,intent:{kind:'save'}},610000);
    expect(completed.view.sim_time).toBe(47000);
    const bad=structuredClone((await store.read_committed(start.run_id))!);
    bad.inputs.at(-1)!.clock_to=610001;
    await writeState(store,bad);
    await expect(new Game(store).restore(start.run_id,'restore')).rejects.toThrow('INVALID_SAVE');
    expect((await store.read_committed(start.run_id))?.integrity).toBe(bad.integrity);
  }finally{await store.delete();}
});
