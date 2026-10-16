import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';
import type {MissionDefinition} from '../src/core/mission-definition';
import type {MissionDraft} from '../src/mission-contracts';
import type {IssueMissionEnvelope} from '../src/mission-contracts';
import {valid_response} from '../src/dto';
import {createHash} from 'node:crypto';

async function issued(store:Persistence,value:MissionDefinition|typeof definition=definition,change?:(draft:MissionDraft)=>void,mode:'research'|'command'='research'){
  const game=new Game(store),initial=await game.create_run(value,mode,'create'),draft=mission_draft(initial.run_id);change?.(draft);
  const saved=await game.save_plan({run_id:initial.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}});
  const ref=<K extends string>(kind:K,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const input:IssueMissionEnvelope={run_id:initial.run_id,operation_id:'issue',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:1,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P1'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(initial.run_id,saved.view.revision,0,draft),evidence_refs:draft.evidence_refs}};
  const result=await game.issue_order(input);return {game,view:result.view,before:saved.view};
}

test.each([['unknown','U'],['known_false','F']] as const)('B22 HQ-equivalent local %s holds until6000 without auto-resuming after a lawful local update',async(kind,truth)=>{
  const variant=await mission_variant(value=>{
    Reflect.set(value.catalogs,'local_initial_evidence',{id:'R-initial-unknown',scope_ref:kind==='unknown'?'pending-location':'detached-area',observed:kind==='unknown'?{kind:'unknown'}:{kind:'known',value:0,evidence:'R-initial-unknown'},source_event_time:{kind:'unknown'},max_age_ms:900000,valid_until_time_ms:900000});
    value.catalogs.position_reports=[{id:'Q-to-R-position',origin:'Q',target:'R',scope_ref:'H',observed:{kind:'known',value:1000,evidence:'Q-to-R-position'},source_event_time:{kind:'unknown'},reported_at:1000,delivery_at:2000}];
  }),normalStore=new Persistence('b22-owned-t03-local-met'),heldStore=new Persistence('b22-owned-t03-local-unknown',[],[variant]);
  try{
    const gate=(draft:MissionDraft)=>{draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};};
    const normal=await issued(normalStore,definition,gate),held=await issued(heldStore,variant,gate);
    // Fresh Game runs have different legitimate run-bound cryptographic IDs.
    // Verify those bindings independently, then compare every public field with
    // only the run identity and its three independently verified digest fields normalized.
    const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v!==null&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,sort(x)])):v;
    const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(sort(v))).digest('hex');
    for(const [store,current] of [[normalStore,normal],[heldStore,held]] as const){
      const persisted=await store.read_committed(current.view.run_id);if(persisted?.schema!==8)throw Error('Expected mission state');
      expect(persisted.orders[0].frozen_payload_digest).toBe(digest(persisted.orders[0].frozen_payload));expect(current.view.plans[0].preview.draft_digest).toBe(digest(current.view.plans[0].draft));
      expect(current.view.decision_records[0].view_digest).toBe(digest(current.before));
    }
    const normalize=(view:unknown,run:string)=>JSON.parse(JSON.stringify(view,(key,value)=>['frozen_payload_digest','draft_digest','view_digest'].includes(key)?'VERIFIED_RUN_BOUND_DIGEST':value).replaceAll(run,'RUN'));
    expect(normalize(held.before,held.view.run_id)).toEqual(normalize(normal.before,normal.view.run_id));
    expect(normalize(held.view,held.view.run_id)).toEqual(normalize(normal.view,normal.view.run_id));
    const at1000=await held.game.control_clock({run_id:held.view.run_id,operation_id:'receive',expected_revision:held.view.revision,intent:{kind:'advance',to:1000}}),met1000=await normal.game.control_clock({run_id:normal.view.run_id,operation_id:'receive',expected_revision:normal.view.revision,intent:{kind:'advance',to:1000}});
    expect(normalize(at1000.view,held.view.run_id)).toEqual(normalize(met1000.view,normal.view.run_id));
    expect(await heldStore.read_committed(held.view.run_id)).toMatchObject({executions:[],attempts:[{status:'gate_hold',checked:1000,accept_until:6000,gate:{evaluated_by:'R',result:truth}}],reports:[{kind:'gate_hold'}],world:{resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:15}}});
    const at2000=await held.game.control_clock({run_id:held.view.run_id,operation_id:'hold-delivery',expected_revision:at1000.view.revision,intent:{kind:'advance',to:2000}});
    expect(at2000.view).toMatchObject({issued_orders:[{status:'gate_hold'}],resources:{movement_energy:20,equipment_energy:15},reports:[{kind:'gate_hold'}]});
    expect(await heldStore.read_committed(held.view.run_id)).toMatchObject({executions:[],local:{position_knowledge:{status:'known_scope',observed:{kind:'known',value:1000}}}});
    const at6000=await held.game.control_clock({run_id:held.view.run_id,operation_id:'hold-end',expected_revision:at2000.view.revision,intent:{kind:'advance',to:6000}});
    expect(at6000.view).toMatchObject({issued_orders:[{status:'gate_hold'}],reports:[{kind:'gate_hold'}]});
    expect(await heldStore.read_committed(held.view.run_id)).toMatchObject({executions:[],attempts:[{status:'not_started',terminal_at:6000}],reports:[{kind:'gate_hold'},{kind:'not_started'}],world:{resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98}},local:{position_knowledge:{status:'known_scope',observed:{kind:'known',value:6000}}}});
    const at7000=await held.game.control_clock({run_id:held.view.run_id,operation_id:'terminal-delivery',expected_revision:at6000.view.revision,intent:{kind:'advance',to:7000}});
    expect(at7000.view).toMatchObject({issued_orders:[{status:'not_started'}],held_windows:[{status:'released'}],resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98,hq_energy:15},phase_results:[]});
    expect(Reflect.get(at7000.view,'reports')).toHaveLength(2);expect(Reflect.get(at7000.view,'deliveries')).toHaveLength(2);expect(valid_response({request_id:'held',ok:true,...at7000})).toBe(true);
    const restored=await new Game(heldStore).restore(held.view.run_id,'restore-hold-terminal');expect(restored.view).toMatchObject({sim_time:7000,paused:true,resources:at7000.view.resources});
  }finally{await normalStore.delete();await heldStore.delete();}
});

test('B22 P1 settles once at30500 while HQ only confirms its matching arrival at31500',async()=>{
  const store=new Persistence('b22-owned-t03-first-arrival');
  try{
    const {game,view}=await issued(store);
    const local=await game.control_clock({run_id:view.run_id,operation_id:'actual-arrival',expected_revision:view.revision,intent:{kind:'advance',to:30500}});
    expect(local.view).toMatchObject({issued_orders:[{status:'accepted'}],resources:{movement_energy:20,movement_energy_reserved:1,equipment_energy:15},reports:[{kind:'accepted'}],phase_results:[]});
    expect(await store.read_committed(view.run_id)).toMatchObject({attempts:[{status:'arrived',terminal_at:30500}],executions:[{status:'arrived',terminal_at:30500,settled:true,settlement:{energy:1,released:0,at:30500}}],world:{resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98}}});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'arrival-delivery',expected_revision:local.view.revision,intent:{kind:'advance',to:31500}});
    expect(delivered.view).toMatchObject({finished:false,issued_orders:[{status:'arrived'}],resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14,equipment_wear:98,hq_energy:15},phase_results:[{order_ref:'mission-order-1',phase_ref:{id:'P1',version:1},verification_state:'confirmed'}],position_knowledge:{status:'known_scope',scope:{typed_geometry:{position:[150,150]}},observed:{kind:'known',value:30500}},can_issue:true});
    expect(Reflect.get(delivered.view,'reports')).toHaveLength(2);expect(Reflect.get(delivered.view,'deliveries')).toHaveLength(2);expect(valid_response({request_id:'arrived',ok:true,...delivered})).toBe(true);
    const restored=await new Game(store).restore(view.run_id,'restore-arrival');
    expect(restored.view).toMatchObject({sim_time:31500,paused:true,resources:delivered.view.resources,phase_results:Reflect.get(delivered.view,'phase_results')});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[{status:'arrived',settled:true}],reports:[{kind:'accepted'},{kind:'arrived'}]});
  }finally{await store.delete();}
});

test('B22 P1 independently accepts at1000 but HQ only receives its acceptance at2000',async()=>{
  const store=new Persistence('b22-owned-t03-first-acceptance');
  try{
    const {game,view}=await issued(store);
    const local=await game.control_clock({run_id:view.run_id,operation_id:'receive',expected_revision:view.revision,intent:{kind:'advance',to:1000}});
    expect(local.view).toMatchObject({issued_orders:[{status:'sent',execution_ref:null}],resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:16,hq_energy:15}});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[{status:'moving',starts:1000,completes:30500}],world:{resources:{movement_energy:20,movement_energy_reserved:1,equipment_energy:15,equipment_wear:99}},transmissions:[{sender:'R',at:1000,until:2000,energy:1,wear:1}]});
    const received=await game.control_clock({run_id:view.run_id,operation_id:'acceptance-delivery',expected_revision:local.view.revision,intent:{kind:'advance',to:2000}});
    expect(received.view).toMatchObject({issued_orders:[{status:'accepted'}],resources:{movement_energy:20,movement_energy_reserved:1,equipment_energy:15,equipment_wear:99,hq_energy:15},reports:[{kind:'accepted',actor:'R',position_scope:null}],deliveries:[{received:2000}]});
    expect(valid_response({request_id:'accepted',ok:true,...received})).toBe(true);
    const restored=await new Game(store).restore(view.run_id,'restore-accepted');
    expect(restored.view).toMatchObject({sim_time:2000,paused:true,issued_orders:Reflect.get(received.view,'issued_orders'),resources:received.view.resources});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[{status:'moving',starts:1000,completes:30500}],transmissions:[{sender:'R',at:1000,until:2000}]});
  }finally{await store.delete();}
});

test('B22 R independently refuses a mismatched legal start and reports it once without moving',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.actor.origin='A';}),store=new Persistence('b22-owned-t03-wrong-local-start',[],[variant]);
  try{
    const {game,view}=await issued(store,variant);
    const local=await game.control_clock({run_id:view.run_id,operation_id:'local-refusal',expected_revision:view.revision,intent:{kind:'advance',to:1000}});
    expect(local.view).toMatchObject({issued_orders:[{status:'sent'}],reports:[],resources:{equipment_energy:16,movement_energy:20}});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[],attempts:[{status:'refused',refusal_reason:'start_mismatch'}],reports:[{kind:'refused'}],world:{position:{x:{n:'150',d:'1'},y:{n:'150',d:'1'}},resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:15}}});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'refusal-delivery',expected_revision:local.view.revision,intent:{kind:'advance',to:2000}});
    expect(delivered.view).toMatchObject({issued_orders:[{status:'refused'}],reports:[{kind:'refused',refusal_reason:'start_mismatch'}],held_windows:[{status:'released'}],phase_results:[],resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:15,hq_energy:15}});
    expect(valid_response({request_id:'refused',ok:true,...delivered})).toBe(true);
    const restored=await new Game(store).restore(view.run_id,'restore-refused');expect(restored.view).toMatchObject({sim_time:2000,paused:true,resources:delivered.view.resources});
    expect(Reflect.get(restored.view,'reports')).toHaveLength(1);
  }finally{await store.delete();}
});

test('B22 an early received command waits for10000 without acceptance, motion charge or an extra report',async()=>{
  const store=new Persistence('b22-owned-t03-early-window');
  try{
    const {game,view}=await issued(store,definition,d=>{d.phases[0].earliest_start_time_ms=10000;d.phases[0].latest_finish_time_ms=100000;});
    const waiting=await game.control_clock({run_id:view.run_id,operation_id:'waiting-before-start',expected_revision:view.revision,intent:{kind:'advance',to:9999}});
    expect(waiting.view).toMatchObject({issued_orders:[{status:'sent'}],reports:[],resources:{equipment_energy:16,movement_energy:20}});
    expect(await store.read_committed(view.run_id)).toMatchObject({attempts:[{status:'waiting_window',received:1000,checked:null}],executions:[],reports:[],world:{resources:{equipment_energy:16,movement_energy:20,movement_energy_reserved:0}}});
    const start=await game.control_clock({run_id:view.run_id,operation_id:'window-start',expected_revision:waiting.view.revision,intent:{kind:'advance',to:10000}});
    expect(start.view).toMatchObject({issued_orders:[{status:'sent'}],reports:[]});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[{starts:10000,completes:39500}],reports:[{kind:'accepted'}],world:{resources:{equipment_energy:15,movement_energy:20,movement_energy_reserved:1}}});
    const delivery=await game.control_clock({run_id:view.run_id,operation_id:'waiting-acceptance-delivery',expected_revision:start.view.revision,intent:{kind:'advance',to:11000}});
    expect(delivery.view).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted'}]});expect(Reflect.get(delivery.view,'reports')).toHaveLength(1);
    expect(valid_response({request_id:'early',ok:true,...delivery})).toBe(true);
  }finally{await store.delete();}
});

test.each([[500,'accepted',1500],[501,'refused',1501],[1000,'refused',2000]] as const)('B22 actual command delay%i independently checks the exact latest31000 boundary: %s',async(delay,status,at)=>{
  const variant=await mission_variant(value=>{
    Reflect.set(value.catalogs,'local_conditions',{command_delivery_delay_ms:delay});Reflect.set(value.profile.parameters,'command_delivery_delay_ms',delay);
    value.profile.registry.push({...value.profile.registry.find(p=>p.id==='link_ms')!,id:'command_delivery_delay_ms',value:delay,source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG22'});
  }),store=new Persistence('b22-owned-t03-late-'+delay,[],[variant]);
  try{
    const {game,view}=await issued(store,variant),result=await game.control_clock({run_id:view.run_id,operation_id:'real-receive',expected_revision:view.revision,intent:{kind:'advance',to:at}}),persisted=await store.read_committed(view.run_id);
    expect(result.view).toMatchObject({issued_orders:[{status:'sent'}],reports:[]});
    expect(persisted).toMatchObject({attempts:[{received:at,checked:at,status}],reports:[{kind:status}]});
    if(status==='accepted')expect(persisted).toMatchObject({executions:[{starts:1500,completes:31000}],world:{resources:{movement_energy_reserved:1}}});
    else expect(persisted).toMatchObject({executions:[],attempts:[{refusal_reason:'window_closed'}],world:{resources:{movement_energy_reserved:0}}});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'real-receipt',expected_revision:result.view.revision,intent:{kind:'advance',to:at+1000}});
    expect(delivered.view).toMatchObject({issued_orders:[{status}],reports:[{kind:status}]});expect(valid_response({request_id:'window',ok:true,...delivered})).toBe(true);
  }finally{await store.delete();}
});

test('B22 an arrival original survives exhausted LINK without a free retry or HQ confirmation',async()=>{
  const variant=await mission_variant(value=>{value.profile.parameters.equipment_energy=1;}),store=new Persistence('b22-owned-t03-unsent-arrival',[],[variant]);
  try{
    const {game,view}=await issued(store,variant),arrived=await game.control_clock({run_id:view.run_id,operation_id:'arrival-with-empty-link',expected_revision:view.revision,intent:{kind:'advance',to:31500}});
    expect(arrived.view).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted'}],phase_results:[],resources:{equipment_energy:0,movement_energy:20,movement_energy_reserved:1}});
    const before=await store.read_committed(view.run_id);
    expect(before).toMatchObject({executions:[{status:'arrived',settled:true}],reports:[{kind:'accepted'},{kind:'arrived',reported:{kind:'unknown'}}],world:{resources:{equipment_energy:0,equipment_wear:99,movement_energy:19,movement_energy_reserved:0}}});
    expect(Reflect.get(before!,'transmissions')).toHaveLength(1);
    const later=await game.control_clock({run_id:view.run_id,operation_id:'no-auto-report-retry',expected_revision:arrived.view.revision,intent:{kind:'advance',to:40000}}),after=await store.read_committed(view.run_id);
    expect(Reflect.get(after!,'reports')).toEqual(Reflect.get(before!,'reports'));expect(Reflect.get(after!,'transmissions')).toEqual(Reflect.get(before!,'transmissions'));
    expect(later.view).toMatchObject({issued_orders:[{status:'accepted'}],phase_results:[],reports:[{kind:'accepted'}]});
    const restored=await new Game(store).restore(view.run_id,'restore-unsent');expect(restored.view).toMatchObject({sim_time:40000,paused:true,phase_results:[]});expect(Reflect.get((await store.read_committed(view.run_id))!,'reports')).toEqual(Reflect.get(before!,'reports'));
  }finally{await store.delete();}
});

test.each([0,2])('B22 %i extra HQ saves cannot change R knowledge revision2 at its first command check',async(extra)=>{
  const store=new Persistence('b22-owned-t03-local-revision-'+extra);
  try{
    const {game,view}=await issued(store);let revision=view.revision;
    for(let i=0;i<extra;i++)revision=(await game.save({run_id:view.run_id,operation_id:'hq-save-'+i,expected_revision:revision,intent:{kind:'save'}})).view.revision;
    const result=await game.control_clock({run_id:view.run_id,operation_id:'local-check-delivered',expected_revision:revision,intent:{kind:'advance',to:2000}});
    expect(result.view).toMatchObject({reports:[{kind:'accepted',local_gate:{evaluated_by:'R',knowledge_revision:2,evaluated_at_time_ms:1000}}]});
  }finally{await store.delete();}
});

test('B22 adjacent held windows allow the second order and queue its refusal behind the first terminal send',async()=>{
  const store=new Persistence('b22-owned-t03-serial-link');
  try{
    const {game,view}=await issued(store,definition,d=>{d.phases[1].dependencies=[];d.phases[1].earliest_start_time_ms=31000;d.phases[1].latest_finish_time_ms=61000;d.routes[1].path=[[50,150],[150,150]];});
    const at1000=await game.control_clock({run_id:view.run_id,operation_id:'first-receive',expected_revision:view.revision,intent:{kind:'advance',to:1000}});
    if(at1000.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const plan=at1000.view.plans[0],ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const second=await game.issue_order({run_id:view.run_id,operation_id:'second-order',expected_revision:at1000.view.revision,intent:{kind:'issue_mission',expected_object_revision:at1000.view.mission!.object_revision,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P2'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(view.run_id,at1000.view.revision,1,plan.draft),evidence_refs:plan.draft.evidence_refs}});
    expect(second.view.held_windows).toMatchObject([{from:1000,to:31000},{from:31000,to:61000}]);
    const busy=await game.control_clock({run_id:view.run_id,operation_id:'terminal-link-busy',expected_revision:second.view.revision,intent:{kind:'advance',to:31000}}),before=await store.read_committed(view.run_id);
    expect(busy.view).toMatchObject({issued_orders:[{status:'accepted'},{status:'sent'}]});
    expect(before).toMatchObject({reports:[{kind:'accepted'},{kind:'arrived'},{kind:'refused',reported:{kind:'unknown'}}],pending_reports:[{report_ref:'mission-order-2-refused',at:31500}],world:{resources:{equipment_energy:14}}});
    expect(Reflect.get(before!,'transmissions')).toHaveLength(2);
    const sent=await game.control_clock({run_id:view.run_id,operation_id:'terminal-link-free',expected_revision:busy.view.revision,intent:{kind:'advance',to:31500}}),after=await store.read_committed(view.run_id);
    expect(after).toMatchObject({pending_reports:[],transmissions:[{at:1000,until:2000},{at:30500,until:31500},{at:31500,until:32500}],world:{resources:{equipment_energy:13,equipment_wear:97}}});
    expect(Reflect.get(after!,'reports')).toEqual(Reflect.get(before!,'reports'));
    expect(sent.view).toMatchObject({issued_orders:[{status:'arrived'},{status:'sent'}]});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'serial-refusal-delivery',expected_revision:sent.view.revision,intent:{kind:'advance',to:32500}});
    expect(delivered.view).toMatchObject({issued_orders:[{status:'arrived'},{status:'refused'}]});expect(Reflect.get(delivered.view,'reports')).toHaveLength(3);expect(valid_response({request_id:'serial',ok:true,...delivered})).toBe(true);
  }finally{await store.delete();}
});

test('B22 a fresh local phase has no invented confirmation merely because it has no dependency',async()=>{
  const store=new Persistence('b22-owned-t03-current-phase-proof');
  try{
    const {game,view}=await issued(store,definition,d=>{d.phases[0].entry_gate={kind:'compare',field_ref:'phase.confirmed',operator:'eq',typed_value:false};});
    const result=await game.control_clock({run_id:view.run_id,operation_id:'current-local-phase',expected_revision:view.revision,intent:{kind:'advance',to:2000}});
    expect(result.view).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted',local_gate:{evaluated_by:'R',result:'T',conditions:[{condition:{field_ref:'phase.confirmed',typed_value:false},result:'T',evidence_refs:[]}]}}]});
  }finally{await store.delete();}
});

test('B22 a registered slowdown after acceptance cuts motion off at31000 and settles its actual distance once',async()=>{
  const variant=await mission_variant(value=>{
    Reflect.set(value.catalogs,'movement_changes',[{id:'slower',at:25000,time_factor:2}]);
    for(const [id,amount,unit] of [['slower-at',25000,'ms'],['slower-factor',2,'ratio']] as const){Reflect.set(value.profile.parameters,id,amount);value.profile.registry.push({...value.profile.registry[0],id,value:amount,unit,source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});}
  }),store=new Persistence('b22-owned-t03-cutoff-window',[],[variant]);
  try{
    const {game,view}=await issued(store,variant),before=await game.control_clock({run_id:view.run_id,operation_id:'before-cutoff',expected_revision:view.revision,intent:{kind:'advance',to:30999}});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[{status:'moving',completes:36000}],world:{resources:{movement_energy:20,movement_energy_reserved:1}}});
    const restored=await new Game(store).restore(view.run_id,'restore-before-cutoff');expect(restored.view).toMatchObject({sim_time:30999,paused:true,resources:before.view.resources});
    const fresh=new Game(store),cutoff=await fresh.control_clock({run_id:view.run_id,operation_id:'phase-cutoff',expected_revision:restored.view.revision,intent:{kind:'advance',to:31000}}),actual=await store.read_committed(view.run_id);
    expect(cutoff.view).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted'}],phase_results:[]});
    // 24000 nominal ms before slowdown +6000/2 =27000; x=50+100*27000/29500=8350/59.
    expect(actual).toMatchObject({executions:[{status:'cutoff',terminal_at:31000,settled:true,settlement:{energy:1,released:0,at:31000}}],world:{position:{x:{n:'8350',d:'59'},y:{n:'150',d:'1'}},resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14}},reports:[{kind:'accepted'},{kind:'cutoff',observed:{kind:'known',value:31000}}]});
    const delivered=await fresh.control_clock({run_id:view.run_id,operation_id:'cutoff-delivery',expected_revision:cutoff.view.revision,intent:{kind:'advance',to:40000}}),later=await store.read_committed(view.run_id);
    expect(delivered.view).toMatchObject({finished:false,issued_orders:[{status:'cutoff'}],phase_results:[],resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14}});
    expect(Reflect.get(later!,'world')).toEqual(Reflect.get(actual!,'world'));expect(Reflect.get(later!,'reports')).toEqual(Reflect.get(actual!,'reports'));expect(valid_response({request_id:'cutoff',ok:true,...delivered})).toBe(true);
  }finally{await store.delete();}
});

test('B22 actual discovery blocks at100, spends1 and releases1 of a200-metre movement reservation',async()=>{
  const variant=await mission_variant(value=>{
    Reflect.set(value.catalogs,'movement_obstacles',[{id:'closure',closed_at_x:100}]);Reflect.set(value.profile.parameters,'closure-x',100);
    value.profile.registry.push({...value.profile.registry[0],id:'closure-x',value:100,unit:'fictional_metre',source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});
  }),store=new Persistence('b22-owned-t03-blocked-reservation',[],[variant]);
  try{
    const {game,view}=await issued(store,variant,d=>{d.routes[0].path=[[50,150],[150,150],[250,150]];d.phases[0].latest_finish_time_ms=61000;});
    const stopped=await game.control_clock({run_id:view.run_id,operation_id:'actual-discovery',expected_revision:view.revision,intent:{kind:'advance',to:15750}}),actual=await store.read_committed(view.run_id);
    expect(stopped.view).toMatchObject({issued_orders:[{status:'accepted'}],reports:[{kind:'accepted'}],phase_results:[],resources:{movement_energy:20,movement_energy_reserved:2}});
    expect(actual).toMatchObject({executions:[{status:'blocked',terminal_at:15750,settled:true,settlement:{energy:1,released:1,at:15750}}],world:{position:{x:{n:'100',d:'1'},y:{n:'150',d:'1'}},resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14}},reports:[{kind:'accepted'},{kind:'blocked'}]});
    const later=await game.control_clock({run_id:view.run_id,operation_id:'after-old-completion',expected_revision:stopped.view.revision,intent:{kind:'advance',to:70000}}),after=await store.read_committed(view.run_id);
    expect(later.view).toMatchObject({issued_orders:[{status:'blocked'}],phase_results:[],resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14}});
    expect(Reflect.get(after!,'world')).toEqual(Reflect.get(actual!,'world'));expect(Reflect.get(after!,'reports')).toEqual(Reflect.get(actual!,'reports'));expect(Reflect.get(after!,'reports')).toHaveLength(2);expect(valid_response({request_id:'blocked',ok:true,...later})).toBe(true);
  }finally{await store.delete();}
});

test.each([[false,'arrived',1],[true,'blocked',0]] as const)('B22 exact arrival30500 with boundary obstacle=%s yields only %s, never an extra cutoff',async(obstacle,status,confirmed)=>{
  const variant=await mission_variant(value=>{
    if(obstacle){Reflect.set(value.catalogs,'movement_obstacles',[{id:'end-closure',closed_at_x:150}]);Reflect.set(value.profile.parameters,'end-closure-x',150);value.profile.registry.push({...value.profile.registry[0],id:'end-closure-x',value:150,unit:'fictional_metre',source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});}
  }),store=new Persistence('b22-owned-t03-terminal-tie-'+obstacle,[],[variant]);
  try{
    const {game,view}=await issued(store,variant,d=>{d.phases[0].latest_finish_time_ms=30500;}),result=await game.control_clock({run_id:view.run_id,operation_id:'terminal-tie',expected_revision:view.revision,intent:{kind:'advance',to:31500}}),actual=await store.read_committed(view.run_id);
    expect(actual).toMatchObject({executions:[{status,terminal_at:30500,settled:true}],reports:[{kind:'accepted'},{kind:status}],world:{resources:{movement_energy:19,movement_energy_reserved:0}}});
    expect(Reflect.get(actual!,'reports')).toHaveLength(2);expect(Reflect.get(result.view,'phase_results')).toHaveLength(confirmed);expect(result.view).toMatchObject({issued_orders:[{status}]});expect(valid_response({request_id:'tie',ok:true,...result})).toBe(true);
  }finally{await store.delete();}
});

test('B22 command clock seals paused at910000 without claiming full completion or accepting continue',async()=>{
  const store=new Persistence('b22-owned-t03-clock-seal');
  try{
    const {game,view}=await issued(store,definition,undefined,'command'),sealed=await game.tick(view.run_id,910000,'seal-window');
    expect(sealed.view).toMatchObject({sim_time:910000,paused:true,finished:false});expect(await store.read_committed(view.run_id)).toMatchObject({ended:true,paused:true,executions:[{status:'arrived'}]});
    await expect(game.control_clock({run_id:view.run_id,operation_id:'continue-sealed',expected_revision:sealed.view.revision,intent:{kind:'continue'}})).rejects.toThrow('RUN_ENDED');
    expect(await game.get_view(view.run_id)).toEqual(sealed.view);expect(Reflect.get(sealed.view,'reports')).toHaveLength(2);
  }finally{await store.delete();}
});

test('B22 only a legally delivered not_started permits a new phase version and a fresh retry order',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.local_initial_evidence={id:'R-retry-unknown',scope_ref:'pending-location',observed:{kind:'unknown'},source_event_time:{kind:'unknown'},max_age_ms:900000,valid_until_time_ms:900000};}),store=new Persistence('b22-owned-t03-legal-retry',[],[variant]);
  try{
    const {game,view}=await issued(store,variant,d=>{d.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};});
    const closed=await game.control_clock({run_id:view.run_id,operation_id:'privately-not-started',expected_revision:view.revision,intent:{kind:'advance',to:6000}});
    if(closed.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const draft=structuredClone(view.plans[0].draft);draft.phases[0].version=2;draft.phases[0].activity.route_ref.version=2;draft.routes[0].version=2;draft.phases[0].earliest_start_time_ms=8000;draft.phases[0].latest_finish_time_ms=38000;draft.phases[1].version=2;draft.phases[1].dependencies[0].version=2;
    await expect(game.save_plan({run_id:view.run_id,operation_id:'premature-retry',expected_revision:closed.view.revision,intent:{kind:'save_plan',base_plan_ref:closed.view.mission!.current_plan_ref,expected_object_revision:closed.view.mission!.object_revision,draft}})).rejects.toThrow('STATE_CONFIRMATION_REQUIRED');
    expect(await game.get_view(view.run_id)).toEqual(closed.view);
    const terminal=await game.control_clock({run_id:view.run_id,operation_id:'known-not-started',expected_revision:closed.view.revision,intent:{kind:'advance',to:7000}}),old=await store.read_committed(view.run_id);
    if(terminal.view.scenario_kind!=='play_mission'||old?.schema!==8)throw Error('Expected mission state');
    draft.evidence_refs=['mission-order-1-not_started'];
    const saved=await game.save_plan({run_id:view.run_id,operation_id:'save-retry',expected_revision:terminal.view.revision,intent:{kind:'save_plan',base_plan_ref:terminal.view.mission!.current_plan_ref,expected_object_revision:terminal.view.mission!.object_revision,draft}});
    expect(saved.view).toMatchObject({can_issue:true,mission:{current_plan_ref:{version:2}}});
    const ref=<K extends string>(kind:K,id:string,version=1)=>({run_id:view.run_id,kind,id,version});
    const retry=await game.issue_order({run_id:view.run_id,operation_id:'issue-retry',expected_revision:saved.view.revision,intent:{kind:'issue_mission',expected_object_revision:saved.view.mission!.object_revision,plan_ref:ref('plan','plan-M1',2),phase_ref:ref('phase','P1',2),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(view.run_id,saved.view.revision,1,draft),evidence_refs:draft.evidence_refs}});
    expect(retry.view).toMatchObject({issued_orders:[{status:'not_started',phase_ref:{version:1}},{status:'sent',phase_ref:{version:2},hq_gate:{result:'T',evidence_refs:['mission-order-1-not_started']}}]});
    const arrived=await game.control_clock({run_id:view.run_id,operation_id:'retry-arrival',expected_revision:retry.view.revision,intent:{kind:'advance',to:38500}}),after=await store.read_committed(view.run_id);
    expect(arrived.view).toMatchObject({issued_orders:[{status:'not_started'},{status:'arrived'}],phase_results:[{phase_ref:{id:'P1',version:2},plan_ref:{version:2}}],resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:12,equipment_wear:96,hq_energy:14,hq_wear:98}});
    if(after?.schema!==8)throw Error('Expected mission state');expect(after.orders[0]).toEqual(old.orders[0]);expect(after.reports.slice(0,2)).toEqual(old.reports);expect(after.plans[0]).toEqual(old.plans[0]);expect(after.orders).toHaveLength(2);expect(after.reports).toHaveLength(4);
    expect(valid_response({request_id:'retry',ok:true,...arrived})).toBe(true);
  }finally{await store.delete();}
});

test('B22 R legal inventory can refuse missing movement stock while HQ initially knows20',async()=>{
  const variant=await mission_variant(value=>{
    Reflect.set(value.catalogs,'local_resources',{movement_energy:0,equipment_energy:16,equipment_wear:100});
    for(const [id,amount,unit] of [['R-local-movement-energy',0,'energy'],['R-local-equipment-energy',16,'energy'],['R-local-equipment-wear',100,'wear']] as const){Reflect.set(value.profile.parameters,id,amount);value.profile.registry.push({...value.profile.registry[0],id,value:amount,unit,source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});}
  }),store=new Persistence('b22-owned-t03-local-stock',[],[variant]);
  try{
    const {game,view}=await issued(store,variant),local=await game.control_clock({run_id:view.run_id,operation_id:'local-inventory-check',expected_revision:view.revision,intent:{kind:'advance',to:1000}});
    expect(local.view).toMatchObject({issued_orders:[{status:'sent'}],resources:{movement_energy:20,equipment_energy:16},reports:[]});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[],attempts:[{status:'refused',refusal_reason:'insufficient_movement_energy'}],world:{resources:{movement_energy:0,movement_energy_reserved:0,equipment_energy:15}},local:{resources:{movement_energy:0,movement_energy_reserved:0,equipment_energy:15}}});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'local-stock-receipt',expected_revision:local.view.revision,intent:{kind:'advance',to:2000}});
    expect(delivered.view).toMatchObject({issued_orders:[{status:'refused'}],resources:{movement_energy:0,equipment_energy:15,movement_energy_reserved:0},reports:[{refusal_reason:'insufficient_movement_energy'}]});expect(valid_response({request_id:'inventory',ok:true,...delivered})).toBe(true);
  }finally{await store.delete();}
});

test.each([['R:move',2000,'refused',2000],['R:move',1000,'accepted',2000],['R:link',2000,'accepted',3000]] as const)('B22 private %s booking until%i changes only its own local capacity before the real receipt',async(capability,to,status,receiptAt)=>{
  const variant=await mission_variant(value=>{
    Reflect.set(value.catalogs,'local_reservations',[{id:'local-booking',capability_ref:capability,from:500,to}]);
    for(const [id,amount] of [['local-booking-from',500],['local-booking-to',to]] as const){Reflect.set(value.profile.parameters,id,amount);value.profile.registry.push({...value.profile.registry[0],id,value:amount,unit:'ms',source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG21-PG23'});}
  }),store=new Persistence('b22-owned-t03-capacity-'+capability+to,[],[variant]);
  try{
    const {game,view}=await issued(store,variant),local=await game.control_clock({run_id:view.run_id,operation_id:'local-capacity-check',expected_revision:view.revision,intent:{kind:'advance',to:1000}});
    expect(local.view).toMatchObject({issued_orders:[{status:'sent'}],reports:[],resources:{movement_energy:20,equipment_energy:16}});
    if(status==='refused')expect(await store.read_committed(view.run_id)).toMatchObject({executions:[],attempts:[{status:'refused',refusal_reason:'capacity_conflict'}]});
    else expect(await store.read_committed(view.run_id)).toMatchObject({executions:[{status:'moving',starts:1000,completes:30500}]});
    if(capability==='R:link')expect(await store.read_committed(view.run_id)).toMatchObject({pending_reports:[{at:2000}],transmissions:[],world:{resources:{equipment_energy:16}}});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'capacity-receipt',expected_revision:local.view.revision,intent:{kind:'advance',to:receiptAt}});
    expect(delivered.view).toMatchObject({issued_orders:[{status}],reports:[{kind:status}]});expect(valid_response({request_id:'capacity',ok:true,...delivered})).toBe(true);
    if(capability==='R:link')expect(await store.read_committed(view.run_id)).toMatchObject({transmissions:[{at:2000,until:3000}],world:{resources:{equipment_energy:15}}});
  }finally{await store.delete();}
});

test.each(['unknown_observed','expired_at_window'] as const)('B22 implicit exact-start evidence %s is independently rechecked when the declared gate passes',async(kind)=>{
  const age=kind==='expired_at_window'?5000:900000,at=kind==='expired_at_window'?10000:1000;
  const variant=await mission_variant(value=>{
    value.profile.parameters.position_max_age_ms=age;value.catalogs.initial_evidence.max_age_ms=age;
    value.catalogs.local_initial_evidence={id:'R-undated-start',scope_ref:'H',observed:kind==='unknown_observed'?{kind:'unknown'}:{kind:'known',value:0,evidence:'R-undated-start'},source_event_time:{kind:'unknown'},max_age_ms:age,valid_until_time_ms:900000};
  }),store=new Persistence('b22-owned-t03-start-freshness-'+kind,[],[variant]);
  try{
    const {game,view}=await issued(store,variant,d=>{if(kind==='expired_at_window'){d.phases[0].earliest_start_time_ms=10000;d.phases[0].latest_finish_time_ms=40000;}}),checked=await game.control_clock({run_id:view.run_id,operation_id:'start-evidence-check',expected_revision:view.revision,intent:{kind:'advance',to:at}});
    expect(checked.view).toMatchObject({issued_orders:[{status:'sent'}],reports:[]});
    expect(await store.read_committed(view.run_id)).toMatchObject({executions:[],attempts:[{status:'refused',refusal_reason:'start_unconfirmed',gate:{result:'T'}}],world:{resources:{movement_energy:20,movement_energy_reserved:0,equipment_energy:15}}});
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'start-refusal-receipt',expected_revision:checked.view.revision,intent:{kind:'advance',to:at+1000}});expect(delivered.view).toMatchObject({issued_orders:[{status:'refused'}],reports:[{refusal_reason:'start_unconfirmed'}],phase_results:[]});expect(valid_response({request_id:'start-age',ok:true,...delivered})).toBe(true);
  }finally{await store.delete();}
});

test('B22 a public same-capability overlap of1ms rejects before registering a second order',async()=>{
  const store=new Persistence('b22-owned-t03-one-ms-overlap');
  try{
    const {game,view}=await issued(store,definition,d=>{d.phases[1].dependencies=[];d.phases[1].earliest_start_time_ms=30999;d.phases[1].latest_finish_time_ms=61000;d.routes[1].path=[[50,150],[150,150]];});
    if(view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    const plan=view.plans[0],ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1}),before=await store.read_committed(view.run_id);
    const preview=await game.preview_plan(view.run_id,view.revision,1,plan.draft);
    expect(await store.read_committed(view.run_id)).toEqual(before);
    await expect(game.issue_order({run_id:view.run_id,operation_id:'overlap-order',expected_revision:view.revision,intent:{kind:'issue_mission',expected_object_revision:view.mission!.object_revision,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P2'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview,evidence_refs:plan.draft.evidence_refs}})).rejects.toThrow('CAPACITY_CONFLICT');
    expect(await store.read_committed(view.run_id)).toEqual(before);expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each(['arrived','cutoff'] as const)('B22 global900000 boundary %s settles once and only its real receipt enters grace',async(terminal)=>{
  const variant=terminal==='cutoff'?await mission_variant(value=>{
    value.catalogs.movement_changes=[{id:'late-slowdown',at:890000,time_factor:2}];
    for(const [id,amount,unit] of [['late-slowdown-at',890000,'ms'],['late-slowdown-factor',2,'ratio']] as const){Reflect.set(value.profile.parameters,id,amount);value.profile.registry.push({...value.profile.registry[0],id,value:amount,unit,source_ref:'B22-MISSION-DESIGN-1.0.0/acceptance/PG26'});}
  }):definition,store=new Persistence('b22-owned-t03-global-'+terminal,[],terminal==='cutoff'?[variant as MissionDefinition]:[]);
  try{
    const {game,view}=await issued(store,variant,d=>{d.phases=d.phases.slice(0,1);d.routes=d.routes.slice(0,1);d.phases[0].earliest_start_time_ms=870500;d.phases[0].latest_finish_time_ms=900000;if(d.objective.success_expr.kind==='compare')d.objective.success_expr.typed_value='A';});
    const before=await game.control_clock({run_id:view.run_id,operation_id:'before-global-boundary',expected_revision:view.revision,intent:{kind:'advance',to:899999}});
    expect(before.view).toMatchObject({issued_orders:[{status:'accepted'}],phase_results:[],resources:{movement_energy:20,movement_energy_reserved:1,equipment_energy:15}});
    const restored=await game.restore(view.run_id,'global-restore');expect(restored.view).toMatchObject({sim_time:899999,paused:true});
    const local=await game.control_clock({run_id:view.run_id,operation_id:'at-global-boundary',expected_revision:restored.view.revision,intent:{kind:'advance',to:900000}});
    expect(local.view).toMatchObject({issued_orders:[{status:'accepted'}],phase_results:[],mission:{status:'active'}});
    const state=await store.read_committed(view.run_id);expect(state).toMatchObject({executions:[{status:terminal,terminal_at:900000,settled:true,settlement:{energy:1,at:900000}}],world:{resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14}},reports:[{kind:'accepted'},{kind:terminal}]});
    if(terminal==='cutoff')expect(state).toMatchObject({world:{position:{x:{n:'7850',d:'59'},y:{n:'150',d:'1'}}}});
    const received=await game.control_clock({run_id:view.run_id,operation_id:'global-grace-receipt',expected_revision:local.view.revision,intent:{kind:'advance',to:901000}});
    expect(received.view).toMatchObject({issued_orders:[{status:terminal}],mission:{status:terminal==='arrived'?'completed':'active'},finished:false,resources:{movement_energy:19,movement_energy_reserved:0,equipment_energy:14}});
    expect(Reflect.get(received.view,'phase_results')).toHaveLength(terminal==='arrived'?1:0);expect(valid_response({request_id:'global-receipt',ok:true,...received})).toBe(true);
    const sealed=await game.control_clock({run_id:view.run_id,operation_id:'global-grace-seal',expected_revision:received.view.revision,intent:{kind:'advance',to:910000}}),after=await store.read_committed(view.run_id);
    expect(sealed.view).toMatchObject({sim_time:910000,paused:true,finished:false});expect(Reflect.get(after!,'executions')).toEqual(Reflect.get(state!,'executions'));expect(Reflect.get(after!,'reports')).toEqual(Reflect.get(state!,'reports'));expect(Reflect.get(after!,'transmissions')).toHaveLength(2);
  }finally{await store.delete();}
});

test('B22 a known local inventory refusal takes priority over an unknown declared gate',async()=>{
  const variant=await mission_variant(value=>{
    value.catalogs.local_initial_evidence={id:'R-unknown-stock-gate',scope_ref:'pending-location',observed:{kind:'unknown'},source_event_time:{kind:'unknown'},max_age_ms:900000,valid_until_time_ms:900000};
    value.catalogs.local_resources={movement_energy:0,equipment_energy:16,equipment_wear:100};
    for(const [id,amount,unit] of [['R-local-movement-energy',0,'energy'],['R-local-equipment-energy',16,'energy'],['R-local-equipment-wear',100,'wear']] as const){Reflect.set(value.profile.parameters,id,amount);value.profile.registry.push({...value.profile.registry[0],id,value:amount,unit,source_ref:'B22-MISSION-DESIGN-1.0.0/mission-contract'});}
  }),store=new Persistence('b22-owned-t03-hard-refusal-before-hold',[],[variant]);
  try{
    const {game,view}=await issued(store,variant,d=>{d.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};}),checked=await game.control_clock({run_id:view.run_id,operation_id:'known-stock-refusal',expected_revision:view.revision,intent:{kind:'advance',to:7000}});
    expect(checked.view).toMatchObject({issued_orders:[{status:'refused'}],reports:[{kind:'refused',refusal_reason:'insufficient_movement_energy',local_gate:{result:'U'}}]});
    expect(Reflect.get(checked.view,'reports')).toHaveLength(1);expect(await store.read_committed(view.run_id)).toMatchObject({executions:[],attempts:[{status:'refused'}],world:{resources:{movement_energy:0,movement_energy_reserved:0,equipment_energy:15}}});
  }finally{await store.delete();}
});

test('B22 two-phase legal goal confirmation waits until63500 and keeps full-run finishedfalse',async()=>{
  const store=new Persistence('b22-owned-t03-two-phase-goal');
  try{
    const {game,view}=await issued(store),first=await game.control_clock({run_id:view.run_id,operation_id:'first-goal-receipt',expected_revision:view.revision,intent:{kind:'advance',to:31500}}),ready=await game.control_clock({run_id:view.run_id,operation_id:'second-issue-time',expected_revision:first.view.revision,intent:{kind:'advance',to:32000}});
    if(ready.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(ready.view).toMatchObject({mission:{status:'active'},can_issue:true});
    const plan=ready.view.plans[0],ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1}),second=await game.issue_order({run_id:view.run_id,operation_id:'issue-P2',expected_revision:ready.view.revision,intent:{kind:'issue_mission',expected_object_revision:ready.view.mission!.object_revision,plan_ref:ref('plan','plan-M1'),phase_ref:ref('phase','P2'),grant_ref:ref('authority','B22-STATIC-GRANT'),preview:await game.preview_plan(view.run_id,ready.view.revision,1,plan.draft),evidence_refs:plan.draft.evidence_refs}});
    const physical=await game.control_clock({run_id:view.run_id,operation_id:'second-physical-arrival',expected_revision:second.view.revision,intent:{kind:'advance',to:62500}});
    expect(physical.view).toMatchObject({mission:{status:'active'},issued_orders:[{status:'arrived'},{status:'accepted'}],resources:{movement_energy:19,movement_energy_reserved:1,equipment_energy:13},phase_results:[{phase_ref:{id:'P1'}}]});
    expect(await store.read_committed(view.run_id)).toMatchObject({actual_mission_status:'assessing',world:{position:{x:{n:'250',d:'1'},y:{n:'150',d:'1'}},resources:{movement_energy:18,movement_energy_reserved:0,equipment_energy:12}}});
    const confirmed=await game.control_clock({run_id:view.run_id,operation_id:'second-goal-receipt',expected_revision:physical.view.revision,intent:{kind:'advance',to:63500}});
    expect(confirmed.view).toMatchObject({status:'completed',mission:{status:'completed'},gap:'移动目标已确认',can_issue:false,finished:false,resources:{movement_energy:18,movement_energy_reserved:0,equipment_energy:12,equipment_wear:96,hq_energy:14,hq_wear:98}});
    expect(Reflect.get(confirmed.view,'phase_results')).toHaveLength(2);expect(Reflect.get(confirmed.view,'reports')).toHaveLength(4);expect(Reflect.get(confirmed.view,'deliveries')).toHaveLength(4);expect(Reflect.get(confirmed.view,'issued_orders')).toHaveLength(2);expect(valid_response({request_id:'goal',ok:true,...confirmed})).toBe(true);
    const history=await game.get_replay(view.run_id,62500,physical.view.revision);expect(await history.get_view(view.run_id)).toMatchObject({mission:{status:'active'},issued_orders:[{status:'arrived'},{status:'accepted'}]});
    expect(await store.read_committed(view.run_id)).toMatchObject({actual_mission_status:'completed'});
  }finally{await store.delete();}
});
