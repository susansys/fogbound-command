import {test, expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/outcome-definition.json';
import {valid_response} from '../src/dto';

test('B24 DTO rejects invented ordinary failure or premature cleanup while six public obligations remain open',async()=>{
  const store=new Persistence('b24-owned-t02-invented-ending-dto');
  try {
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const abort=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'abort',expected_revision:initial.revision,intent:{kind:'abort_outcome'}});
    const ended=await game.control_clock({run_id:initial.run_id,operation_id:'end',expected_revision:abort.view.revision,intent:{kind:'advance',to:120000}});
    const ordinary=structuredClone(initial),premature=structuredClone(abort.view);
    Object.assign(ordinary,{finished:true,outcome:{...structuredClone(Reflect.get(ended.view,'outcome')),result:'failure',finished_at:0,scoring_cutoff:0}});
    Object.assign(premature,{finished:true,outcome:{...structuredClone(Reflect.get(ended.view,'outcome')),finished_at:0}});
    expect(valid_response({request_id:'invented-ordinary-end',ok:true,view:ordinary})).toBe(false);
    expect(valid_response({request_id:'premature-six-unresolved',ok:true,view:premature})).toBe(false);
  } finally {await store.delete();}
});

test('B24 DTO rejects contradictory labels and invented personnel or artifact stages without actual HQ deliveries',async()=>{
  const store=new Persistence('b24-owned-t02-contradictory-outcome-dto');
  try {
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const abort=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'abort',expected_revision:initial.revision,intent:{kind:'abort_outcome'}});
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:abort.view.revision,intent:{kind:'advance',to:120000}});
    expect(view).toMatchObject({finished:true,outcome:{result:'aborted',qualified_artifacts:[],missing_people:expect.any(Array)}});
    expect(valid_response({request_id:'actual-abort',ok:true,view})).toBe(true);
    for(const result of ['success','partial','failure']){
      const altered=structuredClone(view);Reflect.get(altered,'outcome').result=result;
      expect(valid_response({request_id:'contradictory-'+result,ok:true,view:altered})).toBe(false);
    }
    const inventedPerson=structuredClone(view),personOutcome=Reflect.get(inventedPerson,'outcome');
    Object.assign(personOutcome.personnel_status[0],{returned_at:1,received_at:2,verified_at:3,confirmed_at:4});personOutcome.confirmed_people=['R-person-1'];personOutcome.missing_people=personOutcome.missing_people.slice(1);
    expect(valid_response({request_id:'invented-person-proof',ok:true,view:inventedPerson})).toBe(false);
    const inventedArtifact=structuredClone(view),artifactOutcome=Reflect.get(inventedArtifact,'outcome');
    Object.assign(artifactOutcome,{result:'partial',qualified_artifacts:['ART-O1'],artifact_status:[{id:'ART-O1',acquired_at:0,delivered_at:0,verified_at:0,confirmed_at:1,qualified:true,post_cutoff_effect:false}]});
    expect(valid_response({request_id:'invented-artifact-proof',ok:true,view:inventedArtifact})).toBe(false);
  } finally {await store.delete();}
});

test('B24 DTO binds termination bidirectionally to one actual HQ abort decision, operation and time',async()=>{
  const store=new Persistence('b24-owned-t02-termination-decision-binding');
  try {
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    expect(valid_response({request_id:'actual-initial',ok:true,view:initial})).toBe(true);
    const invented=structuredClone(initial);
    Reflect.set(invented,'termination',{original_decision_ref:{run_id:initial.run_id,kind:'decision_record',id:'DEC-fake',version:1},operation_id:'fake-abort',status:'terminating',effective_at:0,scoring_cutoff:0,cleanup_deadline:120000,notification_targets:['R','W','H','INTEL']});
    expect(valid_response({request_id:'invented-no-decision',ok:true,view:invented})).toBe(false);
    const before=(await game.control_clock({run_id:initial.run_id,operation_id:'before',expected_revision:initial.revision,intent:{kind:'advance',to:4000}})).view;
    const {view}=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'actual-abort',expected_revision:before.revision,intent:{kind:'abort_outcome'}});
    expect(valid_response({request_id:'actual-decision',ok:true,view})).toBe(true);
    for(const change of ['reference','operation','time','missing','duplicate'] as const){
      const altered=structuredClone(view),termination=Reflect.get(altered,'termination'),decisions=Reflect.get(altered,'decision_records');
      if(!termination)throw Error('Actual abort fixture must contain termination');
      if(change==='reference')termination.original_decision_ref.id='DEC-wrong';
      if(change==='operation')termination.operation_id='wrong-abort';
      if(change==='time'){termination.effective_at=3999;termination.scoring_cutoff=3999;termination.cleanup_deadline=123999;}
      if(change==='missing')Reflect.set(altered,'termination',null);
      if(change==='duplicate'){const duplicate=structuredClone(decisions[0]);duplicate.ref.id='DEC-duplicate';duplicate.operation_id='duplicate-abort';decisions.push(duplicate);}
      expect(valid_response({request_id:'mismatched-'+change,ok:true,view:altered})).toBe(false);
    }
  } finally {await store.delete();}
});

test('B24 E20/E22 a real HQ abort irreversibly starts bounded cleanup rather than declaring unrecovered people safe', async () => {
  const store = new Persistence('b24-owned-t02-abort-public');
  try {
    const game = new Game(store);
    const initial = await game.create_run(definition, 'research', 'create');
    const result = await game.apply_outcome_intent({
      run_id: initial.run_id, operation_id: 'hq-abort', expected_revision: initial.revision,
      intent: {kind: 'abort_outcome'},
    });
    expect(result.receipt).toMatchObject({kind: 'abort_outcome', result: 'committed', sim_time: 0});
    expect(result.view).toMatchObject({finished: false, termination: {
      status: 'terminating', effective_at: 0, scoring_cutoff: 0, cleanup_deadline: 120000,
      notification_targets: ['R', 'W', 'H', 'INTEL'],
    }});
    expect(result.view).toMatchObject({decision_records:[{operation_id:'hq-abort',at:0,intent:{kind:'abort_outcome'},reason:{kind:'not_recorded'}}],abort_reports:[]});
    await expect(game.apply_outcome_intent({run_id: initial.run_id, operation_id: 'cancel-abort',
      expected_revision: result.view.revision, intent: {kind: 'cancel_abort'}})).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(initial.run_id)).toEqual(result.view);
    const received=(await game.control_clock({run_id:initial.run_id,operation_id:'abort-acknowledgements',expected_revision:result.view.revision,intent:{kind:'advance',to:2000}})).view;
    expect(Reflect.get(received,'abort_reports')).toMatchObject(['R','W','H','INTEL'].map(actor=>({report:{actor,observed:{value:1000},source_event_time:{kind:'unknown'}},delivery:{received:2000}})));
    expect(valid_response({request_id:'abort-receipts',ok:true,view:received})).toBe(true);
  } finally { await store.delete(); }
});

test.each([[300000,420000],[850000,900000]])('B24 E21/E22 abort at %i has one fixed %i cleanup end across repeated abort and cold restore', async (at, end) => {
  const store = new Persistence('b24-owned-t02-fixed-cleanup-'+at);
  try {
    const game = new Game(store), initial=await game.create_run(definition,'command','create');
    let view=(await game.tick(initial.run_id,at,'before-abort')).view;
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'repeat-abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    await expect(game.apply_outcome_intent({run_id:initial.run_id,operation_id:'restart-primary',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}]}})).rejects.toThrow('RUN_ENDED');
    const reopened=new Game(store),restored=await reopened.restore(initial.run_id,'takeover');
    expect(restored.view).toMatchObject({sim_time:at,paused:true,finished:false,termination:{effective_at:at,cleanup_deadline:end}});
    view=(await reopened.control_clock({run_id:initial.run_id,operation_id:'continue',expected_revision:restored.view.revision,intent:{kind:'continue'}})).view;
    view=(await reopened.tick(initial.run_id,910000,'cross-cleanup-end')).view;
    expect(view).toMatchObject({sim_time:end,finished:true,paused:true,outcome:{result:'aborted',finished_at:end,scoring_cutoff:at,confirmed_people:[],missing_people:['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3']}});
    expect(valid_response({request_id:'finished',ok:true,view})).toBe(true);
    expect(await reopened.get_receipt(initial.run_id,'cross-cleanup-end')).toMatchObject({sim_time:end});
    await expect(reopened.tick(initial.run_id,end+1,'after-finished')).rejects.toThrow('CLOCK_PAUSED');
  } finally { await store.delete(); }
});

test('B24 joint E03/E20 a moving W receives no abort until H, and the public abort view remains a valid saved contract', async () => {
  const store = new Persistence('b24-owned-t02-inflight-abort');
  try {
    const game = new Game(store);
    let view = await game.create_run(definition, 'research', 'create');
    const run = view.run_id;
    const ref = (kind:string,id:string) => ({run_id:run,kind,id,version:1});
    view = (await game.return_and_deliver({run_id:run,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    const advance = async(to:number) => { view=(await game.control_clock({run_id:run,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view; };
    await advance(30000);
    view = (await game.apply_outcome_intent({run_id:run,operation_id:'abort-inflight',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    expect(valid_response({request_id:'abort-view',ok:true,view})).toBe(true);
    await advance(31000);
    expect(await game.get_actor_view(run,'R')).toMatchObject({termination:{received_at:31000,cleanup_deadline:150000}});
    expect(await game.get_actor_view(run,'W')).toMatchObject({termination:null});
    await advance(58999);
    expect(await game.get_actor_view(run,'W')).toMatchObject({termination:null});
    await advance(59000);
    expect(await game.get_actor_view(run,'W')).toMatchObject({termination:{received_at:59000,cleanup_deadline:150000},position:{site:'H'},resources:{movement_energy:18}});
    expect(Reflect.get(view,'termination')).toMatchObject({effective_at:30000,cleanup_deadline:150000});
  } finally { await store.delete(); }
});

test('B24 E20 INTEL receipt cancels a queued primary manifest, releasing its reservation before a distinct personnel-only cleanup job',async()=>{
  const store=new Persistence('b24-owned-t02-queued-primary-abort');
  try {
    const game=new Game(store);let view=await game.create_run(definition,'research','create');
    const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:run,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await advance(1000);
    view=(await game.return_and_deliver({run_id:run,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    await advance(86000);
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'source-before-abort',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
    await advance(88000);
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    await advance(89000);
    expect(await game.get_actor_view(run,'INTEL')).toMatchObject({verification_batches:[{purpose:'primary',status:'cutoff',completed_at:89000,work_done_ms:0,consumed_energy:0,settled:true},{purpose:'personnel_cleanup',status:'queued',queued_at:89000,started_at:null}]});
    await advance(127000);
    const local=await game.get_actor_view(run,'INTEL');
    expect(local).toMatchObject({verification_batches:[{status:'cutoff'},{purpose:'personnel_cleanup',status:'completed',started_at:106000,completed_at:126000,consumed_energy:2}],resources:{energy:16,energy_reserved:0}});
    expect(Reflect.get(view,'verification_reports')).toMatchObject([{report:{purpose:'personnel_cleanup',artifacts:[],personnel:[{status:'verified'},{status:'verified'},{status:'verified'}]},delivery:{received:127000}}]);
    expect(valid_response({request_id:'cleanup',ok:true,view})).toBe(true);
  } finally { await store.delete(); }
});

test.each([0,500])('B24 E20 local abort issued at %i rejects only not-yet-accepted primary, never retroactively cancelling earlier work',async(abortAt)=>{
  const store=new Persistence('b24-owned-t02-field-abort-'+abortAt);
  try {
    const game=new Game(store);let view=await game.create_run(definition,'research','create');
    const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'move-before-abort',expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;
    if(abortAt)view=(await game.control_clock({run_id:run,operation_id:'before-abort',expected_revision:view.revision,intent:{kind:'advance',to:abortAt}})).view;
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    view=(await game.control_clock({run_id:run,operation_id:'receive',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    const local=await game.get_actor_view(run,'R');
    expect(local).toMatchObject({termination:{received_at:abortAt+1000},activities:[{status:abortAt?'running':'refused',started_at:abortAt?1000:null}],resources:{movement_energy:20,movement_energy_reserved:abortAt?1:0,link_energy:abortAt?14:15,link_durability:abortAt?98:99}});
    if(!abortAt)expect(Reflect.get(view,'field_reports')).toMatchObject([{report:{phase:'refused',reason:'local_abort_received',observed:{value:1000}},delivery:{received:2000}}]);
    expect(valid_response({request_id:'field-abort',ok:true,view})).toBe(true);
  } finally { await store.delete(); }
});

test('B24 joint E03/E20 W abort shortly after return acceptance cannot reuse its stale B coordinate as a fixed terminal',async()=>{
  const store=new Persistence('b24-owned-t02-early-moving-w-abort');
  try {
    const game=new Game(store);let view=await game.create_run(definition,'research','create');const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    view=(await game.return_and_deliver({run_id:run,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    view=(await game.control_clock({run_id:run,operation_id:'to-500',expected_revision:view.revision,intent:{kind:'advance',to:500}})).view;
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    view=(await game.control_clock({run_id:run,operation_id:'to-2000',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    expect(await game.get_actor_view(run,'W')).toMatchObject({termination:null});
    expect(Reflect.get(view,'abort_reports').some((r:{report:{actor:string}})=>r.report.actor==='W')).toBe(false);
    view=(await game.control_clock({run_id:run,operation_id:'to-60000',expected_revision:view.revision,intent:{kind:'advance',to:60000}})).view;
    expect(await game.get_actor_view(run,'W')).toMatchObject({termination:{received_at:59000},resources:{movement_energy:18}});
    expect(Reflect.get(view,'abort_reports').find((r:{report:{actor:string}})=>r.report.actor==='W')).toMatchObject({report:{observed:{value:59000}},delivery:{received:60000,channel:'H-fixed'}});
  } finally {await store.delete();}
});

test('B24 E20 non-preemptible record may finish after abort but its later acquisition and custody never become primary credit',async()=>{
  const store=new Persistence('b24-owned-t02-post-cutoff-record');
  try {
    const game=new Game(store);let view=await game.create_run(definition,'research','create');const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    const advance=async(to:number)=>{view=(await game.control_clock({run_id:run,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const issue=async(id:string)=>{view=(await game.apply_outcome_intent({run_id:run,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;};
    await issue('R-to-A');await advance(32000);await issue('A-record');await advance(40000);
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    await advance(80000);
    view=(await game.return_and_deliver({run_id:run,operation_id:'cleanup-return-R',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','R'),return_route_ref:ref('return_route','R-A-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-R'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:80000,to:900000}}})).view;
    await advance(160000);
    expect(view).toMatchObject({finished:true,sim_time:160000,outcome:{result:'aborted',scoring_cutoff:40000,qualified_artifacts:[],artifact_status:[{id:'ART-O2',acquired_at:78000,delivered_at:136000,verified_at:null,confirmed_at:null,qualified:false,post_cutoff_effect:true}],confirmed_people:['R-person-1','R-person-2','R-person-3'],missing_people:['W-person-1','W-person-2','W-person-3']},processing:{energy_confirmed:18,energy_reserved:0}});
    expect(await game.get_actor_view(run,'R')).toMatchObject({resources:{record_energy:16,record_packs:1,durability:97,link_energy:10,link_durability:94}});
    expect(Reflect.get(view,'verification_reports')).toMatchObject([{report:{purpose:'personnel_cleanup',artifacts:[]}}]);
    expect(valid_response({request_id:'post-cutoff',ok:true,view})).toBe(true);
  } finally {await store.delete();}
});

test('B24 E26 an owned core transaction abort preserves the old run and never fabricates an outcome or termination',async()=>{
  const store=new Persistence('b24-owned-t02-abort-transaction-fault'),native=IDBObjectStore.prototype.put;
  try {
    const game=new Game(store),before=await game.create_run(definition,'command','create');let aborted=false;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const result=native.apply(this,args);if(!aborted&&this.transaction.db.name===store.name&&this.name==='runs')result.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});return result;};
    await expect(game.apply_outcome_intent({run_id:before.run_id,operation_id:'faulted-abort',expected_revision:before.revision,intent:{kind:'abort_outcome'}})).rejects.toThrow('STORAGE_UNCONFIRMED');
    IDBObjectStore.prototype.put=native;
    expect(aborted).toBe(true);expect(await game.get_receipt(before.run_id,'faulted-abort')).toBeNull();expect(await game.get_view(before.run_id)).toEqual(before);
    const recovered=await new Game(store).restore(before.run_id,'recover');expect(recovered.view).toMatchObject({finished:false,outcome:null,termination:null,paused:true,sim_time:before.sim_time});
  } finally {IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B24 E26 a lost abort commit response is resolved by the original operation, never a second decision or extended cleanup deadline',async()=>{
  const store=new Persistence('b24-owned-t02-abort-response-loss');
  try {
    const game=new Game(store),initial=await game.create_run(definition,'research','create'),commit=store.commit_batch.bind(store);let dropped=false;
    store.commit_batch=async(...args)=>{await commit(...args);if(!dropped){dropped=true;throw Error('owned acknowledgement lost');}};
    const request={run_id:initial.run_id,operation_id:'unknown-abort',expected_revision:initial.revision,intent:{kind:'abort_outcome'}};
    await expect(game.apply_outcome_intent(request)).rejects.toThrow('STORAGE_UNCONFIRMED');
    const receipt=await game.get_receipt(initial.run_id,'unknown-abort'),committed=await game.get_view(initial.run_id);
    expect(committed).toMatchObject({finished:false,outcome:null,termination:{effective_at:0,cleanup_deadline:120000},decision_records:[{operation_id:'unknown-abort',intent:{kind:'abort_outcome'}}],abort_reports:[]});
    const retried=await game.apply_outcome_intent(request);expect(retried.receipt).toEqual(receipt);expect(retried.view).toEqual(committed);
  } finally {await store.delete();}
});
