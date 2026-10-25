import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';
import {verify_collection_report_digests} from '../src/knowledge-collection-dto';
import {settle_collection_outcome} from '../src/core/knowledge-collection-outcome';
import {project_knowledge_collection_view} from '../src/core/knowledge-collection-engine';

test.each([false,true])('KA-E28 explicit cleanup delivers two real commands, returns both teams and preserves active registration, collecting=%s',async(collecting)=>{
  const store=new Persistence('ka-owned-termination-'+crypto.randomUUID());let game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-NORMAL-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    if(collecting){
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
      await at(2000);
    }
    const request={run_id:view.run_id,operation_id:'terminate',expected_revision:view.revision,intent:{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')}};
    view=(await game.apply_collection_intent(request)).view;
    expect(view).toMatchObject({status:'terminating',finished:false,can_issue:false,result:null,termination:{trigger:'player',issued_at:collecting?2000:0,cleanup_deadline:collecting?324000:322000}});
    await game.apply_collection_intent(request);
    if(collecting){await at(10000);if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong view');expect(view.return_requests).toEqual([]);view=(await game.save({run_id:view.run_id,operation_id:'save-cleanup',expected_revision:view.revision,intent:{kind:'save'}})).view;game=new Game(new Persistence(store.name));view=(await game.restore(view.run_id,'restore-cleanup')).view;}
    await at(1222000);
    expect(view).toMatchObject({status:'finished',finished:true,sim_time:collecting?249648:220648,result:{outcome:'aborted',safe_people:6},termination:{recovery_unconfirmed:[]}});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.commands.filter(command=>command.kind==='receive_cleanup')).toHaveLength(2);
    expect(Object.values(state.actors).every(actor=>actor.position[0]===50&&actor.off)).toBe(true);
    expect(state.H_inventory.mass_kg).toBe(0);
    if(collecting){expect(state.records).toHaveLength(1);expect(state.records[0].holder).toBe('R');expect(state.requests[0]).toMatchObject({started_at:1000,registered_at:31000});}
    expect(valid_response({request_id:'cleanup',ok:true,view})).toBe(true);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong view');
    expect(view.actors.map(actor=>actor.position.point)).toEqual([[50,150],[50,150]]);
    const missing=structuredClone(view);missing.termination!.cleanup_deliveries.pop();
    expect(valid_response({request_id:'missing-cleanup-delivery',ok:true,view:missing})).toBe(false);
    const forged=structuredClone(view);forged.termination!.cleanup_reports[0].body.people=6 as 3;
    expect(valid_response({request_id:'fake-six-people',ok:true,view:forged})).toBe(false);
    const digestFault=structuredClone(view);digestFault.termination!.cleanup_reports[0].body.energy_used_uj++;
    expect(await verify_collection_report_digests(digestFault)).toBe(false);
  }finally{await store.delete();}
});

test.each(['R','W'] as const)('KA-E26 only actual %s record qualifies for partial after explicit safe cleanup; information alone never finishes',async(actor)=>{
  const store=new Persistence('ka-owned-partial-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-NORMAL-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    if(actor==='W')await at(59000);
    await apply('collect',{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000});
    await at(93000);
    await apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')});
    await apply('return-W',{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')});
    await at(400000);expect(view).toMatchObject({finished:false,result:null});
    await apply('terminate',{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')});
    await at(1222000);expect(view).toMatchObject({finished:true,sim_time:403000,result:{outcome:'partial',safe_people:6}});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong view');
    expect(view.result!.verified_records).toHaveLength(1);expect(view.verification_records.map(record=>record.actor)).toEqual([actor]);
    expect(view.result).toMatchObject({missing_records:[actor==='R'?'W':'R'],reason_codes:['incomplete_record_goal'],limits:expect.arrayContaining(['R的有限记录不确认设施状况'])});
    expect(valid_response({request_id:'partial',ok:true,view})).toBe(true);
    for(const patch of [{safe_people:3},{verified_records:[]},{outcome:'success'},{outcome:'failure'},{evidence_refs:[]}]){
      const forged=structuredClone(view);Object.assign(forged.result!,patch);expect(valid_response({request_id:'forged-partial',ok:true,view:forged})).toBe(false);
    }
  }finally{await store.delete();}
});

test('KA-E29 900 deadline keeps real cleanup advancing beyond910 and finishes before its actual322s cap',async()=>{
  const store=new Persistence('ka-owned-deadline-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-NORMAL-01'},'research','create');
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await at(910000);expect(view).toMatchObject({sim_time:910000,status:'terminating',finished:false,result:null,termination:{trigger:'deadline',issued_at:900000,cleanup_deadline:1222000}});
    await at(1222000);expect(view).toMatchObject({sim_time:1120648,status:'finished',finished:true,result:{outcome:'failure',safe_people:6},termination:{recovery_unconfirmed:[]}});
    expect(valid_response({request_id:'deadline-cleanup',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E28 cancels the three unsent optional credentials with retained reasons while the already sending S report completes',async()=>{
  const store=new Persistence('ka-owned-source-cleanup-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    await apply('collect',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000,delivery_copies:3});
    await at(100000);await apply('archive',{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'});
    await at(104000);await apply('terminate',{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')});
    await at(104500);const beforeReceipt=await store.read_committed(view.run_id);if(beforeReceipt?.schema!==14)throw Error('Wrong state');
    expect(beforeReceipt.termination!.tasks.find(task=>task.intent.actor==='R')!.received_at).toBeNull();
    expect(beforeReceipt.source_messages.filter(message=>message.kind==='credential').map(message=>message.status)).toEqual(['queued','queued','queued']);
    await at(1222000);expect(view).toMatchObject({finished:true,sim_time:334000,result:{outcome:'aborted',safe_people:6},source_credentials:[],source_relationships:{content_delivery_count:4,report_identity_count:2,global_independence:{kind:'unknown'}}});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    const cancelled=state.source_messages.filter(message=>message.kind==='credential');
    expect(cancelled).toHaveLength(3);for(const message of cancelled)expect(message).toMatchObject({status:'cancelled',sent_at:null,received_at:null,cancelled_at:105000,cancellation_reason:'termination_before_send'});
    expect(state.records).toHaveLength(1);expect(state.records[0].holder).toBe('R');expect(state.H_inventory.mass_kg).toBe(0);
    expect(valid_response({request_id:'source-cleanup',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E29 cleanup-cap fault-policy vector freezes unsafe physical facts and exposes only last legal HQ positions',async()=>{
  const store=new Persistence('ka-owned-cleanup-cap-policy-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-NORMAL-01'},'research','create');
    view=(await game.control_clock({run_id:view.run_id,operation_id:'to910',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const original=await store.read_committed(view.run_id);if(original?.schema!==14)throw Error('Wrong state');
    // Deliberate missing-completion fault at the policy seam; never commit or claim
    // this as a naturally reachable trajectory of the finite normal profile.
    const fault=structuredClone(original),actors=structuredClone(fault.actors);fault.sim_time=fault.termination!.cleanup_deadline;
    settle_collection_outcome(fault,true);
    expect(fault).toMatchObject({finished:true,status:'finished',result:{outcome:'failure',known_at:1222000,safe_people:0,reason_codes:['entity_deadline','recovery_unconfirmed']},termination:{recovery_unconfirmed:['R','W']}});
    expect(fault.actors).toEqual(actors);expect(fault.H_inventory).toEqual(original.H_inventory);
    const publicView=project_knowledge_collection_view(fault);expect(publicView.actors.map(actor=>actor.position.point)).toEqual([[250,150],[250,150]]);
    expect(valid_response({request_id:'cap-policy-only',ok:true,view:publicView})).toBe(true);
    expect(await store.read_committed(view.run_id)).toEqual(original);
  }finally{await store.delete();}
});

test('KA-E28 a busy HQ sender keeps its in-flight W order, cancels the unsent R archive locally, and delivers R/W cleanup by3s',async()=>{
  const store=new Persistence('ka-owned-busy-hq-cleanup-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    await apply('collect-W',{kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000});
    await apply('queued-archive',{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'});
    await apply('terminate',{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')});
    await at(3000);
    let state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.termination!.tasks.map(task=>task.received_at)).toEqual([2000,3000]);
    expect(state.commands.find(command=>command.kind==='receive_collection')).toMatchObject({status:'delivered',sent_at:0,delivered_at:1000});
    expect(state.commands.find(command=>command.kind==='receive_archive')).toMatchObject({status:'cancelled',sent_at:null,delivered_at:null,cancelled_at:0});
    expect(state.archive_requests[0]).toMatchObject({status:'cancelled',received_at:null,registered_output:null});
    await at(1222000);expect(view).toMatchObject({sim_time:221648,finished:true,result:{outcome:'aborted',safe_people:6},archive_requests:[{status:'cancelled'}]});
    state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');expect(state.records).toEqual([]);expect(state.observations).toEqual([]);
    expect(valid_response({request_id:'busy-hq-cleanup',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test.each([336000,340000])('KA-E28 stopping at%s cancels only unstarted H work and preserves the active W transfer',async(stopAt)=>{
  const store=new Persistence('ka-owned-H-queue-stop-'+crypto.randomUUID());let game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    const collect=(actor:'R'|'W')=>apply('collect-'+actor,{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'?{delivery_copies:3}:{})});
    await collect('R');await at(59000);await collect('W');await at(93000);await apply('return-W',{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')});
    await at(100000);await apply('archive',{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'});await at(108000);await apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')});
    await at(stopAt);await apply('terminate',{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')});
    let state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.handovers.find(task=>task.actor==='W')).toMatchObject({status:'receiving',started_at:318429,completed_at:null});
    if(stopAt===340000)expect(state.handovers.find(task=>task.actor==='R')).toMatchObject({status:'cancelled',started_at:null,completed_at:null,cancelled_at:340000});
    await at(stopAt+1500);view=(await game.save({run_id:view.run_id,operation_id:'save-stopping-H',expected_revision:view.revision,intent:{kind:'save'}})).view;
    game=new Game(new Persistence(store.name));view=(await game.restore(view.run_id,'restore-stopping-H')).view;
    await at(1222000);expect(view).toMatchObject({sim_time:344429,finished:true,result:{outcome:'aborted',safe_people:6},verification_records:[],source_relationships:{content_delivery_count:5,report_identity_count:3,global_independence:{kind:'confirmed',count:3}}});
    state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.H_inventory.mass_kg).toBe(.01);expect(state.records.find(record=>record.source_actor==='R')).toMatchObject({holder:'R',custody:expect.any(Array)});expect(state.records.find(record=>record.source_actor==='R')!.custody).toHaveLength(1);
    expect(state.records.find(record=>record.source_actor==='W')).toMatchObject({holder:'H'});expect(state.records.find(record=>record.source_actor==='W')!.custody).toHaveLength(2);
    expect(state.actors.R.energy_used_uj).toBe(754858000);expect(state.actors.W.energy_used_uj).toBe(204214500);
    if(stopAt===336000)expect(state.handovers.some(task=>task.actor==='R')).toBe(false);
    expect(state.intel.jobs).toEqual([]);expect(valid_response({request_id:'stopped-H-queue',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E28 terminating preserves an expired IR and its local cancellation through save and restore',async()=>{
  const store=new Persistence('ka-owned-expired-local-withdrawal-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const collect=async(actor:'R'|'W',needed_by:number)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by}})).view;};
    await collect('R',900000);if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'cancel-R',expected_revision:view.revision,intent:{kind:'cancel_collection',request_ref:view.collection_requests[0].ref,authority_ref:ref('authority','KA-INITIAL')}})).view;
    await collect('W',1000);
    view=(await game.control_clock({run_id:view.run_id,operation_id:'expire',expected_revision:view.revision,intent:{kind:'advance',to:1000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.collection_requests[1].status).toBe('expired');
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'terminate',expected_revision:view.revision,intent:{kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')}})).view;
    expect(view).toMatchObject({collection_requests:[{actor:'R'},{actor:'W',status:'expired',local_receipt:{kind:'cancelled_before_send',at:1000,remote_task_created:false}}],reports:[]});
    expect(await store.read_committed(view.run_id)).toMatchObject({requirements:[{status:'tasking'},{status:'expired'}],collection_tasks:[{source_actor:'R'}]});
    view=(await game.save({run_id:view.run_id,operation_id:'save-terminal',expected_revision:view.revision,intent:{kind:'save'}})).view;
    const restored=(await new Game(new Persistence(store.name)).restore(view.run_id,'restore-terminal')).view;
    expect(restored).toMatchObject({collection_requests:[{actor:'R'},{actor:'W',status:'expired',local_receipt:{kind:'cancelled_before_send',at:1000,remote_task_created:false}}]});
    expect(valid_response({request_id:'restored-expired',ok:true,view:restored})).toBe(true);
  }finally{await store.delete();}
});
