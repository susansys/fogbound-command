import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import registered from '../src/core/outcome-definition.json';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {verify_outcome_truth_digest} from '../src/outcome-dto';

test('B24 E32/E38 an explicit acknowledged truth grant exposes the sealed original custody, verification and cost records through the engine layer only',async()=>{
  const store=new Persistence('b24-owned-t03-full-truth-records');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    let view:Awaited<ReturnType<Game['create_run']>>=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'engine_event',topic:'cost'};
    expect(await game.query_outcome_debrief(query)).toMatchObject({status:'rejected',entries:[]});
    const payload=await game.request_outcome_truth({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:session.metadata_revision,operation_id:'reveal-original-records'});
    expect(payload.facts).toMatchObject({source:{resources:{energy:16}},custody:{person_receipts:[{person_id:'W-person-1'},{person_id:'W-person-2'},{person_id:'W-person-3'}]},ledgers:{verification_batches:[{status:'completed',consumed_energy:2}]},verification:{reports:[{subject_actor:'W',personnel:[{person_id:'W-person-1',status:'verified'},{person_id:'W-person-2',status:'verified'},{person_id:'W-person-3',status:'verified'}]}]}});
    expect(valid_response({request_id:'full-truth',ok:true,outcome_truth:payload})).toBe(true);expect(await verify_outcome_truth_digest(payload)).toBe(true);
    expect(await game.query_outcome_debrief(query)).toMatchObject({status:'rejected',entries:[]});
    await game.confirm_outcome_truth({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:payload.grant.metadata_revision,operation_id:payload.grant.operation_id,payload_digest:payload.grant.payload_digest});
    const actual=await game.query_outcome_debrief(query);expect(actual.status).toBe('answered');expect(actual.entries.every(item=>item.ref.layer==='engine_event'&&item.ref.kind==='ledger')).toBe(true);
    const selected=actual.entries.find(item=>item.record.consumed_energy===2);if(!selected)throw Error('Actual verification cost record missing');
    expect(await game.resolve_outcome_evidence({...query,ref:selected.ref})).toMatchObject({status:'answered',entry:selected,history:{read_only:true,layer:'engine_event'}});
    expect(await game.query_outcome_debrief({...query,as_of_revision:session.finished_seq+1})).toMatchObject({status:'rejected',entries:[]});
    expect(await game.get_view(initial.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B24 E38 fairness is a distinct strict metadata response and cannot carry private facts or masquerade as a normal player view',async()=>{
  const store=new Persistence('b24-owned-t03-fairness-channel');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    expect(valid_request({kind:'get_outcome_fairness',run_id:initial.run_id,request_id:'fairness'})).toBe(true);
    expect(valid_request({kind:'get_outcome_fairness',run_id:initial.run_id,request_id:'forged',truth_exposure:false})).toBe(false);
    const outcome_fairness=await game.get_outcome_fairness(initial.run_id);
    expect(valid_response({request_id:'fairness',ok:true,outcome_fairness})).toBe(true);
    expect(valid_response({request_id:'private',ok:true,outcome_fairness:{...outcome_fairness,facts:{source:{}}}})).toBe(false);
    expect(valid_response({request_id:'inconsistent',ok:true,outcome_fairness:{...outcome_fairness,truth_exposure:true}})).toBe(false);
    expect(valid_response({request_id:'smuggled',ok:true,outcome_fairness,view:initial})).toBe(false);
  }finally{await store.delete();}
});

test('B24 E38 same-scenario fresh and restarted runs inherit only actual prior truth exposure references without giving actors future knowledge',async()=>{
  const store=new Persistence('b24-owned-t03-scenario-exposure');
  try{
    const game=new Game(store),source=await game.create_run(registered,'research','create-source');
    await game.control_clock({run_id:source.run_id,operation_id:'finish-source',expected_revision:source.revision,intent:{kind:'advance',to:910000}});
    const session=await game.open_outcome_debrief(source.run_id),payload=await game.request_outcome_truth({run_id:source.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:1,operation_id:'reveal-source'});
    const before=await game.create_run(registered,'research','fresh-before-exposure');
    expect(await game.get_outcome_fairness(before.run_id)).toMatchObject({run_id:before.run_id,truth_exposure:false,sources:[]});
    await game.confirm_outcome_truth({run_id:source.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:payload.grant.metadata_revision,operation_id:payload.grant.operation_id,payload_digest:payload.grant.payload_digest});
    const fresh=await game.create_run(registered,'research','fresh-after-exposure');
    const expectedSource={run_id:source.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,operation_id:'reveal-source',payload_digest:payload.grant.payload_digest,ack_revision:3};
    expect(await game.get_outcome_fairness(fresh.run_id)).toMatchObject({run_id:fresh.run_id,truth_exposure:true,sources:[expectedSource]});
    const restarted=await game.restart_run(source.run_id,'restart-after-exposure');
    expect(await game.get_outcome_fairness(restarted.run_id)).toMatchObject({run_id:restarted.run_id,truth_exposure:true,sources:[expectedSource]});
    const initialActor=await game.get_actor_view(before.run_id,'R'),newActor=await game.get_actor_view(restarted.run_id,'R');
    expect(newActor).toEqual({...initialActor,run_id:restarted.run_id});
    expect(await new Game(store).get_outcome_fairness(fresh.run_id)).toEqual(await game.get_outcome_fairness(fresh.run_id));
    // Later exposure never rewrites the fairness metadata captured at an earlier creation.
    expect(await game.get_outcome_fairness(before.run_id)).toMatchObject({truth_exposure:false,sources:[]});
    await expect(game.save({run_id:source.run_id,operation_id:'sealed-parent-save',expected_revision:session.finished_seq,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');
  }finally{await store.delete();}
});

test('B24 E37/E38 explicit truth payload permission and successful exposure acknowledgement are separate, idempotent metadata operations; World stays sealed',async()=>{
  const store=new Persistence('b24-owned-t03-explicit-truth');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(initial.run_id),request={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:1,operation_id:'explicit-reveal'};
    await expect(game.request_outcome_truth({...request,run_digest:'0'.repeat(64)})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');
    const truth=await game.request_outcome_truth(request);
    expect(truth).toMatchObject({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,layer:'engine_event',grant:{operation_id:'explicit-reveal',metadata_revision:2},facts:{source:{resources:{energy:16,durability:97,packs:0}}}});
    // An authorized payload that never reaches the UI is not proof of exposure.
    expect(await new Game(store).open_outcome_debrief(initial.run_id)).toMatchObject({default_layer:'known_then',actor:'HQ',metadata_revision:2,truth_exposure:false});
    const reopened=new Game(store),ack={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,operation_id:truth.grant.operation_id,payload_digest:truth.grant.payload_digest,expected_meta_revision:2};
    await expect(reopened.confirm_outcome_truth({...ack,payload_digest:'0'.repeat(64)})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');
    const confirmed=await reopened.confirm_outcome_truth(ack);
    expect(confirmed).toMatchObject({truth_exposure:true,metadata_revision:3});
    expect(await reopened.confirm_outcome_truth(ack)).toEqual(confirmed);
    expect(await reopened.request_outcome_truth(request)).toEqual(truth);
    expect(await reopened.open_outcome_debrief(initial.run_id)).toMatchObject({default_layer:'known_then',actor:'HQ',metadata_revision:3,truth_exposure:true,run_digest:session.run_digest});
    const unfinished=await reopened.get_replay(initial.run_id,0,1);
    await expect(unfinished.request_outcome_truth(request)).rejects.toThrow('DEBRIEF_NOT_AVAILABLE');
    expect(await reopened.get_view(initial.run_id)).toEqual(final);
    expect(Reflect.has(final,'truth')).toBe(false);
  } finally {await store.delete();}
});

test('B24 E34/E38 the receiving boundary verifies actual truth bytes before they can be displayed or acknowledged',async()=>{
  const store=new Persistence('b24-owned-t03-truth-payload-digest');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});
    const session=await game.open_outcome_debrief(initial.run_id),payload=await game.request_outcome_truth({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:session.metadata_revision,operation_id:'reveal'});
    expect(await verify_outcome_truth_digest(payload)).toBe(true);
    const altered=structuredClone(payload);altered.facts.source.resources.energy=15;
    expect(valid_response({request_id:'shape-only',ok:true,outcome_truth:altered})).toBe(true);
    expect(await verify_outcome_truth_digest(altered)).toBe(false);
    expect(await game.open_outcome_debrief(initial.run_id)).toMatchObject({truth_exposure:false});
  } finally {await store.delete();}
});

test('B24 E37/E38 strict truth and exposure channel payloads cannot ride normal views or forged actor/layer fields',async()=>{
  const store=new Persistence('b24-owned-t03-truth-channel');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});
    const session=await game.open_outcome_debrief(initial.run_id),envelope={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:1,operation_id:'reveal'};
    expect(valid_request({kind:'request_outcome_truth',request_id:'truth',envelope})).toBe(true);
    expect(valid_request({kind:'request_outcome_truth',request_id:'truth',envelope:{...envelope,actor:'HQ'}})).toBe(false);
    const outcome_truth=await game.request_outcome_truth(envelope);
    expect(valid_response({request_id:'authorized',ok:true,outcome_truth})).toBe(true);
    expect(valid_response({request_id:'wrong-layer',ok:true,outcome_truth:{...outcome_truth,layer:'known_then'}})).toBe(false);
    expect(valid_response({request_id:'extra',ok:true,outcome_truth:{...outcome_truth,facts:{...outcome_truth.facts,private_hint:'invented'}}})).toBe(false);
    const confirmation={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:outcome_truth.grant.metadata_revision,operation_id:outcome_truth.grant.operation_id,payload_digest:outcome_truth.grant.payload_digest};
    expect(valid_request({kind:'confirm_outcome_truth',request_id:'shown',envelope:confirmation})).toBe(true);
    const truth_confirmation=await game.confirm_outcome_truth(confirmation);
    expect(valid_response({request_id:'confirmed',ok:true,truth_confirmation})).toBe(true);
    expect(valid_response({request_id:'rejected',ok:false,code:'DEBRIEF_QUERY_REJECTED'})).toBe(true);
    const view=await game.get_view(initial.run_id);
    expect(valid_response({request_id:'smuggled',ok:true,view,outcome_truth})).toBe(false);
    expect(valid_response({request_id:'normal',ok:true,view})).toBe(true);
  } finally {await store.delete();}
});
