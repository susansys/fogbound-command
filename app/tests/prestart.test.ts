import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from './fixtures/prestart-definition.json';
import {valid_response} from '../src/dto';
import {recordEngineeringDefinition} from '../src/core/scenario';

test('CR07 the explicit schema6 preparation scenario has its own validated initial public entry',async()=>{
  const store=new Persistence('prestart-entry'),game=new Game(store);
  try{
    const view=await game.create_run(definition,'research','create');
    expect(view).toMatchObject({scenario_kind:'prestart_move',geometry:{H:[50,150],N:[110,150],T:[170,150]},resources:{hq_energy:16,hq_wear:100,movement_energy:20},status:'ready'});
    expect(valid_response({request_id:'entry',ok:true,view})).toBe(true);
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each([definition,recordEngineeringDefinition])('same-time management pause in $id does not retrospectively send a pending command',async(input)=>{
  const store=new Persistence(`same-time-pause-${input.id}`),game=new Game(store);
  try{
    let view=await game.create_run(input,'command','create');const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'pause',expected_revision:view.revision,intent:{kind:'pause',reason:'manual'}},0)).view;
    expect(view).toMatchObject({paused:true,sim_time:0,resources:{hq_energy:16}});expect(view.log.some(entry=>entry.kind==='sent')).toBe(false);
    expect(await game.get_view(view.run_id)).toEqual(view);
    const history=await game.get_replay(view.run_id,0);expect(await history.get_view(view.run_id)).toMatchObject({paused:true,sim_time:0,resources:{hq_energy:16}});
  }finally{await store.delete();}
});

test('the new scenario keeps confirmed command-mode management pause and rate controls',async()=>{
  const store=new Persistence('prestart-management-clock'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'command','create');const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'pause',expected_revision:view.revision,intent:{kind:'pause',reason:'manual'}},2000)).view;
    expect(view).toMatchObject({paused:true,sim_time:2000,status:'preparing'});
    view=(await game.control_clock({run_id:view.run_id,operation_id:'rate',expected_revision:view.revision,intent:{kind:'rate',rate:4}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'continue',expected_revision:view.revision,intent:{kind:'continue'}})).view;
    view=(await game.tick(view.run_id,4000,'tick')).view;
    expect(view).toMatchObject({paused:false,rate:4,sim_time:4000,status:'preparing'});expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('CR08/CR10 replacing preparing N with T invalidates old work while preserving old queued completion and legal knowledge',async()=>{
  const store=new Persistence('prestart-replacement-normal'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');const original=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register-original',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan:original}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    const replacement=await game.preview_plan(view.run_id,view.revision,2);
    expect(replacement).toMatchObject({kind:'prestart_move',target:'T',supersedes:'original',allowed:true});
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register-replacement',expected_revision:view.revision,intent:{kind:'issue',command_id:'replacement',plan:replacement}})).view;
    expect(view.resources.hq_energy).toBe(15);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'local-replace',expected_revision:view.revision,intent:{kind:'advance',to:3000}})).view;
    expect(view).not.toHaveProperty('replacement');expect(view.resources.equipment_energy).toBe(15);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'replacement-ack',expected_revision:view.revision,intent:{kind:'advance',to:4000}})).view;
    expect(view).toMatchObject({replacement:{original_command_id:'original',replacement_command_id:'replacement',accepted_at:3000,received_at:4000},resources:{hq_energy:14,hq_wear:98,equipment_energy:14,movement_energy:20,movement_energy_reserved:2}});
    view=(await game.control_clock({run_id:view.run_id,operation_id:'before-old-complete',expected_revision:view.revision,intent:{kind:'advance',to:20000}})).view;
    const queued=await store.read_committed(view.run_id);
    expect(queued?.prestart?.activities[0]).toMatchObject({command_id:'original',generation:1,phase:'superseded'});
    expect(queued?.prestart?.queue.some(event=>event.kind==='complete'&&event.command_id==='original'&&event.at===21900)).toBe(true);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'old-completion-skipped',expected_revision:view.revision,intent:{kind:'advance',to:21900}})).view;
    expect(view).toMatchObject({status:'executing',finished:false,position:{x:87.74,observed:18000,received:19000},resources:{movement_energy:20}});
    const actual=(await store.read_committed(view.run_id))!.world.position;
    expect(Math.round(actual.xn/actual.d*100)/100).toBe(102.45);expect(view.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(0);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:120000}})).view;
    expect(view).toMatchObject({sim_time:40800,finished:true,paused:true,position:{x:170,observed:39800,received:40800},resources:{hq_energy:14,hq_wear:98,equipment_energy:6,equipment_wear:90,movement_energy:18,movement_energy_reserved:0}});
    expect(view.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(1);
    expect(view.issued_orders).toHaveLength(2);expect(view.issued_orders[0].plan.target).toBe('N');expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('CR07 original N prepares for five seconds, moves once, and only ends on the delivered completion',async()=>{
  const store=new Persistence('prestart-original-normal'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan}})).view;
    for(const [to,status] of [[6000,'preparing'],[7000,'executing'],[21900,'executing'],[22900,'finished']] as const){
      view=(await game.control_clock({run_id:view.run_id,operation_id:`advance-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
      expect(view.status).toBe(status);
      if(to===6000)expect(view.resources).toMatchObject({equipment_energy:15,movement_energy:20});
      if(to===21900){expect(view.finished).toBe(false);expect(view.position).toMatchObject({x:87.74,observed:16000,received:17000});}
    }
    expect(view).toMatchObject({sim_time:22900,finished:true,paused:true,position:{x:110,observed:21900,received:22900},resources:{hq_energy:15,hq_wear:99,equipment_energy:10,equipment_wear:94,movement_energy:19,movement_energy_reserved:0}});
    expect(view.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(1);
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('CR07 local acceptance reserves movement but headquarters learns preparation and equipment fees only from its receipt',async()=>{
  const store=new Persistence('prestart-acceptance'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'local-accept',expected_revision:view.revision,intent:{kind:'advance',to:1000}})).view;
    expect(view.status).toBe('queued');expect(view.resources.equipment_energy).toBe(16);expect(view.position.observed).toBe(0);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'hq-receipt',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    expect(view).toMatchObject({status:'preparing',resources:{equipment_energy:15,equipment_wear:99,movement_energy:20,movement_energy_reserved:1,hq_energy:15,hq_wear:99,confirmed_at:2000}});
    expect(view.log.at(-1)).toMatchObject({kind:'accepted_receipt',observed:1000,at:2000});expect(view.position.observed).toBe(0);
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('CR09 actual HQ send pays once while the real registration snapshot and time-zero history remain uncharged',async()=>{
  const store=new Persistence('prestart-send'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan}})).view;
    const registration=view.revision;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'send',expected_revision:view.revision,intent:{kind:'advance',to:999}})).view;
    expect(view.resources).toMatchObject({hq_energy:15,hq_wear:99,equipment_energy:16,movement_energy:20});
    expect(view.log.filter(entry=>entry.kind==='sent')).toHaveLength(1);
    for(const history of [await game.get_replay(view.run_id,0,registration),await game.get_replay(view.run_id,0)]){
      const known=await history.get_view(view.run_id);expect(known.resources.hq_energy).toBe(16);expect(known.log.some(entry=>entry.kind==='sent')).toBe(false);
    }
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('CR09 the N task preview registers an original command without claiming send or charging any message',async()=>{
  const store=new Persistence('prestart-register'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    expect(plan).toMatchObject({kind:'prestart_move',target:'N',path:'H-N',distance:60,estimated_move_ms:15900,setup_ms:5000,allowed:true});
    view=(await game.issue_order({run_id:view.run_id,operation_id:'register',expected_revision:view.revision,intent:{kind:'issue',command_id:'original',plan,reason:'先抵达近联络点'}})).view;
    expect(view).toMatchObject({status:'queued',sim_time:0,resources:{hq_energy:16,hq_wear:100,equipment_energy:16,movement_energy:20},issued_orders:[{command_id:'original',issued:0,plan,reason:'先抵达近联络点'}]});
    expect(view.log.filter(entry=>entry.kind==='sent')).toHaveLength(0);
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});
