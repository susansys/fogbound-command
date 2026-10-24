import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import type {GamePlayerView} from '../src/play-contracts';

test('KA-E05 a private mid-work gate change has no HQ effect until its real failure Delivery',async()=>{
  const normalStore=new Persistence('ka-owned-gate-normal-'+crypto.randomUUID()),gatedStore=new Persistence('ka-owned-gate-private-'+crypto.randomUUID());
  const normalGame=new Game(normalStore),gatedGame=new Game(gatedStore,{knowledge_collection_gate_profile:'unknown_mid'});
  try{
    let normal:GamePlayerView,gated:GamePlayerView;
    const random=vi.spyOn(crypto,'randomUUID').mockReturnValue('33333333-3333-4333-8333-333333333333');
    try{const selector={schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}};normal=await normalGame.create_run(selector,'research','create');gated=await gatedGame.create_run(selector,'research','create');}finally{random.mockRestore();}
    const ref=(kind:string,id:string)=>({run_id:normal.run_id,kind,id,version:1});
    const envelope={run_id:normal.run_id,operation_id:'collect',expected_revision:normal.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    normal=(await normalGame.apply_collection_intent(envelope)).view;gated=(await gatedGame.apply_collection_intent(envelope)).view;expect(gated).toEqual(normal);
    for(const to of [1000,2000,14999,15000,16000]){
      const control={run_id:normal.run_id,operation_id:'at-'+to,expected_revision:normal.revision,intent:{kind:'advance' as const,to}};
      normal=(await new Game(normalStore).control_clock(control)).view;gated=(await new Game(gatedStore).control_clock(control)).view;expect(gated).toEqual(normal);
    }
    gated=(await new Game(gatedStore).control_clock({run_id:gated.run_id,operation_id:'failure-delivery',expected_revision:gated.revision,intent:{kind:'advance',to:17000}})).view;
    expect(gated).toMatchObject({reports:[{body:{kind:'collection_failed',reason:'local_gate_unknown'},observed_time:{kind:'unknown'}}],deliveries:[{received_at:17000}]});
  }finally{await normalStore.delete();await gatedStore.delete();}
});

test.each(['unknown_before_completion','unknown_at_completion','unknown_after_completion'] as const)('KA-E05 gate boundary is identical for coarse steps and recovered fine steps: %s',async(profile)=>{
  const coarseStore=new Persistence('ka-owned-gate-coarse-'+crypto.randomUUID()),fineStore=new Persistence('ka-owned-gate-fine-'+crypto.randomUUID());
  const coarseGame=new Game(coarseStore,{knowledge_collection_gate_profile:profile}),fineGame=new Game(fineStore,{knowledge_collection_gate_profile:profile});
  try{
    let coarse:GamePlayerView,fine:GamePlayerView;
    const random=vi.spyOn(crypto,'randomUUID').mockReturnValue('44444444-4444-4444-8444-444444444444');
    try{const selector={schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}};coarse=await coarseGame.create_run(selector,'research','create');fine=await fineGame.create_run(selector,'research','create');}finally{random.mockRestore();}
    const ref=(kind:string,id:string)=>({run_id:coarse.run_id,kind,id,version:1});
    const envelope={run_id:coarse.run_id,operation_id:'collect',expected_revision:coarse.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    coarse=(await coarseGame.apply_collection_intent(envelope)).view;fine=(await fineGame.apply_collection_intent(envelope)).view;
    coarse=(await coarseGame.control_clock({run_id:coarse.run_id,operation_id:'coarse',expected_revision:coarse.revision,intent:{kind:'advance',to:40000}})).view;
    for(const to of [1000,2000,29998,29999,30000,30001,30999,31000,32000,33000,40000])fine=(await new Game(fineStore).control_clock({run_id:fine.run_id,operation_id:'fine-'+to,expected_revision:fine.revision,intent:{kind:'advance',to}})).view;
    const a=await coarseStore.read_committed(coarse.run_id),b=await fineStore.read_committed(fine.run_id);if(a?.schema!==14||b?.schema!==14)throw Error('Wrong collection branch');
    for(const key of ['sim_time','actors','gates','commands','requests','requirements','collection_tasks','observations','reports','deliveries','records','schedule','event_sequence','knowledge_seq','rng','intel'] as const)expect(b[key]).toEqual(a[key]);
  }finally{await coarseStore.delete();await fineStore.delete();}
});

test('KA-E08 a cancelled source task does not mask the real labor and device cost of its legal retry',async()=>{
  const store=new Persistence('ka-owned-retry-cost-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const intent={kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000};
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'first',expected_revision:view.revision,intent})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'to-cancel',expected_revision:view.revision,intent:{kind:'advance',to:10000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'cancel',expected_revision:view.revision,intent:{kind:'cancel_collection',request_ref:view.collection_requests[0].ref,authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'cancel-receipt',expected_revision:view.revision,intent:{kind:'advance',to:12000}})).view;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'retry',expected_revision:view.revision,intent})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'complete-retry',expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    expect(await store.read_committed(view.run_id)).toMatchObject({collection_tasks:[{status:'cancelled'},{status:'collected'}],actors:{W:{energy_used_uj:91500000,blank_record:false}},records:[{holder:'W',mass_kg:0.01}]});
    expect(view).toMatchObject({reports:[{body:{kind:'collection_cancelled'}},{body:{kind:'qualified_facility_field'},resource_snapshot:{energy_used_j:91}}]});
  }finally{await store.delete();}
});

test('KA-E10 gives identical collection events, ledger and source records for coarse steps and recovered fine steps',async()=>{
  const coarseStore=new Persistence('ka-owned-coarse-'+crypto.randomUUID()),fineStore=new Persistence('ka-owned-fine-'+crypto.randomUUID());
  const coarseGame=new Game(coarseStore),fineGame=new Game(fineStore);
  try{
    let coarse:GamePlayerView,fine:GamePlayerView;
    const random=vi.spyOn(crypto,'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222');
    try{
      const selector={schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}};
      coarse=await coarseGame.create_run(selector,'research','create');fine=await fineGame.create_run(selector,'research','create');
    }finally{random.mockRestore();}
    const ref=(kind:string,id:string)=>({run_id:coarse.run_id,kind,id,version:1});
    for(const actor of ['R','W'] as const){
      const envelope={run_id:coarse.run_id,operation_id:'collect-'+actor,expected_revision:coarse.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}};
      coarse=(await coarseGame.apply_collection_intent(envelope)).view;fine=(await fineGame.apply_collection_intent(envelope)).view;
    }
    coarse=(await coarseGame.control_clock({run_id:coarse.run_id,operation_id:'coarse',expected_revision:coarse.revision,intent:{kind:'advance',to:93000}})).view;
    for(const to of [1000,2000,3000,29999,30000,31000,32000,59999,60000,89999,90000,92000,93000]){
      fine=(await new Game(fineStore).control_clock({run_id:fine.run_id,operation_id:'fine-'+to,expected_revision:fine.revision,intent:{kind:'advance',to}})).view;
    }
    const coarseState=await coarseStore.read_committed(coarse.run_id),fineState=await fineStore.read_committed(fine.run_id);
    if(coarseState?.schema!==14||fineState?.schema!==14)throw Error('Wrong collection branch');
    for(const key of ['sim_time','actors','commands','requests','requirements','collection_tasks','observations','reports','deliveries','records','schedule','event_sequence','knowledge_seq','rng','intel'] as const)expect(fineState[key]).toEqual(coarseState[key]);
    expect(coarseState.actors).toMatchObject({R:{position:[250,150],energy_used_uj:246000000,blank_record:false},W:{position:[250,150],energy_used_uj:91500000,blank_record:false}});
    expect(coarseState.records.map(record=>[record.holder,record.mass_kg])).toEqual([['R',0.01],['W',0.01]]);
    expect(coarseState.reports.map(report=>[report.source_actor,report.generated_at])).toEqual([['R',31000],['W',92000]]);
    expect(coarseState.deliveries.map(delivery=>delivery.received_at)).toEqual([32000,93000]);
  }finally{await coarseStore.delete();await fineStore.delete();}
});

test.each([
  {needed_by:32001,surface:'default' as const,status:'inconclusive'},
  {needed_by:32000,surface:'default' as const,status:'inconclusive'},
  {needed_by:31999,surface:'default' as const,status:'expired'},
  {needed_by:20000,surface:'default' as const,status:'expired'},
  {needed_by:32000,surface:'empty' as const,status:'expired'},
])('KA-E08 evaluates IR timeliness independently of real collection and registration: $needed_by / $surface',async({needed_by,surface,status})=>{
  const store=new Persistence('ka-owned-ir-deadline-'+crypto.randomUUID()),game=new Game(store,{knowledge_collection_surface:surface});
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:40000}})).view;
    expect(view).toMatchObject({collection_requests:[{status}],reports:[{generated_at:31000}],deliveries:[{received_at:32000}]});
    const state=await store.read_committed(view.run_id);
    expect(state).toMatchObject({requirements:[{needed_by,status}],collection_tasks:[{status:surface==='empty'?'failed':'collected'}],actors:{R:{energy_used_uj:140000000}}});
    expect(await new Game(store).get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('KA-E08 separates the HQ requirement, source task and local registration without a free HQ processing job',async()=>{
  const store=new Persistence('ka-owned-state-layers-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    expect(await store.read_committed(view.run_id)).toMatchObject({requirements:[{status:'tasking',needed_by:900000}],collection_tasks:[],intel:{jobs:[]}});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to}})).view;return store.read_committed(view.run_id);};
    expect(await at(1000)).toMatchObject({collection_tasks:[{status:'collecting',source_actor:'R',labor_ref:'R:LABOR',device_ref:'R:COLLECTOR'}],requirements:[{status:'tasking'}]});
    expect(await at(2000)).toMatchObject({requirements:[{status:'collecting'}]});
    expect(await at(30000)).toMatchObject({collection_tasks:[{status:'collected',observed_at:30000}],requests:[{status:'registering'}],requirements:[{status:'collecting'}],intel:{jobs:[]}});
    expect(await at(31000)).toMatchObject({collection_tasks:[{status:'collected'}],requests:[{status:'completed'}],requirements:[{status:'collecting'}],intel:{jobs:[]}});
    expect(view).toMatchObject({reports:[],coverage:[]});
    expect(await at(32000)).toMatchObject({requirements:[{status:'inconclusive'}],intel:{jobs:[]}});
  }finally{await store.delete();}
});

test('KA-E02 publishes actual limited coverage only after collection, registration and delivery',async()=>{
  const store=new Persistence('ka-owned-limited-collection-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const issued=await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{
      kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),
      target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),
      method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),
      basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000,
    }});
    view=issued.view;
    expect(view).toMatchObject({sim_time:0,collection_requests:[{actor:'R',status:'tasking'}],reports:[],coverage:[]});
    for(const to of [1000,29999,30000,31000]){
      view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to}})).view;
      expect(view).toMatchObject({sim_time:to,reports:[],coverage:[],facility_knowledge:null});
    }
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:32000}})).view;
    expect(view).toMatchObject({
      reports:[{source_actor:'R',method:'limited-text-collection',observed_time:{kind:'known',value:30000},generated_at:31000,source_reported_time:{kind:'unknown'},body:{kind:'limited_indication',field:'B.condition'}}],
      deliveries:[{sender:'R',recipient:'HQ',sent_at:31000,received_at:32000}],
      coverage:[{quality:'limited',outcome:'inconclusive',planned_area_m2:100,actual_area_m2:50,actual_scope:[{min_x:245,max_x:250,min_y:145,max_y:155}],observed_time:{kind:'known',value:30000}}],
      facility_knowledge:null,
    });
  }finally{await store.delete();}
});

test('KA-E06 keeps an empty private sampling surface invisible until a real failure report arrives',async()=>{
  const normalStore=new Persistence('ka-owned-private-surface-normal-'+crypto.randomUUID());
  const emptyStore=new Persistence('ka-owned-private-surface-empty-'+crypto.randomUUID());
  const normalGame=new Game(normalStore),emptyGame=new Game(emptyStore,{knowledge_collection_surface:'empty'});
  try{
    const selector={schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}};
    // Random identity is the system-boundary input; both private worlds use the same public run identity.
    const random=vi.spyOn(crypto,'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
    let normal:GamePlayerView,empty:GamePlayerView;
    try{normal=await normalGame.create_run(selector,'research','ka-pair-create');empty=await emptyGame.create_run(selector,'research','ka-pair-create');}
    finally{random.mockRestore();}
    expect(empty).toEqual(normal);
    const ref=(kind:string,id:string)=>({run_id:normal.run_id,kind,id,version:1});
    const envelope={run_id:normal.run_id,operation_id:'ka-pair-collect',expected_revision:normal.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    normal=(await normalGame.apply_collection_intent(envelope)).view;empty=(await emptyGame.apply_collection_intent(envelope)).view;
    expect(empty).toEqual(normal);
    for(const to of [1000,2000,30000,31000]){
      const control={run_id:normal.run_id,operation_id:'ka-pair-advance-'+to,expected_revision:normal.revision,intent:{kind:'advance' as const,to}};
      normal=(await normalGame.control_clock(control)).view;empty=(await emptyGame.control_clock(control)).view;
      expect(empty).toEqual(normal);
    }
    const delivered={run_id:normal.run_id,operation_id:'ka-pair-delivery',expected_revision:normal.revision,intent:{kind:'advance' as const,to:32000}};
    normal=(await normalGame.control_clock(delivered)).view;empty=(await emptyGame.control_clock(delivered)).view;
    expect(normal).toMatchObject({coverage:[{quality:'limited',actual_area_m2:50}]});
    expect(empty).toMatchObject({
      reports:[{generated_at:31000,observation_ref:null,record_ref:null,observed_time:{kind:'unknown'},body:{kind:'collection_failed',reason:'empty_scope',conclusion:'unknown',collection_work_ms:29000}}],
      deliveries:[{sent_at:31000,received_at:32000}],
      coverage:[{actual_scope:[],actual_area_m2:null,quality:'failed',outcome:'not_covered',observed_time:{kind:'unknown'}}],facility_knowledge:null,
    });
    if(empty.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(empty.reports[0].observed_time).toEqual({kind:'unknown'});
  }finally{await normalStore.delete();await emptyStore.delete();}
});

test('KA-E05 withdraws an unsent HQ command locally without inventing a remote task or receipt',async()=>{
  const store=new Persistence('ka-owned-cancel-unsent-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    for(const actor of ['R','W'] as const){
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000}})).view;
    }
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const requestRef=view.collection_requests[1].ref;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'cancel_collection',request_ref:requestRef,authority_ref:ref('authority','KA-INITIAL')}})).view;
    expect(view).toMatchObject({sim_time:0,collection_requests:[{actor:'R',status:'tasking'},{actor:'W',status:'cancelled',local_receipt:{kind:'cancelled_before_send',at:0,remote_task_created:false}}],reports:[]});
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.reports).toHaveLength(1);expect(view.reports[0].source_actor).toBe('R');
    expect(view.deliveries).toHaveLength(1);
  }finally{await store.delete();}
});

test('KA-E05 keeps the original immutable report when a cancellation arrives after completion',async()=>{
  const store=new Persistence('ka-owned-cancel-after-completion-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:40000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const original=structuredClone(view.reports[0]),delivery=structuredClone(view.deliveries[0]),requestRef=view.collection_requests[0].ref;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'cancel_collection',request_ref:requestRef,authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:42000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.reports).toEqual([original]);expect(view.deliveries).toEqual([delivery]);
  }finally{await store.delete();}
});

test('KA-E05 cancels a waiting task only after the remote command arrives and keeps the terminal receipt',async()=>{
  const store=new Persistence('ka-owned-cancel-waiting-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const requestRef=view.collection_requests[0].ref;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:10000}})).view;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'cancel_collection',request_ref:requestRef,authority_ref:ref('authority','KA-INITIAL')}})).view;
    expect(view).toMatchObject({reports:[],collection_requests:[{status:'tasking'}]});
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:11999}})).view;
    expect(view).toMatchObject({reports:[],coverage:[]});
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:12000}})).view;
    expect(view).toMatchObject({
      collection_requests:[{status:'cancelled'}],
      reports:[{method:'task-control-receipt',generated_at:11000,observed_time:{kind:'unknown'},record_ref:null,body:{kind:'collection_cancelled',collection_work_ms:0}}],
      deliveries:[{sender:'W',sent_at:11000,received_at:12000}],
      coverage:[{actual_scope:[],actual_area_m2:null,quality:'failed',outcome:'not_covered'}],
    });
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.reports).toHaveLength(1);
    expect(view.facility_knowledge).toBeNull();
  }finally{await store.delete();}
});

test('KA-E05 rejects ordinary cancellation after work starts without refunding work or duplicating reports',async()=>{
  const store=new Persistence('ka-owned-cancel-active-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const requestRef=view.collection_requests[0].ref;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:10000}})).view;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'cancel_collection',request_ref:requestRef,authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:32000}})).view;
    expect(view).toMatchObject({reports:[{observed_time:{kind:'known',value:30000},generated_at:31000,body:{kind:'limited_indication'},control_outcomes:[{result:'already_started',decided_at:11000}],resource_snapshot:{actor:'R',at:31000,energy_used_j:122}}],coverage:[{quality:'limited',actual_area_m2:50}]});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.reports).toHaveLength(1);expect(view.deliveries).toHaveLength(1);
  }finally{await store.delete();}
});

test('KA-E04 settles a completed batch at the closing instant before closing the half-open window',async()=>{
  const store=new Persistence('ka-owned-window-completion-tie-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:1000}})).view;
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:33000}})).view;
    expect(view).toMatchObject({reports:[{observed_time:{kind:'known',value:31000},generated_at:32000,body:{kind:'limited_indication'}}],coverage:[{quality:'limited',actual_area_m2:50}]});
  }finally{await store.delete();}
});

test('KA-E04 accepts a future window without working early or claiming an unreported start',async()=>{
  const store=new Persistence('ka-owned-future-window-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    expect(view).toMatchObject({reports:[],collection_requests:[{status:'tasking',acknowledgement:{stage:'waiting_window',sent_at:1000,received_at:2000,planned_start_at:60000}}]});
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:89999}})).view;
    expect(view).toMatchObject({reports:[],coverage:[],collection_requests:[{status:'tasking'}]});
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    expect(view).toMatchObject({reports:[{observed_time:{kind:'known',value:90000},generated_at:92000}],deliveries:[{sent_at:92000,received_at:93000}]});
  }finally{await store.delete();}
});

test('KA-E04 closes the collection window without inventing a partial batch or an observed time',async()=>{
  const store=new Persistence('ka-owned-window-closure-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:10000}})).view;
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{
      kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000,
    }})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:31000}})).view;
    expect(view).toMatchObject({reports:[],coverage:[]});
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:33000}})).view;
    expect(view).toMatchObject({
      reports:[{observed_time:{kind:'unknown'},observation_ref:null,record_ref:null,generated_at:32000,body:{kind:'collection_failed',quality:'failed',outcome:'not_covered',conclusion:'unknown',reason:'window_closed',attempted_interval:{from:11000,to:31000},collection_work_ms:20000}}],
      coverage:[{quality:'failed',outcome:'not_covered',actual_scope:[],actual_area_m2:null,observed_time:{kind:'unknown'}}],
      facility_knowledge:null,
    });
  }finally{await store.delete();}
});

test('KA-E03 requires a real qualified inspection before W can deliver the facility field',async()=>{
  const store=new Persistence('ka-owned-qualified-inspection-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research',crypto.randomUUID());
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:59000}})).view;
    expect(view).toMatchObject({reports:[],facility_knowledge:null});
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{
      kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),
      scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),
      basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000,
    }})).view;
    for(const to of [60000,89999,90000,92000]){
      view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to}})).view;
      expect(view).toMatchObject({reports:[],coverage:[],facility_knowledge:null});
    }
    view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    expect(view).toMatchObject({
      reports:[{source_actor:'W',method:'qualified-facility-inspection',observed_time:{kind:'known',value:90000},generated_at:92000,body:{kind:'qualified_facility_field',field:'B.condition',condition:'operable',object_version:1,quality:'qualified'}}],
      deliveries:[{sender:'W',recipient:'HQ',sent_at:92000,received_at:93000}],
      coverage:[{quality:'qualified',planned_area_m2:4,actual_area_m2:4,actual_scope:[{min_x:249,max_x:251,min_y:149,max_y:151}]}],
    });
  }finally{await store.delete();}
});

test.each([
  {profile:'initial_unknown',generated_at:32000,received_at:33000,work:0,reason:'window_closed',energy:82000000,success:false},
  {profile:'initial_not_met',generated_at:2000,received_at:3000,work:0,reason:'local_gate_not_met',energy:82000000,success:false},
  {profile:'unknown_mid',generated_at:16000,received_at:17000,work:14000,reason:'local_gate_unknown',energy:110000000,success:false},
  {profile:'not_met_mid',generated_at:16000,received_at:17000,work:14000,reason:'local_gate_not_met',energy:110000000,success:false},
  {profile:'unknown_before_completion',generated_at:30999,received_at:31999,work:28999,reason:'local_gate_unknown',energy:139998000,success:false},
  {profile:'unknown_at_completion',generated_at:31000,received_at:32000,work:29000,reason:'local_gate_unknown',energy:140000000,success:false},
  {profile:'not_met_at_completion',generated_at:31000,received_at:32000,work:29000,reason:'local_gate_not_met',energy:140000000,success:false},
  {profile:'unknown_after_completion',generated_at:31000,received_at:32000,work:29000,reason:null,energy:140000000,success:true},
  {profile:'initial_unknown_then_met',generated_at:32000,received_at:33000,work:29000,reason:null,energy:140000000,success:true},
] as const)('KA-E05 obeys a real local collection gate, spent work and environment phase: $profile',async(vector)=>{
  const store=new Persistence('ka-owned-local-gate-'+crypto.randomUUID()),game=new Game(store,{knowledge_collection_gate_profile:vector.profile});
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'before-delivery',expected_revision:view.revision,intent:{kind:'advance',to:vector.received_at-1}})).view;
    expect(view).toMatchObject({reports:[],coverage:[]});
    view=(await new Game(store).control_clock({run_id:view.run_id,operation_id:'at-delivery',expected_revision:view.revision,intent:{kind:'advance',to:vector.received_at}})).view;
    expect(view).toMatchObject({reports:[{generated_at:vector.generated_at}],deliveries:[{received_at:vector.received_at}]});
    if(vector.success)expect(view).toMatchObject({reports:[{body:{kind:'limited_indication'},observed_time:{kind:'known',value:vector.generated_at-1000}}],coverage:[{actual_area_m2:50}]});
    else expect(view).toMatchObject({reports:[{body:{kind:'collection_failed',reason:vector.reason,collection_work_ms:vector.work},observation_ref:null,record_ref:null,observed_time:{kind:'unknown'}}],coverage:[{actual_scope:[],actual_area_m2:null,quality:'failed'}]});
    view=(await new Game(store).control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:40000}})).view;
    expect(await store.read_committed(view.run_id)).toMatchObject({actors:{R:{energy_used_uj:vector.energy,blank_record:!vector.success}},collection_tasks:[{status:vector.success?'collected':'failed'}]});
  }finally{await store.delete();}
});
