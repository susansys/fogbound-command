import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {task_intent} from '../src/contracts';
import type {Envelope} from '../src/contracts';
import definition from './fixtures/prestart-definition.json';

test('CR20 a planned replacement at the same clock follows command registration causality, regardless of opaque IDs',async()=>{
  const store=new Persistence('prestart-same-clock'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:task_intent(plan,'Z-original')})).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'A-replacement')})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:120000}})).view;
    expect(view).toMatchObject({sim_time:38800,finished:true,replacement:{original_command_id:'Z-original',replacement_command_id:'A-replacement',accepted_at:1000,received_at:2000},position:{x:170,y:150},resources:{hq_energy:14,equipment_energy:6,movement_energy:18}});
    expect(view.log.some(entry=>entry.kind==='rejected_receipt')).toBe(false);
  }finally{await store.delete();}
});

test('CR20 fixed N at zero and T at two seconds have identical physical causes and costs with a 120-second request or one-second requests',async()=>{
  const stores=[new Persistence('prestart-big-step'),new Persistence('prestart-small-step')];
  try{
    const results=[];
    for(const [index,store] of stores.entries()){
      const game=new Game(store);let view=await game.create_run(definition,'research','create');let plan=await game.preview_plan(view.run_id,view.revision,1);
      view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:task_intent(plan,'N')})).view;
      for(const to of index===0?[2000]:[1000,2000])view=(await game.control_clock({run_id:view.run_id,operation_id:`before-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
      plan=await game.preview_plan(view.run_id,view.revision,2);
      const envelope:Envelope={run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T','保留原字理由')};
      const registered=await game.issue_order(envelope);view=registered.view;
      for(const to of index===0?[120000]:Array.from({length:118},(_,i)=>(i+3)*1000)){
        if(view.finished)break;
        view=(await game.control_clock({run_id:view.run_id,operation_id:`after-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
      }
      expect(view).toMatchObject({sim_time:40800,finished:true,position:{x:170,y:150},resources:{hq_energy:14,hq_wear:98,equipment_energy:6,equipment_wear:90,movement_energy:18,movement_energy_reserved:0}});
      const before=await store.read_committed(view.run_id);
      expect((await game.issue_order(envelope)).receipt).toEqual(registered.receipt);
      await expect(game.issue_order({...envelope,intent:task_intent(plan,'T','改了理由')})).rejects.toMatchObject({code:'OPERATION_CONFLICT'});
      await expect(game.control_clock({run_id:view.run_id,operation_id:'past-end',expected_revision:view.revision,intent:{kind:'advance',to:120000}})).rejects.toMatchObject({code:'RUN_ENDED'});
      expect(await store.read_committed(view.run_id)).toEqual(before);
      results.push({world:before!.world,activities:before!.prestart!.activities,records:before!.prestart!.records,log:view.log,resources:view.resources,position:view.position,replacement:view.replacement});
    }
    expect(results[1]).toEqual(results[0]);
  }finally{for(const store of stores)await store.delete();}
});

test('CR21 cutoff settles the exact fractional distance once and retains both reservation tickets',async()=>{
  const store=new Persistence('prestart-cutoff-ticket'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');
    view=(await game.control_clock({run_id:view.run_id,operation_id:'late',expected_revision:view.revision,intent:{kind:'advance',to:577000}})).view;
    let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:task_intent(plan,'N')})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'before-replace',expected_revision:view.revision,intent:{kind:'advance',to:579000}})).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'cutoff',expected_revision:view.revision,intent:{kind:'advance',to:601000}})).view;
    expect(view.resources).toMatchObject({hq_energy:14,equipment_energy:10,movement_energy:19,movement_energy_reserved:0});
    const saved=await store.read_committed(view.run_id);
    expect(saved?.prestart?.activities.map(activity=>activity.settlement)).toEqual([
      {cause:'N.activity.1:settle',at:580000,distance:{numerator:0,denominator:1,unit:'fictional_metre'},energy:0,released:1},
      {cause:'T.activity.2:settle',at:600000,distance:{numerator:3000,denominator:53,unit:'fictional_metre'},energy:1,released:2},
    ]);
  }finally{await store.delete();}
});

test('CR21 replacing preparation preserves paid messages and settles the original zero-distance reservation before reserving the new path',async()=>{
  const store=new Persistence('prestart-conservation'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:task_intent(plan,'N')})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'new-acceptance',expected_revision:view.revision,intent:{kind:'advance',to:3000}})).view;
    const switched=await store.read_committed(view.run_id);
    expect(switched?.prestart?.activities[0]).toMatchObject({phase:'superseded',reserved:1,settled:true,settlement:{at:3000,distance:{numerator:0,denominator:1,unit:'fictional_metre'},energy:0}});
    expect(switched?.world).toMatchObject({hq_energy:14,equipment_energy:14,movement_energy:20,movement_energy_reserved:2});
    view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:120000}})).view;
    expect(view).toMatchObject({sim_time:40800,finished:true,resources:{hq_energy:14,hq_wear:98,equipment_energy:6,equipment_wear:90,movement_energy:18,movement_energy_reserved:0}});
    const final=await store.read_committed(view.run_id);
    expect(final?.prestart?.activities[1]).toMatchObject({settled:true,settlement:{at:39800,distance:{numerator:120,denominator:1,unit:'fictional_metre'},energy:2}});
  }finally{await store.delete();}
});

test('CR19 another operation cannot reuse the original command identity as its replacement or consume the replacement slot',async()=>{
  const store=new Persistence('prestart-command-identity'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}})).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    await expect(game.issue_order({run_id:view.run_id,operation_id:'duplicate-command',expected_revision:view.revision,intent:task_intent(plan,'N')})).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(await game.get_view(view.run_id)).toEqual(view);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')})).view;
    expect(view.issued_orders.map(order=>order.command_id)).toEqual(['N','T']);expect(view.resources.hq_energy).toBe(16);
  }finally{await store.delete();}
});

test('CR18 a real persistence abort rolls back replacement acceptance completely; the identical operation retries once with its original receipt',async()=>{
  const store=new Persistence('prestart-acceptance-abort'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    const registered=await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')});view=registered.view;
    const safe=await store.read_committed(view.run_id);
    const attempt:Envelope={run_id:view.run_id,operation_id:'acceptance-batch',expected_revision:view.revision,intent:{kind:'advance',to:3000}};
    const native=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){
      const request=native.apply(this,args),value=args[0] as {sim_time?:number};
      if(this.name==='runs'&&value?.sim_time===3000)request.addEventListener('success',()=>this.transaction.abort(),{once:true});
      return request;
    };
    try{await expect(game.control_clock(attempt)).rejects.toMatchObject({code:'STORAGE_UNCONFIRMED'});}finally{IDBObjectStore.prototype.put=native;}
    expect(await store.read_committed(view.run_id)).toEqual(safe);expect(await game.get_view(view.run_id)).toEqual(view);expect(view.paused).toBe(true);
    expect(await game.get_receipt(view.run_id,'acceptance-batch')).toBeNull();expect(await game.get_receipt(view.run_id,'replacement')).toEqual(registered.receipt);
    await expect(game.control_clock(attempt)).rejects.toMatchObject({code:'STORAGE_UNCONFIRMED'});
    const recovering=new Game(store),retried=await recovering.control_clock(attempt);
    expect(retried.view.resources).toMatchObject({hq_energy:14,equipment_energy:15,movement_energy_reserved:1});expect(retried.view).not.toHaveProperty('replacement');
    const committed=await store.read_committed(view.run_id);
    expect(committed?.prestart?.records.filter(record=>record.command_id==='T'&&record.kind==='accepted')).toHaveLength(1);
    expect(committed?.prestart?.activities).toHaveLength(2);expect(committed?.world).toMatchObject({hq_energy:14,equipment_energy:14,movement_energy_reserved:2});
    expect(await recovering.control_clock(attempt)).toEqual(retried);
    await expect(recovering.control_clock({...attempt,intent:{kind:'advance',to:4000}})).rejects.toMatchObject({code:'OPERATION_CONFLICT'});
    expect(await recovering.get_view(view.run_id)).toEqual(retried.view);
  }finally{await store.delete();}
});
