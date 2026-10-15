import {legacy_view,legacy_result,legacy_state} from './legacy-branch';
import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from './fixtures/prestart-definition.json';
import {task_intent} from '../src/contracts';
import type {Mode,PlayerView} from '../src/contracts';

test('CR11 replacement arriving at the half-open preparation endpoint is refused by R while the original N task completes',async()=>{
  const store=new Persistence('prestart-window-end'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create'));
    const original=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan:original}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'before-start',expected_revision:view.revision,intent:{kind:'advance',to:5000}}))).view;
    const replacement=await game.preview_plan(view.run_id,view.revision,2);expect(replacement.allowed).toBe(true);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replace',expected_revision:view.revision,intent:task_intent(replacement,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'endpoint',expected_revision:view.revision,intent:{kind:'advance',to:6000}}))).view;
    expect(view).not.toHaveProperty('replacement');expect(view.log.some(entry=>entry.kind==='rejected_receipt')).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'receive-rejection',expected_revision:view.revision,intent:{kind:'advance',to:7000}}))).view;
    expect(view.log.find(entry=>entry.kind==='rejected_receipt')).toMatchObject({observed:6000,at:7000});
    expect(view.gap).toContain('原任务继续');expect(view).not.toHaveProperty('replacement');
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'finish-N',expected_revision:view.revision,intent:{kind:'advance',to:120000}}))).view;
    expect(view).toMatchObject({finished:true,sim_time:22900,position:{x:110},resources:{hq_energy:14,hq_wear:98,equipment_energy:9,equipment_wear:93,movement_energy:19,movement_energy_reserved:0}});
    expect(view.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(1);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR13 authored 20-second HQ outage queues the replacement without fees, then rejects it after N finishes and keeps bounded public cleanup',async()=>{
  const store=new Persistence('prestart-short-outage'),game=new Game(store);
  try{
    const createWithCase=game.create_run.bind(game);
    let view=legacy_view(await createWithCase(definition,'research','create','hq_short_outage'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'still-queued',expected_revision:view.revision,intent:{kind:'advance',to:21900}}))).view;
    expect(view.resources.hq_energy).toBe(15);expect(view).not.toHaveProperty('replacement');expect(view.finished).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'original-receipt',expected_revision:view.revision,intent:{kind:'advance',to:22900}}))).view;
    expect(view).toMatchObject({finished:false,status:'terminating',position:{x:110},resources:{hq_energy:14,equipment_energy:10,movement_energy:19}});
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'rejection-receipt',expected_revision:view.revision,intent:{kind:'advance',to:120000}}))).view;
    expect(view).toMatchObject({finished:true,sim_time:24000,paused:true,position:{x:110},resources:{hq_energy:14,hq_wear:98,equipment_energy:9,equipment_wear:93,movement_energy:19}});
    expect(view.log.find(entry=>entry.kind==='rejected_receipt')).toMatchObject({observed:23000,at:24000});expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR12 rejected registration does not consume the one replacement slot, while a new third command is explicitly refused',async()=>{
  const store=new Persistence('prestart-one-slot'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    const intent=task_intent(plan,'T');if(intent.kind!=='replace_task')throw Error('Expected replacement');
    await expect(game.issue_order({run_id:view.run_id,operation_id:'bad-reference',expected_revision:view.revision,intent:{...intent,original_version:2 as 1}})).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent}))).view;
    const third=await game.preview_plan(view.run_id,view.revision,3);expect(third.allowed).toBe(false);
    await expect(game.issue_order({run_id:view.run_id,operation_id:'third',expected_revision:view.revision,intent:task_intent(third,'T-again')})).rejects.toMatchObject({code:'REPLACEMENT_LIMIT'});
    expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);expect(view.resources.hq_energy).toBe(16);expect(view.issued_orders).toHaveLength(2);
  }finally{await store.delete();}
});

test('CR14 a never-sent replacement expires before the outage endpoint can send it, preserving the original completion and its fees',async()=>{
  const store=new Persistence('prestart-expiry-outage'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','hq_expiry_outage'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'pending-control',expected_revision:view.revision,intent:{kind:'advance',to:121999}}))).view;
    expect(view).toMatchObject({status:'terminating',finished:false,position:{x:110},resources:{hq_energy:15,equipment_energy:10}});
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'expiry',expected_revision:view.revision,intent:{kind:'advance',to:122000}}))).view;
    expect(view).toMatchObject({sim_time:122000,finished:true,paused:true,resources:{hq_energy:15,hq_wear:99,equipment_energy:10,equipment_wear:94,movement_energy:19}});
    expect(view.log.find(entry=>entry.kind==='expired')).toMatchObject({at:122000,sender:'总部指挥席'});
    expect(view.log.filter(entry=>entry.kind==='sent')).toHaveLength(1);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR17 a late original acceptance stays attributed to N and cannot roll back the confirmed replacement or its legal resources',async()=>{
  const store=new Persistence('prestart-old-ack-late'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','old_acceptance_delayed'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'still-unknown',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    expect(view.log.some(entry=>entry.kind==='accepted_receipt')).toBe(false);expect(view.resources.equipment_energy).toBe(16);
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'new-ack',expected_revision:view.revision,intent:{kind:'advance',to:4000}}))).view;
    expect(view).toMatchObject({status:'preparing',replacement:{replacement_command_id:'T'},resources:{equipment_energy:14,movement_energy_reserved:2}});
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:6000}}))).view;
    expect(view).toMatchObject({status:'preparing',replacement:{replacement_command_id:'T'},resources:{equipment_energy:14,movement_energy_reserved:2,confirmed_at:4000}});
    const old=view.log.find(entry=>entry.kind==='accepted_receipt');expect(old).toMatchObject({observed:1000,at:6000,activity_id:'N.accept.0'});expect(old?.text).toContain('目标 N');
    expect(view.log.filter(entry=>entry.kind==='start_receipt')).toHaveLength(0);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR16 the public deadline settles only the exact partial replacement route once and grace receives its facts without new work',async()=>{
  const store=new Persistence('prestart-partial-deadline'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create'));
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'late-original',expected_revision:view.revision,intent:{kind:'advance',to:577000}}))).view;
    let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'before-replace',expected_revision:view.revision,intent:{kind:'advance',to:579000}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'deadline',expected_revision:view.revision,intent:{kind:'advance',to:600000}}))).view;
    expect(view).toMatchObject({finished:false,resources:{equipment_energy:11,movement_energy:20,movement_energy_reserved:2}});
    expect(view.log.filter(entry=>entry.kind==='complete_receipt')).toHaveLength(0);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'deadline-receipt',expected_revision:view.revision,intent:{kind:'advance',to:610000}}))).view;
    expect(view).toMatchObject({sim_time:601000,finished:false,paused:true,status:'deadline',position:{x:106.6,observed:600000,received:601000},resources:{hq_energy:14,hq_wear:98,equipment_energy:10,equipment_wear:94,movement_energy:19,movement_energy_reserved:0}});
    expect(view.log.filter(entry=>entry.kind==='deadline_receipt')).toHaveLength(1);expect(view.log.some(entry=>entry.kind==='fix_receipt'&&entry.observed===600000)).toBe(false);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR15 an already-sent replacement stays unknown after expiry and cleanup starts from the received N terminal, preserving unreported R fees',async()=>{
  const store=new Persistence('prestart-control-unconfirmed'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','hq_result_unconfirmed'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'old-ack',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'sent-expiry',expected_revision:view.revision,intent:{kind:'advance',to:122000}}))).view;
    expect(view).toMatchObject({finished:false,status:'terminating',resources:{hq_energy:14,equipment_energy:10,movement_energy:19}});
    expect(view.log.some(entry=>['expired','rejected_receipt'].includes(entry.kind))).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'private-deadline-not-used',expected_revision:view.revision,intent:{kind:'advance',to:141900}}))).view;
    expect(view.finished).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'public-cleanup',expected_revision:view.revision,intent:{kind:'advance',to:142900}}))).view;
    expect(view).toMatchObject({finished:true,sim_time:142900,status:'finished',resources:{equipment_energy:10,equipment_wear:94,movement_energy:19}});
    expect(view.gap).toContain('替代结果未确认');expect(view.log.some(entry=>entry.kind==='rejected_receipt')).toBe(false);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR15 no received primary terminal means no private completion-based cleanup and no unreported result or resource leakage',async()=>{
  const store=new Persistence('prestart-all-reports-unconfirmed'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','reports_unconfirmed'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'replace-time',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'still-no-public-terminal',expected_revision:view.revision,intent:{kind:'advance',to:160000}}))).view;
    expect(view).toMatchObject({finished:false,sim_time:160000,position:{x:50,observed:0},resources:{equipment_energy:16,movement_energy:20}});
    expect(view.log.some(entry=>['complete_receipt','expired'].includes(entry.kind))).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'public-limit',expected_revision:view.revision,intent:{kind:'advance',to:610000}}))).view;
    expect(view).toMatchObject({finished:false,sim_time:610000,paused:true,status:'deadline',position:{x:50,observed:0},resources:{hq_energy:14,equipment_energy:16,equipment_wear:100,movement_energy:20,movement_energy_reserved:0}});
    expect(view.gap).toContain('未确认');expect(view.log.some(entry=>entry.kind.endsWith('_receipt'))).toBe(false);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR11 headquarters may request before its start receipt even after R has begun; local refusal does not reveal that fact early',async()=>{
  const store=new Persistence('prestart-local-start-unknown'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'actual-start',expected_revision:view.revision,intent:{kind:'advance',to:6000}}))).view;
    expect(view.can_issue).toBe(true);expect(view.status).toBe('preparing');expect(view.position.observed).toBe(0);
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    expect(view.log.some(entry=>entry.kind==='rejected_receipt')).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'refusal',expected_revision:view.revision,intent:{kind:'advance',to:8000}}))).view;
    expect(view.log.find(entry=>entry.kind==='rejected_receipt')).toMatchObject({observed:7000,at:8000});
    expect(view.gap).toContain('原任务继续');expect(view).not.toHaveProperty('replacement');
  }finally{await store.delete();}
});

test('CR11 a replacement delivered exactly with original completion is judged before work effects and preserves both facts independent of IDs',async()=>{
  const store=new Persistence('prestart-completion-race'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','reports_unconfirmed'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'A-original',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'race-send-time',expected_revision:view.revision,intent:{kind:'advance',to:20900}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'Z-replacement')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'race',expected_revision:view.revision,intent:{kind:'advance',to:21900}}))).view;
    expect(view).toMatchObject({finished:false,position:{x:50},resources:{equipment_energy:16,movement_energy:20}});
    const state=legacy_state(await store.read_committed(view.run_id));
    expect(state?.prestart?.records.filter(record=>record.at===21900).map(record=>[record.command_id,record.kind])).toEqual([['Z-replacement','delivered'],['Z-replacement','rejected'],['A-original','completed']]);
    expect(state?.world).toMatchObject({completed:true,equipment_energy:9,equipment_wear:93,movement_energy:19});
    expect(state?.prestart?.activities).toHaveLength(1);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR16 a task delivered at the authority endpoint cannot start preparation or movement during receipt grace',async()=>{
  const store=new Persistence('prestart-authority-endpoint'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create'));
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'last-send-time',expected_revision:view.revision,intent:{kind:'advance',to:599000}}))).view;
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'cutoff-arrival',expected_revision:view.revision,intent:{kind:'advance',to:600000}}))).view;
    expect((legacy_state(await store.read_committed(view.run_id)))?.prestart?.activities).toHaveLength(0);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'refusal',expected_revision:view.revision,intent:{kind:'advance',to:610000}}))).view;
    expect(view).toMatchObject({sim_time:601000,status:'deadline',finished:false,resources:{hq_energy:15,equipment_energy:15,movement_energy:20,movement_energy_reserved:0}});
    expect(view.log.find(entry=>entry.kind==='rejected_receipt')?.text).toContain('授权窗口已关闭');expect(view.log.some(entry=>entry.kind==='start_receipt')).toBe(false);expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test.each([false,true])('CR15 public receipt-limit ending with original issued=%s never invents an unregistered replacement',async(issued)=>{
  const store=new Persistence(`prestart-no-replacement-${issued}`),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','reports_unconfirmed'));
    if(issued){const plan=await game.preview_plan(view.run_id,view.revision,1);view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;}
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'cutoff',expected_revision:view.revision,intent:{kind:'advance',to:600000}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'public-limit',expected_revision:view.revision,intent:{kind:'advance',to:610000}}))).view;
    expect(view.gap).not.toContain('替代');expect(view.log.some(entry=>entry.text.includes('替代结果未确认'))).toBe(false);
    expect(view).toMatchObject({finished:false,status:'deadline',position:{x:50},resources:{hq_energy:issued?15:16,equipment_energy:16,movement_energy:20}});expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
    expect(view.replay_nodes.at(-1)?.meaningful).toBe(true);
  }finally{await store.delete();}
});

test('CR15 a sent replacement visibly distinguishes its expired request window from an unknown remote acceptance',async()=>{
  const store=new Persistence('prestart-sent-window-ended'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','hq_result_unconfirmed'));let plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'replace-time',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    plan=await game.preview_plan(view.run_id,view.revision,2);view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'replacement',expected_revision:view.revision,intent:task_intent(plan,'T')}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'window-ended',expected_revision:view.revision,intent:{kind:'advance',to:122000}}))).view;
    expect(view.gap).toContain('有效期已结束');expect(view.gap).toContain('结果未确认');
    expect(view.log.some(entry=>entry.kind==='expired')).toBe(false);expect(view.resources).toMatchObject({hq_energy:14,equipment_energy:10});expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR14 a never-sent original N task keeps its own known expiry instead of inventing a replacement or an unknown acceptance',async()=>{
  const store=new Persistence('prestart-original-expiry'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(definition,'research','create','hq_expiry_outage'));
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'outage-start',expected_revision:view.revision,intent:{kind:'advance',to:2000}}))).view;
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:{kind:'issue',command_id:'N',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'expiry',expected_revision:view.revision,intent:{kind:'advance',to:122000}}))).view;
    expect(view.log.find(entry=>entry.kind==='expired')?.text).toContain('原通行请求');expect(view.gap).not.toContain('替代');
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'public-end',expected_revision:view.revision,intent:{kind:'advance',to:610000}}))).view;
    expect(view.gap).toContain('未发送且已过期');expect(view.gap).not.toContain('结果未确认');expect(view.log.some(entry=>entry.text.includes('替代结果未确认'))).toBe(false);
    expect(view).toMatchObject({finished:false,resources:{hq_energy:16,equipment_energy:16,movement_energy:20}});expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});
