import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import registered from '../src/core/outcome-definition.json';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {verify_outcome_debrief_digest} from '../src/outcome-dto';
import {parse_outcome_evidence_ref} from '../src/outcome-protocol';
import {outcome_topic} from '../src/core/outcome-evidence';
import {hash} from '../src/core/scenario';

test.each(['R','W'] as const)('B24 E35 %s cost resolves its actual local resource confirmation before HQ receipt without borrowing hidden balances',async actor=>{
 const store=new Persistence('b24-owned-t03-local-cost-'+actor);try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=actor==='R'?await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}}):await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
  const early=(await game.control_clock({run_id:initial.run_id,operation_id:'early',expected_revision:issued.view.revision,intent:{kind:'advance',to:31000}})).view,final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:early.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:early.revision,actor,layer:'known_then',topic:'evidence'},evidence=await game.query_outcome_debrief(query),report=evidence.entries.find(e=>e.ref.kind==='report'&&e.record.phase===(actor==='R'?'completed':'accepted'))!;
  expect(report).toBeDefined();const cost=await game.query_outcome_debrief({...query,topic:'cost'});expect(cost.status).toBe('answered');const ledger=cost.entries.find(e=>e.ref.id==='LEDGER-'+report.ref.id)!;expect(ledger).toBeDefined();expect(ledger.record).toEqual(Reflect.get(report.record.confirmation as object,'resources'));expect(ledger.ref).toMatchObject({actor_scope:actor,layer:'known_then',kind:'ledger',recorded_at:report.ref.recorded_at,received_at:{kind:'unknown'}});expect(await game.resolve_outcome_evidence({...query,topic:'cost',ref:ledger.ref})).toMatchObject({status:'answered',entry:ledger,history:{revision:early.revision,actor,layer:'known_then'}});
  if(actor==='R'){const hq=await game.query_outcome_debrief({...query,actor:'HQ',topic:'cost'});expect(hq.entries.some(e=>e.ref.source_digest===ledger.ref.source_digest)).toBe(false);}
  expect(await game.get_view(initial.run_id)).toEqual(final);
 }finally{await store.delete();}
});

test('B24 E35 HQ cost indexes only its already public processing energy and reservation account at the selected committed node',async()=>{
 const store=new Persistence('b24-owned-t03-hq-processing-cost');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),planned=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'准备记录材料',repair_packs:2}}})).view;
  if(planned.scenario_kind!=='play_outcome'||!planned.plan)throw Error('Actual preparation plan missing');const prepared=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:planned.revision,intent:{kind:'request_preparation',plan_ref:planned.plan.ref}})).view,final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:prepared.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id);
  if(final.scenario_kind!=='play_outcome')throw Error('Actual outcome required');expect(final.processing).toMatchObject({energy_confirmed:14,energy_reserved:0});
  const query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'cost'},cost=await game.query_outcome_debrief(query);expect(cost.status).toBe('answered');const ledger=cost.entries.find(e=>e.ref.id==='HQ-PROCESSING-node-'+final.revision)!;expect(ledger).toBeDefined();expect(ledger.record).toEqual(final.processing);expect(ledger.ref).toMatchObject({kind:'ledger',actor_scope:'HQ',recorded_at:{kind:'known',value:910000},received_at:{kind:'unknown'}});expect(await game.resolve_outcome_evidence({...query,ref:ledger.ref})).toMatchObject({status:'answered',entry:ledger});expect(await game.get_view(initial.run_id)).toEqual(final);
 }finally{await store.delete();}
});

test('B24 E33 independent damaged Debrief validation input retains its report index but missing attachment and cause cannot become media or objective explanations',async()=>{
 const store=new Persistence('b24-owned-t03-missing-media-validation');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},original=await game.query_outcome_debrief(query),source=original.entries.find(e=>e.ref.kind==='report')!;
  // This owned validation-only record is never written to the Game, normal
  // source package or user storage, and is not claimed as a real World report.
  const raw={...structuredClone(source.record),id:'OWNED-FAULT-REPORT',attachment_refs:['owned-missing-attachment'],phase:'hold',reason:'已有记录的等待条件'},fixture={ref:{...structuredClone(source.ref),id:'OWNED-FAULT-REPORT',source_digest:await hash(raw)},record:raw},damaged=outcome_topic('evidence',[fixture])!;
  expect(damaged.entries).toEqual([fixture]);expect(damaged.missing).toContain('附件缺失，无法评价该内容。');expect(damaged).not.toHaveProperty('media');expect(damaged).not.toHaveProperty('objective_cause');
  const waiting=outcome_topic('why_wait',[fixture])!;expect(waiting.entries).toEqual([fixture]);expect(waiting.missing).toContain('实际原因记录缺失，无法评价客观因果；已记录条件不代表当时心理理由。');expect(raw).not.toHaveProperty('cause_ids');expect(await game.query_outcome_debrief(query)).toEqual(original);expect(await game.get_view(initial.run_id)).toEqual(final);expect(await game.get_receipt(initial.run_id,'OWNED-FAULT-REPORT')).toBeNull();
 }finally{await store.delete();}
});

test.each(['kind','layer','actor_scope'])('B24 E34 a JSON array cannot alias the closed evidence reference string field %s',field=>{
  const ref={run_id:'owned-boundary-run',kind:'report',id:'actual-shape',version:1,layer:'known_then',actor_scope:'HQ',recorded_at:{kind:'unknown'},received_at:{kind:'unknown'},source_digest:'0'.repeat(64)};
  const query={run_id:ref.run_id,run_digest:'1'.repeat(64),finished_seq:1,as_of_revision:1,actor:'HQ',layer:'known_then',topic:'evidence',ref};
  expect(valid_request({kind:'resolve_outcome_evidence',request_id:'valid',query})).toBe(true);
  const malformed={...ref,[field]:[Reflect.get(ref,field)]};
  expect(valid_request({kind:'resolve_outcome_evidence',request_id:'malformed',query:{...query,ref:malformed}})).toBe(false);
  expect(()=>parse_outcome_evidence_ref(malformed)).toThrow('INVALID_REQUEST');
});

test('B24 E32/E35 INTEL and H retain their actual local verification and receipt records before HQ delivery; source costs remain local',async()=>{
  const store=new Persistence('b24-owned-t03-local-roles');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    let view:Awaited<ReturnType<Game['create_run']>>=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'local-verification',expected_revision:view.revision,intent:{kind:'advance',to:106000}})).view;const localNode=view.revision;
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:localNode,actor:'INTEL',layer:'known_then',topic:'evidence'};
    const intel=await game.query_outcome_debrief(query);expect(intel.entries.some(entry=>entry.ref.kind==='report'&&Array.isArray(entry.record.personnel))).toBe(true);
    const hq=await game.query_outcome_debrief({...query,actor:'HQ'});expect(hq.entries.some(entry=>entry.ref.kind==='report'&&Array.isArray(entry.record.personnel))).toBe(false);
    const h=await game.query_outcome_debrief({...query,actor:'H'});expect(h.entries.filter(entry=>entry.ref.kind==='receipt'&&typeof entry.record.person_id==='string')).toHaveLength(3);
    const source=await game.query_outcome_debrief({...query,actor:'ArchiveSource',topic:'cost'});expect(source).toMatchObject({status:'answered',entries:[{record:{energy:16,durability:97,packs:0}}]});
    expect(hq.entries.some(entry=>entry.ref.kind==='ledger'&&entry.record.energy===16&&entry.record.durability===97)).toBe(false);
    expect(await game.get_view(initial.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B24 E35 the eight closed topics use actual records, identify missing material, and keep unknown questions unsupported without new World events',async()=>{
  const store=new Persistence('b24-owned-t03-eight-topics');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    let view:Awaited<ReturnType<Game['create_run']>>=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'};
    for(const topic of ['when_known','evidence','when_delivered','why_wait','cost','contradiction','handover_gap','outcome_vs_evaluation']){
      const answer=await game.query_outcome_debrief({...query,topic});expect(['answered','insufficient_record']).toContain(answer.status);expect(answer.topic).toBe(topic);
      if(answer.status==='insufficient_record')expect(answer.missing.length).toBeGreaterThan(0);
      if(topic==='cost'){expect(answer.status).toBe('answered');expect(answer.entries.every(entry=>entry.ref.kind==='ledger')).toBe(true);}
      if(topic==='when_delivered')expect(answer.entries.every(entry=>entry.ref.kind==='delivery')).toBe(true);
      expect(await verify_outcome_debrief_digest(answer)).toBe(true);
    }
    for(const topic of ['export','counterfactual','free_model','player_two_slots','unknown_topic','请替我猜猜大家的心理'])expect(await game.query_outcome_debrief({...query,topic})).toMatchObject({status:'unsupported',entries:[],missing:['请选择已提供的八个结构化主题；自由解析、导出和反事实当前未提供。']});
    expect(await game.get_view(initial.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B24 E36 HQ resolves actual report, delivery, decision, continuation event, reported resource ledger and administrative receipt as distinct original records',async()=>{
  const store=new Persistence('b24-owned-t03-hq-record-kinds');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    let view:Awaited<ReturnType<Game['create_run']>>=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
    view=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},answer=await game.query_outcome_debrief(query);
    expect([...new Set(answer.entries.map(entry=>entry.ref.kind))].sort()).toEqual(['decision','delivery','event','ledger','receipt','report']);
    for(const kind of ['decision','delivery','event','ledger','receipt','report']){
      const entry=answer.entries.find(item=>item.ref.kind===kind);if(!entry)throw Error('Actual '+kind+' missing');
      const resolution=await game.resolve_outcome_evidence({...query,ref:entry.ref});expect(resolution).toMatchObject({status:'answered',entry,history:{read_only:true,actor:'HQ',layer:'known_then'}});
    }
    expect(await game.get_view(initial.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B24 E34/E36 an actual lawful evidence query and original-node resolution cross only their strict channel and verified source bytes',async()=>{
  const store=new Persistence('b24-owned-t03-evidence-channel');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});
    const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'};
    expect(valid_request({kind:'query_outcome_debrief',request_id:'query',query})).toBe(true);
    expect(valid_request({kind:'query_outcome_debrief',request_id:'extra',query:{...query,include_private:true}})).toBe(false);
    const debrief_answer=await game.query_outcome_debrief(query);expect(debrief_answer.entries.length).toBeGreaterThan(0);
    expect(valid_response({request_id:'answer',ok:true,debrief_answer})).toBe(true);expect(await verify_outcome_debrief_digest(debrief_answer)).toBe(true);
    const altered=structuredClone(debrief_answer);altered.entries[0].record.private_hint='not in the original record';expect(await verify_outcome_debrief_digest(altered)).toBe(false);
    const request={...query,ref:debrief_answer.entries[0].ref};
    expect(valid_request({kind:'resolve_outcome_evidence',request_id:'resolve',query:request})).toBe(true);
    expect(valid_request({kind:'resolve_outcome_evidence',request_id:'forged',query:{...request,ref:{...request.ref,include_private:true}}})).toBe(false);
    const evidence_resolution=await game.resolve_outcome_evidence(request);expect(evidence_resolution.status).toBe('answered');
    expect(valid_response({request_id:'resolved',ok:true,evidence_resolution})).toBe(true);expect(await verify_outcome_debrief_digest(evidence_resolution)).toBe(true);
    expect(valid_response({request_id:'smuggled',ok:true,debrief_answer,view:initial})).toBe(false);
  }finally{await store.delete();}
});

test('B24 E32/E36 R actual arrival observation stays at its committed local time, while HQ as-of before delivery cannot acquire it',async()=>{
  const store=new Persistence('b24-owned-t03-local-observation');
  try {
    const game=new Game(store);let view=await game.create_run(registered,'research','create');
    const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'R-to-A',expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;
    view=(await game.control_clock({run_id:run,operation_id:'local-arrival',expected_revision:view.revision,intent:{kind:'advance',to:31000}})).view;
    const atArrival=view.revision;if(view.scenario_kind!=='play_outcome')throw Error('Owned outcome view missing');expect(view.actors[0].position_scope).toBe('H');
    view=(await game.control_clock({run_id:run,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(run),query={run_id:run,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:atArrival,actor:'R',layer:'known_then',topic:'evidence'};
    const local=await game.query_outcome_debrief(query);
    expect(local).toMatchObject({status:'answered',actor:'R',layer:'known_then',as_of_revision:atArrival});
    const observation=local.entries.find(e=>e.ref.kind==='local_observation'&&Reflect.get(e.record,'phase')==='completed');
    // Frozen B23 acceptance baseline: issue0/start1000/arrival30500/HQ31500.
    // The chosen31000 commit is after the observation but before HQ receipt.
    expect(observation).toMatchObject({ref:{kind:'local_observation',actor_scope:'R',recorded_at:{kind:'known',value:30500},received_at:{kind:'unknown'}},record:{actor:'R',at:30500,phase:'completed',source_event_time:{kind:'unknown'},confirmation:{position:{site:'A'}}}});
    const hq=await game.query_outcome_debrief({...query,actor:'HQ'});
    expect(hq.entries.some(e=>e.ref.kind==='local_observation')).toBe(false);
    expect(hq.entries.some(e=>Reflect.get(e.record,'phase')==='completed')).toBe(false);
    expect(await game.get_view(run)).toEqual(view);
  } finally {await store.delete();}
});

test('B24 E34/E36 an observation reference resolves only its original actor/layer/digest and actual committed node; forged or future references disclose nothing',async()=>{
  const store=new Persistence('b24-owned-t03-reference-binding');
  try {
    const game=new Game(store);let view=await game.create_run(registered,'research','create');
    const run=view.run_id,ref=(kind:string,id:string)=>({run_id:run,kind,id,version:1});
    view=(await game.apply_outcome_intent({run_id:run,operation_id:'R-to-A',expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view;
    view=(await game.control_clock({run_id:run,operation_id:'arrived',expected_revision:view.revision,intent:{kind:'advance',to:31000}})).view;
    const atArrival=view.revision;
    view=(await game.control_clock({run_id:run,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
    const session=await game.open_outcome_debrief(run),query={run_id:run,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:atArrival,actor:'R',layer:'known_then',topic:'evidence'};
    const evidence=await game.query_outcome_debrief(query),entry=evidence.entries.find(e=>e.ref.kind==='local_observation'&&Reflect.get(e.record,'phase')==='completed');if(!entry)throw Error('Actual observation missing');
    const resolved=await game.resolve_outcome_evidence({...query,ref:entry.ref});
    expect(resolved).toMatchObject({status:'answered',entry,history:{run_id:run,revision:atArrival,at:31000,actor:'R',layer:'known_then',read_only:true}});
    const fromEnding=await game.resolve_outcome_evidence({...query,as_of_revision:session.finished_seq,ref:entry.ref});
    expect(fromEnding).toMatchObject({status:'answered',entry,history:{run_id:run,revision:atArrival,at:31000,actor:'R',layer:'known_then',read_only:true}});
    const forged=[{...entry.ref,run_id:'other-owned-run'},{...entry.ref,kind:'event'},{...entry.ref,version:2},{...entry.ref,source_digest:'0'.repeat(64)},{...entry.ref,id:'missing-observation'},{...entry.ref,layer:'engine_event'},{...entry.ref,actor_scope:'HQ'}];
    for(const changed of forged){const response=await game.resolve_outcome_evidence({...query,ref:changed});expect(response.status).toBe('rejected');expect(Reflect.has(response,'entry')).toBe(false);expect(Reflect.has(response,'history')).toBe(false);}
    expect(await game.resolve_outcome_evidence({...query,actor:'HQ',ref:entry.ref})).toMatchObject({status:'rejected'});
    expect(await game.resolve_outcome_evidence({...query,as_of_revision:1,ref:entry.ref})).toMatchObject({status:'rejected'});
    expect(await game.get_view(run)).toEqual(view);
  } finally {await store.delete();}
});


test('B24 E27/E34 HQ cites actually received INTEL products and their deliveries without rewriting assessments as source reports',async()=>{
  const store=new Persistence('b24-owned-t03-hq-products');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    const plan=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'记录回收',repair_packs:2}}});
    if(plan.view.scenario_kind!=='play_outcome'||!plan.view.plan)throw Error('Actual plan missing');
    const preparation=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:plan.view.revision,intent:{kind:'request_preparation',plan_ref:plan.view.plan.ref}}),before=preparation.view.revision;
    const received=(await game.control_clock({run_id:initial.run_id,operation_id:'receive-products',expected_revision:before,intent:{kind:'advance',to:200000}})).view;
    if(received.scenario_kind!=='play_outcome')throw Error('Outcome view missing');expect(received.preparation_results).toHaveLength(1);const product=received.preparation_results[0];
    const later=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan-later',expected_revision:received.revision,intent:{kind:'save_plan',base_plan_ref:received.plan!.ref,draft:{purpose:'记录回收的后续计划',repair_packs:2}}});
    await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:later.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:received.revision,actor:'HQ',layer:'known_then',topic:'evidence'};
    const answer=await game.query_outcome_debrief(query),entry=answer.entries.find(e=>e.ref.id===product.result.ref.id);
    expect(entry).toMatchObject({ref:{kind:'event',actor_scope:'HQ',received_at:{kind:'known',value:product.delivery.received}},record:product.result});
    expect(answer.entries.find(e=>e.ref.id===product.delivery.ref.id)).toMatchObject({ref:{kind:'delivery'},record:product.delivery});
    expect(answer.entries.some(e=>e.ref.id===product.result.ref.id&&e.ref.kind==='report')).toBe(false);
    expect((await game.query_outcome_debrief({...query,as_of_revision:before})).entries.some(e=>e.ref.id===product.result.ref.id)).toBe(false);
    expect(later.view.scenario_kind==='play_outcome'&&later.view.decision_records.at(-1)!.known_then_refs.some(e=>e.id===product.result.ref.id)).toBe(true);
  }finally{await store.delete();}
});


test('B24 E34/E36 a real rejected decision resolves at the first subsequent committed node and cannot backfill its source node or other actor',async()=>{
 const store=new Persistence('b24-owned-t03-rejected-original-reference');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),before=(await game.control_clock({run_id:initial.run_id,operation_id:'to-1000',expected_revision:initial.revision,intent:{kind:'advance',to:1000}})).view;
  await expect(game.apply_outcome_intent({run_id:initial.run_id,operation_id:'stale',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).rejects.toThrow('STALE_REVISION');
  const log=(await game.get_outcome_rejections(initial.run_id))[0];const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:before.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'outcome_vs_evaluation'};
  const answer=await game.query_outcome_debrief(query),entry=answer.entries.find(entry=>entry.ref.id===log.ref.id);expect(entry).toMatchObject({ref:{kind:'decision',actor_scope:'HQ',recorded_at:{kind:'known',value:1000},received_at:{kind:'known',value:1000}},record:log});if(!entry)throw Error('Original rejection missing');
  expect([...answer.notes,...answer.missing].some(note=>note.includes('尚未提供'))).toBe(false);expect(valid_response({request_id:'rejected-reference',ok:true,debrief_answer:answer})).toBe(true);expect(await verify_outcome_debrief_digest(answer)).toBe(true);
  expect((await game.query_outcome_debrief({...query,as_of_revision:before.revision})).entries.some(entry=>entry.ref.id===log.ref.id)).toBe(false);
  const resolved=await game.resolve_outcome_evidence({...query,ref:entry.ref});expect(resolved).toMatchObject({status:'answered',entry,history:{run_id:initial.run_id,revision:final.revision,read_only:true}});
  expect(await game.resolve_outcome_evidence({...query,as_of_revision:before.revision,ref:entry.ref})).toMatchObject({status:'rejected'});expect(await game.resolve_outcome_evidence({...query,actor:'R',ref:entry.ref})).toMatchObject({status:'rejected'});expect(await game.get_view(initial.run_id)).toEqual(final);
 }finally{await store.delete();}
});
test('B24 E27/E34 actual declared reasons keep a separate layer, original decision and first commit; absent reasons remain explicitly not recorded',async()=>{
 const store=new Persistence('b24-owned-t03-declared-reason-layer');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const stated=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[],reason:'先取得A记录；这不是后来对结局的解释。'}});
  const unstated=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:stated.view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得记录',repair_packs:2}}});await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:unstated.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'declared_reason',topic:'evidence'};
  const answer=await game.query_outcome_debrief(query);expect(answer.status).toBe('answered');expect(answer.entries).toHaveLength(2);expect(answer.entries.map(entry=>entry.ref.layer)).toEqual(['declared_reason','declared_reason']);expect(answer.entries[0].record).toMatchObject({decision_ref:stated.view.decision_records[0].ref,reason:{kind:'recorded',text:'先取得A记录；这不是后来对结局的解释。'}});expect(answer.entries[1].record).toMatchObject({reason:{kind:'not_recorded'}});
  const original=await game.resolve_outcome_evidence({...query,ref:answer.entries[0].ref});expect(original).toMatchObject({status:'answered',history:{revision:stated.view.revision,actor:'HQ',layer:'declared_reason',read_only:true}});expect(await game.resolve_outcome_evidence({...query,as_of_revision:initial.revision,ref:answer.entries[0].ref})).toMatchObject({status:'rejected'});expect((await game.query_outcome_debrief({...query,actor:'R'})).entries).toEqual([]);expect((await game.query_outcome_debrief({...query,as_of_revision:initial.revision})).entries).toEqual([]);expect((await game.get_view(initial.run_id) as typeof stated.view).decision_records[0]).toEqual(stated.view.decision_records[0]);
 }finally{await store.delete();}
});
