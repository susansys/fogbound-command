import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {task_intent,type PlayerView} from '../src/contracts';
import type {State} from '../src/core/state';
import definition from './fixtures/prestart-definition.json';
import {engineeringDefinition,recordEngineeringDefinition} from '../src/core/scenario';

async function replace(game:Game,view:PlayerView){
  const plan=await game.preview_plan(view.run_id,view.revision,2);
  return (await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T','冻结的替代理由')})).view;
}
async function advance(game:Game,view:PlayerView,to:number){
  return (await game.control_clock({run_id:view.run_id,operation_id:`advance-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
}
async function prepared(name:string,point:number){
  const store=new Persistence(name),game=new Game(store);let view=await game.create_run(definition,'research','create');
  const plan=await game.preview_plan(view.run_id,view.revision,1);
  view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:task_intent(plan,'N','冻结的原理由')})).view;
  if(point>=2000){view=await advance(game,view,2000);view=await replace(game,view);}
  if(point!==0&&point!==2000)view=await advance(game,view,point);
  return {store,game,view};
}

test.each([0,500,1500,2000,2500,3000,4000,21900])('CR23/24 complete control package at %sms restores the same paused run without early public replacement',async(point)=>{
  const {store,game,view:before}=await prepared(`prestart-restore-${point}`,point);
  try{
    const saved=await game.save({run_id:before.run_id,operation_id:'save',expected_revision:before.revision,intent:{kind:'save'}});
    const source=await store.read_committed(before.run_id),fresh=new Game(store),restored=await fresh.restore(before.run_id,'restore');let view=restored.view;
    expect(restored.receipt.snapshot_revision).toBe(saved.view.revision);expect(view.run_id).toBe(before.run_id);expect(view.sim_time).toBe(point);expect(view.paused).toBe(true);
    expect(view.issued_orders).toEqual(before.issued_orders);expect(view.resources).toEqual(before.resources);expect(view.replacement).toEqual(before.replacement);
    const committed=await store.read_committed(before.run_id);
    expect(committed?.prestart).toEqual(source?.prestart);expect(committed?.world).toEqual(source?.world);expect(committed?.rng).toEqual(source?.rng);
    if(point<2000){view=await advance(fresh,view,2000);view=await replace(fresh,view);}
    view=await advance(fresh,view,120000);
    expect(view).toMatchObject({sim_time:40800,finished:true,position:{x:170,y:150},resources:{hq_energy:14,hq_wear:98,equipment_energy:6,equipment_wear:90,movement_energy:18,movement_energy_reserved:0}});
    expect(view.log.filter(entry=>entry.kind==='replace_receipt')).toHaveLength(1);expect(view.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(1);
  }finally{await store.delete();}
});

test('CR22 old Move4, Record5 and preparation6 keep their explicit definitions and capabilities through complete save and restore',async()=>{
  const examples=[{definition:engineeringDefinition,schema:4,kind:undefined,hash:'1514007aa26fc8f62fb9bc3c053ead9ee97ba04bef1e6066afbefa13125def87'},
    {definition:recordEngineeringDefinition,schema:5,kind:'record',hash:'650a1989b23da8b60f6072ffea8f29029db23b580c3a7cf6570464fd0c112417'},
    {definition,schema:6,kind:'prestart_move',hash:'648a3fc075474dfe7c96b77d7b859b1507c438e55391567f8f00477569bb7b12'}];
  for(const item of examples){
    const store=new Persistence(`prestart-compatible-${item.schema}`),game=new Game(store);
    try{
      const initial=await game.create_run(item.definition,'research','create');
      const saved=await game.save({run_id:initial.run_id,operation_id:'save',expected_revision:initial.revision,intent:{kind:'save'}});
      const restored=await new Game(store).restore(initial.run_id,'restore'),state=await store.read_committed(initial.run_id);
      expect(state).toMatchObject({schema:item.schema,contract:'0.5.1',definition_hash:item.hash});expect(state?.scenario_kind).toBe(item.kind);
      expect(restored.view.scenario_kind).toBe(item.kind);expect(restored.view.run_id).toBe(saved.view.run_id);expect(restored.view.issued_orders).toEqual([]);
    }finally{await store.delete();}
  }
});

function ordered(value:unknown):unknown{return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Record<string,unknown>)[key])])):value;}
async function write_package(store:Persistence,state:State){
  const {integrity:_integrity,...body}=state;state.integrity=createHash('sha256').update(JSON.stringify(ordered(body))).digest('hex');
  await new Promise<void>((resolve,reject)=>{const open=indexedDB.open(store.name);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction(['runs','snapshots'],'readwrite');tx.objectStore('runs').put(state);tx.objectStore('snapshots').put({key:`${state.run_id}:${state.revision}`,run_id:state.run_id,state});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
}

test.each(['definition','registry','reference','phase','reservation','settlement-unit','settlement-cost','case','duplicate-cause'])('CR22 rechecks a full package with valid outer checksum but corrupt %s without rewriting the original',async(fault)=>{
  const {store,game,view}=await prepared(`prestart-bad-${fault}`,3000);
  try{
    const bad=structuredClone((await store.read_committed(view.run_id))!);
    if(fault==='definition')bad.definition_hash='0'.repeat(64);
    else if(fault==='registry')bad.hashes.profile='0'.repeat(64);
    else if(fault==='reference')bad.prestart!.requests[1].plan.supersedes='missing-command';
    else if(fault==='phase')bad.prestart!.activities[1].phase='completed';
    else if(fault==='reservation')bad.world.movement_energy_reserved=0;
    else if(fault==='settlement-unit')Reflect.set(bad.prestart!.activities[0].settlement!.distance,'unit','record_work');
    else if(fault==='settlement-cost')bad.prestart!.activities[0].settlement!.energy=1;
    else if(fault==='case')bad.prestart!.case_ref='unregistered-condition';
    else bad.prestart!.activities[1].settlement=structuredClone(bad.prestart!.activities[0].settlement);
    await write_package(store,bad);
    await expect(new Game(store).restore(view.run_id,'restore')).rejects.toMatchObject({code:'INVALID_SAVE'});
    expect(await store.read_committed(view.run_id)).toEqual(bad);expect(await store.snapshot(view.run_id,bad.revision)).toEqual(bad);expect(await game.get_receipt(view.run_id,'restore')).toBeNull();
  }finally{await store.delete();}
});

test('CR25/26 control history is legal and read-only across same-time registration, replacement and old due time; restart keeps the old run immutable',async()=>{
  const {store,game,view:registered}=await prepared('prestart-history-restart',2000);
  try{
    const final=await advance(game,registered,120000),source=await store.read_committed(final.run_id);
    const points=[{at:2000,revision:registered.revision,replacement:false,energy:15},{at:3000,replacement:false,energy:15},{at:4000,replacement:true,energy:14},{at:21900,replacement:true,energy:11}];
    for(const point of points){
      const replay=await game.get_replay(final.run_id,point.at,point.revision),history=await replay.get_view(final.run_id);
      expect(history.sim_time).toBe(point.at);expect(Boolean(history.replacement)).toBe(point.replacement);expect(history.resources.equipment_energy).toBe(point.energy);expect(history.finished).toBe(false);
      await expect(replay.save({run_id:history.run_id,operation_id:`readonly-${point.at}`,expected_revision:history.revision,intent:{kind:'save'}})).rejects.toMatchObject({code:'HISTORY_READ_ONLY'});
      expect(await store.read_committed(final.run_id)).toEqual(source);
    }
    const fresh=await game.restart_run(final.run_id,'restart'),freshState=await store.read_committed(fresh.run_id);
    expect(fresh.run_id).not.toBe(final.run_id);expect(fresh).toMatchObject({source_run:final.run_id,sim_time:0,scenario_kind:'prestart_move',issued_orders:[],can_issue:true});
    expect(freshState?.rng).toEqual(source?.rng);expect(freshState?.rng.origin).toBe(final.run_id);expect(freshState?.prestart?.activities).toEqual([]);
    const plan=await game.preview_plan(fresh.run_id,fresh.revision,1);expect(plan.target).toBe('N');
    await expect(game.issue_order({run_id:final.run_id,operation_id:'old-write',expected_revision:final.revision,intent:task_intent(plan,'forbidden')})).rejects.toMatchObject({code:'HISTORY_READ_ONLY'});
    expect(await store.read_committed(final.run_id)).toEqual(source);expect((await game.get_view(final.run_id)).can_issue).toBe(false);
  }finally{await store.delete();}
});
