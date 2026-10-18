import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import registered from '../src/core/outcome-definition.json';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {hash} from '../src/core/scenario';
import {evaluate_outcome_decision_record,evaluate_outcome_rejection} from '../src/core/outcome-evaluation';
import type {OutcomeDefinition} from '../src/core/outcome-definition';
import {create_outcome_participant_template,create_outcome_debrief,outcome_truth_facts} from '../src/core/outcome-debrief';
import {project_outcome_view} from '../src/core/outcome-knowledge';
import {hq_outcome_evidence,outcome_topic} from '../src/core/outcome-evidence';
import type {OutcomeDebriefAnswer} from '../src/outcome-contracts';

test('B24 E29/E61 paired private-fact validation inputs preserve the actual HQ records, default summary, topic order and original decision dimensions without persisting an altered World',async()=>{
 const store=new Persistence('b24-owned-t03-paired-private-projection');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}}),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),sealed=await store.snapshot(initial.run_id,final.revision),signing=await store.snapshot(initial.run_id,issued.view.revision);
  if(sealed?.schema!==10||signing?.schema!==10)throw Error('Actual sealed and signing records required');
  const saved=structuredClone(sealed),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},actual=await game.query_outcome_debrief(query),receipts=await Promise.all(sealed.inputs.map(async input=>{const receipt=await store.receipt(initial.run_id,input.envelope.operation_id);if(!receipt)throw Error('Actual input receipt missing');return {...receipt};}));
  const baselineView=project_outcome_view(sealed),baselineRecords=await hq_outcome_evidence(baselineView,receipts);expect(baselineView).toEqual(final);expect(baselineRecords).toEqual(actual.entries);expect(sealed.local_observations.length).toBeGreaterThan(0);
  // Independent projection-validation copy only. Its original integrity is
  // deliberately not offered to Snapshot/Game as a valid or playable World.
  const changed=structuredClone(sealed);changed.prefix.source.resources.energy-=1;changed.local_observations=[];
  expect(outcome_truth_facts(changed).source.resources.energy).toBe(outcome_truth_facts(sealed).source.resources.energy-1);expect(outcome_truth_facts(changed)).not.toEqual(outcome_truth_facts(sealed));expect(changed.local_observations.length).not.toBe(sealed.local_observations.length);
  const changedView=project_outcome_view(changed),changedRecords=await hq_outcome_evidence(changedView,receipts);expect(changedView).toEqual(baselineView);expect(changedRecords).toEqual(baselineRecords);
  const baselineSummary=create_outcome_debrief(baselineView,session.run_digest),changedSummary=create_outcome_debrief(changedView,session.run_digest);expect(changedSummary).toEqual(baselineSummary);expect(changedSummary).not.toHaveProperty('participant_index');expect(changedSummary).not.toHaveProperty('participants');expect(valid_response({request_id:'paired-public',ok:true,view:changedView})).toBe(true);
  for(const topic of ['when_known','evidence','when_delivered','why_wait','cost','contradiction','handover_gap','outcome_vs_evaluation','unsupported-free-text'])expect(outcome_topic(topic,changedRecords)).toEqual(outcome_topic(topic,baselineRecords));
  const decision=issued.view.decision_records[0],receipt=await game.get_receipt(initial.run_id,'R-to-A');if(!receipt)throw Error('Actual signing receipt missing');const signingEvidence=await hq_outcome_evidence(project_outcome_view(signing)),binding={run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},normal=await game.evaluate_outcome_decision({...binding,decision_ref:decision.ref});
  // The evaluation seam consumes the actual signing evidence, not either
  // later private-state variant. Check the actual original record for both.
  for(const later of [sealed,changed]){expect(project_outcome_view(later).decision_records[0]).toEqual(decision);const evaluation=await evaluate_outcome_decision_record(project_outcome_view(later).decision_records[0],registered as unknown as OutcomeDefinition,binding,{receipt,evidence:signingEvidence});expect(evaluation).toEqual(normal);expect(evaluation.dimensions.map(d=>d.result)).toEqual([2,2,1,1]);}
  expect(await store.snapshot(initial.run_id,final.revision)).toEqual(saved);expect(await game.get_view(initial.run_id)).toEqual(final);expect(await game.open_outcome_debrief(initial.run_id)).toEqual(session);
 }finally{await store.delete();}
});

test('B24 E31 independent missing-local-record validation preserves the actual active actor and explicit gap without inventing a statement or changing the saved template',async()=>{
 const store=new Persistence('b24-owned-t03-participant-missing-record');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}}),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),binding={run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},saved=await game.get_outcome_participants(binding),anchor=await store.outcome_debrief_anchor(initial.run_id);
  if(!anchor)throw Error('Actual sealed participant anchor missing');
  const sources=new Map<string,OutcomeDebriefAnswer['entries']>();for(const actor of ['HQ','INTEL','R','W','ArchiveSource','H'])sources.set(actor,(await game.query_outcome_debrief({...binding,as_of_revision:session.finished_seq,actor,layer:'known_then',topic:'evidence'})).entries);
  expect(sources.get('R')!.length).toBeGreaterThan(0);expect(anchor.participant_index.find(p=>p.actor==='R')!.activity_refs.length).toBeGreaterThan(0);
  // Owned validation-only damaged input: original active index remains real;
  // remove only this validation copy's local evidence, never normal storage.
  const damaged=new Map(sources);damaged.set('R',[]);const result=create_outcome_participant_template(anchor,damaged),participant=result.participants.find(p=>p.actor==='R')!;
  expect(participant).toMatchObject({participation:'participated',declaration:'record_missing',claims:[]});expect(participant.missing).toEqual(['有本局活动索引，但缺少可引用的当地记录；无声明／记录缺失，无法补写原因。']);expect(result.participants.map(p=>p.actor)).toEqual(['HQ','INTEL','R','W','ArchiveSource','H']);expect(result.participants.find(p=>p.actor==='W')).toMatchObject({participation:'not_participated',claims:[]});
  expect(await game.get_outcome_participants(binding)).toEqual(saved);expect(await game.get_view(initial.run_id)).toEqual(final);expect(sources.get('R')!.length).toBeGreaterThan(0);
 }finally{await store.delete();}
});

test('B24 E31/E34 actual participant template uses a closed explicit channel and rejects private index, invented speech, mixed views and corrupted returned bytes',async()=>{
 const store=new Persistence('b24-owned-t03-participant-channel');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),query={run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},request={kind:'get_outcome_participants',request_id:'explicit-participants',query};
  expect(valid_request(request)).toBe(true);for(const changed of [{...query,actor:'HQ'},{...query,truth:true},{...query,finished_seq:[session.finished_seq]},{...query,run_digest:'forged'}])expect(valid_request({...request,query:changed})).toBe(false);
  const template=await game.get_outcome_participants(query),receipt={template,source_digest:await hash(template)},response={request_id:request.request_id,ok:true,debrief_participants:receipt};expect(valid_response(response)).toBe(true);expect(valid_response({...response,view:await game.get_view(initial.run_id)})).toBe(false);
  for(const changed of [{...template,participant_index:[]},{...template,branch_comparison:'computed'},{...template,agenda:template.agenda.slice(1)},{...template,participants:template.participants.map((p,i)=>i===0?{...p,claims:p.claims.map(c=>({...c,speaker_mode:'recorded_speech'}))}:p)},{...template,participants:template.participants.map((p,i)=>i===0?{...p,actor:'invented-enemy'}:p)}])expect(valid_response({...response,debrief_participants:{...receipt,template:changed}})).toBe(false);
  const {verify_outcome_participant_receipt}=await import('../src/outcome-dto');
  expect(await verify_outcome_participant_receipt(receipt)).toBe(true);
  const corrupted={...template,participants:template.participants.map((p,i)=>i===0?{...p,claims:p.claims.map(c=>({...c,text:'篡改后的模板文字'}))}:p)};
  expect(await verify_outcome_participant_receipt({...receipt,template:corrupted})).toBe(false);
 }finally{await store.delete();}
});

test('B24 E30/E31 explicit actual participant template is persisted once with five agenda entries, lawful role refs and no invented speech or branch result',async()=>{
 const store=new Persistence('b24-owned-t03-participant-template');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}}),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),binding={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq};
  const template=await game.get_outcome_participants(binding);expect(template).toMatchObject({...binding,template_version:'B24-DEBRIEF-1',agenda:['task_outcome','timeline','participants','coordination','questions'],branch_comparison:'not_provided'});expect(template.participants.map(p=>p.actor)).toEqual(['HQ','INTEL','R','W','ArchiveSource','H']);expect(template.participants.find(p=>p.actor==='R')).toMatchObject({participation:'participated',declaration:'not_recorded'});expect(template.participants.find(p=>p.actor==='W')).toMatchObject({participation:'not_participated',claims:[]});
  for(const participant of template.participants){const originals=await game.query_outcome_debrief({...binding,as_of_revision:session.finished_seq,actor:participant.actor,layer:'known_then',topic:'evidence'});for(const claim of participant.claims){expect(claim).toMatchObject({speaker_mode:'template',layer:'known_then',actor_scope:participant.actor});expect(claim.evidence_refs.length).toBeGreaterThan(0);for(const ref of claim.evidence_refs)expect(originals.entries.map(e=>e.ref)).toContainEqual(ref);}if(participant.participation==='participated'&&participant.claims.length===0)expect(participant.missing.length).toBeGreaterThan(0);}
  expect(session).not.toHaveProperty('participants');expect(await game.get_view(initial.run_id)).toEqual(final);await expect(game.get_outcome_participants({...binding,run_digest:'0'.repeat(64)})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');expect(await game.get_outcome_participants(binding)).toEqual(template);expect(await new Game(store).get_outcome_participants(binding)).toEqual(template);
 }finally{await store.delete();}
});

test('B24 E31 participant activities after a real W return and H/INTEL continuation index actual sealed record collections rather than invented grouping paths',async()=>{
 const store=new Persistence('b24-owned-t03-index-paths');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}}),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,sealed=await store.snapshot(initial.run_id,final.revision),anchor=await store.outcome_debrief_anchor(initial.run_id),index=Reflect.get(anchor!,'participant_index') as Array<{actor:string;activity_refs:string[]}>;
  expect(index.filter(p=>['W','H','INTEL'].includes(p.actor)).every(p=>p.activity_refs.length>0)).toBe(true);
  for(const participant of index)for(const reference of participant.activity_refs){const [path,id]=reference.split(':'),collection=path.split('.').reduce<unknown>((value,key)=>value!==null&&typeof value==='object'?Reflect.get(value,key):undefined,sealed);expect(collection,reference).toBeDefined();if(id){expect(Array.isArray(collection),reference).toBe(true);expect((collection as Array<Record<string,unknown>>).some(row=>row.id===id||row.ref&&Reflect.get(row.ref as object,'id')===id||row.report_ref&&Reflect.get(row.report_ref as object,'id')===id||row.envelope&&Reflect.get(row.envelope as object,'operation_id')===id),reference).toBe(true);}}
 }finally{await store.delete();}
});

test('B24 E30/E31 first terminal transaction seals an actual participant index privately, retaining silent activities and zero-activity registration without default counts',async()=>{
 const store=new Persistence('b24-owned-t03-participant-anchor');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}}),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,sealed=await store.snapshot(initial.run_id,final.revision),anchor=await store.outcome_debrief_anchor(initial.run_id);
  expect(anchor).toHaveProperty('participant_index');const index=Reflect.get(anchor!,'participant_index') as Array<{actor:string;activity_refs:string[]}>;expect(index.map(p=>p.actor)).toEqual(['HQ','INTEL','R','W','ArchiveSource','H']);if(sealed?.schema!==10)throw Error('actual sealed outcome required');expect(sealed.prefix.field.reports.length).toBeGreaterThan(0);expect(index.find(p=>p.actor==='R')!.activity_refs).toContain('prefix.field.reports:'+sealed.prefix.field.reports[0].ref.id);expect(index.find(p=>p.actor==='HQ')!.activity_refs).toContain('decision_records:'+issued.view.decision_records[0].ref.id);expect(index.find(p=>p.actor==='W')!.activity_refs).toEqual([]);expect(index.find(p=>p.actor==='H')!.activity_refs).toEqual([]);
  const publicState=await game.get_outcome_debrief_state(initial.run_id);expect(publicState).not.toHaveProperty('participant_index');const session=await game.open_outcome_debrief(initial.run_id);expect(session).not.toHaveProperty('participant_index');expect(session).not.toHaveProperty('participants');expect(valid_response({request_id:'default-no-index',ok:true,debrief:session})).toBe(true);expect(valid_response({request_id:'forged-index',ok:true,debrief:{...session,participant_index:index}})).toBe(false);
  const before=structuredClone(index);await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'save-finished',expected_revision:final.revision,intent:{kind:'save'}});expect(Reflect.get((await store.outcome_debrief_anchor(initial.run_id))!,'participant_index')).toEqual(before);expect((await game.open_outcome_debrief(initial.run_id)).finished_seq).toBe(final.revision);expect((await new Game(store).get_outcome_debrief_state(initial.run_id))!.run_digest).toBe(anchor!.run_digest);
 }finally{await store.delete();}
});

test('B24 E28/E29 one actual W return is evaluated per decision from its original evidence, without penalizing unrelated R or adding an Outcome total',async()=>{
  const store=new Persistence('b24-owned-t03-decision-matrix');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id);
    const evaluation=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:issued.view.decision_records[0].ref});
    expect(evaluation.profile_ref).toMatchObject({id:'B24-DQ-01',version:1});
    const query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:issued.view.decision_records[0].ref};
    expect(valid_request({kind:'evaluate_outcome_decision',request_id:'matrix',query})).toBe(true);
    for(const changed of [{...query,extra:true},{...query,finished_seq:'2'},{...query,decision_ref:{...query.decision_ref,run_id:'other-run'}},{...query,decision_ref:{...query.decision_ref,kind:['decision_record']}}])expect(valid_request({kind:'evaluate_outcome_decision',request_id:'bad',query:changed})).toBe(false);
    expect(valid_response({request_id:'matrix',ok:true,decision_evaluation:evaluation})).toBe(true);
    expect(valid_response({request_id:'mixed',ok:true,decision_evaluation:evaluation,view:final})).toBe(false);
    expect(valid_response({request_id:'score',ok:true,decision_evaluation:{...evaluation,total:6}})).toBe(false);
    expect(valid_response({request_id:'score',ok:true,decision_evaluation:{...evaluation,dimensions:evaluation.dimensions.map((d,index)=>index===0?{...d,result:99}:d)}})).toBe(false);
    for(const invalid of [{index:3,result:'not_evaluable',matched:['V1:violated']},{index:2,result:1,matched:['V1']},{index:0,result:0,matched:[]}])expect(valid_response({request_id:'wrong-condition',ok:true,decision_evaluation:{...evaluation,dimensions:evaluation.dimensions.map((d,index)=>index===invalid.index?{...d,result:invalid.result,matched_conditions:invalid.matched}:d)}})).toBe(false);


    expect(evaluation.dimensions.map(d=>({rule:d.rule_ref.id,result:d.result}))).toEqual([{rule:'DQ-E',result:2},{rule:'DQ-A',result:2},{rule:'DQ-C',result:1},{rule:'DQ-V',result:1}]);
    expect(evaluation.dimensions.every(d=>d.necessary_refs.length>0&&d.known_then_refs.every(r=>r.actor_scope==='HQ'&&r.layer==='known_then'))).toBe(true);
    expect(Reflect.has(evaluation,'total')).toBe(false);expect(Reflect.has(evaluation,'ranking')).toBe(false);expect(evaluation.reason_status).toBe('not_recorded');
    expect(await game.get_view(initial.run_id)).toEqual(final);
  }finally{await store.delete();}
});

test('B24 E27 the original HQ lawful evidence reference set is captured at signing and cannot acquire later delivered reports',async()=>{
  const store=new Persistence('b24-owned-t03-decision-lawful-evidence');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
    const decision=issued.view.decision_records[0];expect(Array.isArray(decision.known_then_refs)).toBe(true);
    expect(decision.known_then_refs.every(item=>item.actor_scope==='HQ'&&item.layer==='known_then'&&(item.received_at.kind==='unknown'||item.received_at.value<=decision.at))).toBe(true);
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view;if(final.scenario_kind!=='play_outcome')throw Error('Owned outcome view missing');
    expect(final.decision_records[0].known_then_refs).toEqual(decision.known_then_refs);expect(final.decision_records[0].knowledge_digest).toBe(decision.knowledge_digest);
    const session=await game.open_outcome_debrief(initial.run_id),current=await game.query_outcome_debrief({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'});
    const later=current.entries.find(item=>item.ref.kind==='report'&&item.record.phase==='completed');if(!later)throw Error('Actual later arrival report missing');
    expect(decision.known_then_refs.some(item=>item.id===later.ref.id)).toBe(false);
    expect(valid_response({request_id:'lawful-originals',ok:true,view:final})).toBe(true);
  }finally{await store.delete();}
});

test('B24 E27 an actual confirmation freezes its knowledge revision, operation sequence, selected versions, basis and administrative receipt link before later reports',async()=>{
  const store=new Persistence('b24-owned-t03-decision-source-binding');
  try{
    const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
    const decision=issued.view.decision_records[0];
    expect(decision).toMatchObject({knowledge_revision:1,operation_seq:1,basis_refs:[],selected_versions:{plan_ref:null,activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority')},administrative_receipt_ref:ref('administrative_receipt','R-to-A'),reason:{kind:'not_recorded'}});
    if(initial.scenario_kind!=='play_outcome')throw Error('Owned outcome view missing');
    expect(decision.knowledge).toEqual({actors:initial.actors,received_reports:initial.received_reports,processing:initial.processing,plan:initial.plan});
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view;if(final.scenario_kind!=='play_outcome')throw Error('Owned outcome view missing');
    expect(final.decision_records[0]).toEqual(decision);
    const session=await game.open_outcome_debrief(initial.run_id),answer=await game.query_outcome_debrief({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'});
    expect(answer.entries.find(entry=>entry.ref.kind==='receipt'&&entry.ref.id===decision.administrative_receipt_ref.id)).toMatchObject({record:{operation_id:'R-to-A',revision:issued.receipt.revision,sim_time:0}});
    expect(valid_response({request_id:'bound-source',ok:true,view:final})).toBe(true);
  }finally{await store.delete();}
});

test('B24 E62 repeated draft edits cannot displace the actual abort from a short HQ key-decision summary',async()=>{
  const store=new Persistence('b24-owned-t03-key-decisions');
  try{
    const game=new Game(store);let view=await game.create_run(registered,'research','create');
    for(let edit=1;edit<=3;edit++){
      if(view.scenario_kind!=='play_outcome')throw Error('Owned outcome view missing');
      view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'draft-'+edit,expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:view.plan?.ref??null,draft:{purpose:'尚未签发的草稿 '+edit,repair_packs:2}}})).view;
    }
    view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'actual-abort',expected_revision:view.revision,intent:{kind:'abort_outcome'}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'finish-cleanup',expected_revision:view.revision,intent:{kind:'advance',to:120000}})).view;
    const session=await game.open_outcome_debrief(view.run_id);
    expect(session.summary.key_decisions.map(decision=>({operation_id:decision.operation_id,action:decision.action,reason:decision.reason}))).toEqual([{operation_id:'actual-abort',action:'abort_outcome',reason:{kind:'not_recorded'}}]);
    if(view.scenario_kind!=='play_outcome')throw Error('Owned outcome view missing');
    expect(view.decision_records).toHaveLength(4);expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B24 E30/E61 a real finished run opens one persisted HQ-first debrief, while unfinished runs cannot open it or change their World',async()=>{
  const store=new Persistence('b24-owned-t03-open-finished');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    await expect(game.open_outcome_debrief(initial.run_id)).rejects.toThrow('DEBRIEF_NOT_AVAILABLE');
    expect(await game.get_view(initial.run_id)).toEqual(initial);
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'real-deadline',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
    expect(final).toMatchObject({finished:true,outcome:{result:'failure',finished_at:910000}});
    const session=await game.open_outcome_debrief(initial.run_id);
    expect(session).toMatchObject({run_id:initial.run_id,finished_seq:final.revision,template_version:'B24-DEBRIEF-1',status:'ready',default_layer:'known_then',actor:'HQ',summary:{result:'failure',key_decisions:[],missing_people:['R-person-1','R-person-2','R-person-3','W-person-1','W-person-2','W-person-3']}});
    expect(session.run_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(await new Game(store).open_outcome_debrief(initial.run_id)).toEqual(session);
    expect(await game.get_view(initial.run_id)).toEqual(final);
  } finally {await store.delete();}
});

test('B24 E30/E36 opening a finished read-only parent debrief cannot revoke the active child writer lease',async()=>{
  const store=new Persistence('b24-owned-t03-history-writer-owner');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
    const child=await game.restart_run(initial.run_id,'fresh-child'),parent=await game.get_view(initial.run_id);
    const history=await game.get_replay(initial.run_id,final.sim_time);
    expect(await history.open_outcome_debrief(initial.run_id)).toMatchObject({run_id:initial.run_id,default_layer:'known_then'});
    const saved=await game.save({run_id:child.run_id,operation_id:'current-child-save',expected_revision:child.revision,intent:{kind:'save'}});
    expect(saved.view).toMatchObject({run_id:child.run_id,revision:2,finished:false,source_run:initial.run_id});
    expect(await game.get_view(initial.run_id)).toEqual(parent);
  } finally {await store.delete();}
});

test('B24 E30/E61 the real debrief crosses its own strict channel contract, never normal PlayerView or unfinished permission',async()=>{
  const store=new Persistence('b24-owned-t03-debrief-channel');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    expect(valid_request({kind:'open_outcome_debrief',request_id:'open',run_id:initial.run_id})).toBe(true);
    expect(valid_request({kind:'open_outcome_debrief',request_id:'open',run_id:initial.run_id,truth:true})).toBe(false);
    const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
    const debrief=await game.open_outcome_debrief(initial.run_id);
    expect(valid_response({request_id:'opened',ok:true,debrief})).toBe(true);
    expect(valid_response({request_id:'forged-layer',ok:true,debrief:{...debrief,default_layer:'engine_event'}})).toBe(false);
    expect(valid_response({request_id:'extra-truth',ok:true,debrief:{...debrief,hidden_count:6}})).toBe(false);
    expect(valid_response({request_id:'permission',ok:false,code:'DEBRIEF_NOT_AVAILABLE'})).toBe(true);
    expect(valid_response({request_id:'normal',ok:true,view:final})).toBe(true);
    expect(Reflect.has(final,'debrief')).toBe(false);
  } finally {await store.delete();}
});

test('B24 E30 finished administrative saves retain the original sealed digest and session; an unfinished history node never inherits permission',async()=>{
  const store=new Persistence('b24-owned-t03-sealed-node');
  try {
    const game=new Game(store),initial=await game.create_run(registered,'research','create');
    let view=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
    const first=await game.open_outcome_debrief(initial.run_id);
    view=(await game.save({run_id:initial.run_id,operation_id:'finished-save',expected_revision:view.revision,intent:{kind:'save'}})).view;
    expect(view.revision).toBe(3);
    expect(await new Game(store).open_outcome_debrief(initial.run_id)).toEqual(first);
    const history=await game.get_replay(initial.run_id,0,1);
    await expect(history.open_outcome_debrief(initial.run_id)).rejects.toThrow('DEBRIEF_NOT_AVAILABLE');
    expect(await game.get_view(initial.run_id)).toEqual(view);
  } finally {await store.delete();}
});


test('B24 preserved scenario without decision profile can play but does not silently gain decision evaluation',async()=>{
  const legacy=structuredClone(registered) as unknown as OutcomeDefinition;
  delete legacy.profile.outcome.decision_evaluation;legacy.hashes.profile=await hash(legacy.profile);const {definition_hash:ignored,...body}=legacy;void ignored;legacy.definition_hash=await hash(body);
  const store=new Persistence('b24-owned-t03-legacy-no-evaluation',[],[],[],[legacy]);
  try{
    const game=new Game(store),initial=await game.create_run(legacy,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
    const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
    await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id);
    const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:issued.view.decision_records[0].ref});
    expect(result.profile_ref).toBeNull();expect(result.dimensions.map(d=>d.result)).toEqual(['not_evaluable','not_evaluable','not_evaluable','not_evaluable']);expect(result.dimensions.every(d=>d.missing.some(m=>m.includes('未登记')))).toBe(true);
  }finally{await store.delete();}
});


test('B24 E28 allowed preparation keeps missing optional source evidence and pending work explicit without penalizing absent unrelated teams',async()=>{
 const store=new Persistence('b24-owned-t03-preparation-matrix');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');
  const plan=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得记录',repair_packs:2}}});if(plan.view.scenario_kind!=='play_outcome'||!plan.view.plan)throw Error('Plan missing');
  const request=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:plan.view.revision,intent:{kind:'request_preparation',plan_ref:plan.view.plan.ref}});
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:request.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id);
  const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:request.view.decision_records.at(-1)!.ref});
  expect(result.dimensions.map(d=>d.result)).toEqual([1,2,1,2]);expect(result.dimensions[0].missing.some(m=>m.includes('辅助'))).toBe(true);expect(result.dimensions[2].missing.some(m=>m.includes('待'))).toBe(true);
  expect(result.reason_status).toBe('not_recorded');expect(Reflect.has(result,'total')).toBe(false);
 }finally{await store.delete();}
});


test('B24 E28 source validation uses the selected original source report without treating its claim as a verified result',async()=>{
 const store=new Persistence('b24-owned-t03-source-validation-matrix');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');
  const received=(await game.control_clock({run_id:initial.run_id,operation_id:'receive-source',expected_revision:initial.revision,intent:{kind:'advance',to:86000}})).view;
  const request=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'validate',expected_revision:received.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}]}});
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:request.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id);
  const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:request.view.decision_records.at(-1)!.ref});
  expect(result.dimensions.map(d=>d.result)).toEqual([2,2,1,2]);expect(result.dimensions[0].known_then_refs.some(ref=>ref.id==='R3'&&ref.kind==='report')).toBe(true);expect(result.dimensions[2].missing.some(m=>m.includes('待'))).toBe(true);
 }finally{await store.delete();}
});


test('B24 E28 R first movement evaluates its own registered action and authority while remote acceptance stays pending',async()=>{
 const store=new Persistence('b24-owned-t03-field-matrix');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const request=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'move-R',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:request.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id);
  const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:request.view.decision_records[0].ref});
  expect(result.dimensions.map(d=>d.result)).toEqual([2,2,1,1]);expect(result.dimensions[2].missing.some(m=>m.includes('待'))).toBe(true);expect(result.dimensions[3].matched_conditions).toEqual(['V1']);
 }finally{await store.delete();}
});


test('B24 E28 A record decision uses the already received arrival credential and cannot borrow later completion',async()=>{
 const store=new Persistence('b24-owned-t03-arrived-activity-matrix');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const move=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'move',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
  const arrived=(await game.control_clock({run_id:initial.run_id,operation_id:'arrived',expected_revision:move.view.revision,intent:{kind:'advance',to:32000}})).view;
  const request=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'record-A',expected_revision:arrived.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','A-record'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:request.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id);
  const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:request.view.decision_records.at(-1)!.ref});
  expect(result.dimensions.map(d=>d.result)).toEqual([2,2,1,1]);expect(result.dimensions[0].known_then_refs.some(ref=>ref.kind==='report'&&ref.recorded_at.kind==='known'&&ref.recorded_at.value===30500)).toBe(true);expect(result.dimensions[0].known_then_refs.some(ref=>ref.recorded_at.kind==='known'&&ref.recorded_at.value>32000)).toBe(false);
 }finally{await store.delete();}
});


test('B24 E28 registered B workflow evaluates selected preparation, completed A record and distinct green plus repair credentials',async()=>{
 const store=new Persistence('b24-owned-t03-required-field-matrix');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let view:Awaited<ReturnType<Game['create_run']>>=initial;
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:initial.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
  const issue=async(id:string,actor:string,basis:unknown[]=[])=>{view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:id,expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis}})).view;};
  view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得两处记录',repair_packs:2}}})).view;if(view.scenario_kind!=='play_outcome'||!view.plan)throw Error('Plan missing');
  view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:view.revision,intent:{kind:'request_preparation',plan_ref:view.plan.ref}})).view;
  await issue('R-to-A','R');await advance(32000);await issue('A-record','R');await advance(80000);await issue('R-to-B','R');await advance(86000);
  view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'validate',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]}})).view;
  await advance(146000);if(view.scenario_kind!=='play_outcome')throw Error('Outcome view missing');const preparation=view.preparation_results[0];expect(preparation.result.status).toBe('approved');await issue('W-repair','W',[preparation.delivery.ref]);await advance(214000);
  if(view.scenario_kind!=='play_outcome')throw Error('Outcome view missing');const assessment=view.assessments[0],repair=view.field_reports.find(item=>item.report.repair_condition==='repaired');if(!repair)throw Error('Actual repair receipt missing');expect(assessment.assessment.conclusion).toEqual({kind:'access_verified',value:'green'});
  await issue('B-record','R',[assessment.delivery.ref,repair.delivery.ref]);await advance(910000);if(view.scenario_kind!=='play_outcome')throw Error('Outcome view missing');const session=await game.open_outcome_debrief(initial.run_id);
  for(const action of ['R-to-B','W-repair','B-record']){
   const decision=view.decision_records.find(decision=>decision.operation_id===action)!;
   const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:decision.ref});
   expect({action,dimensions:result.dimensions.map(d=>d.result)}).toEqual({action,dimensions:[2,2,1,1]});
   if(action==='B-record')expect(result.dimensions[0].known_then_refs.filter(ref=>[assessment.assessment.ref.id,repair.report.ref.id].includes(ref.id))).toHaveLength(2);
  }
 }finally{await store.delete();}
});


test('B24 E28 abort evaluates management authority separately from pending remote cleanup, with evidence discipline not applicable',async()=>{
 const store=new Persistence('b24-owned-t03-abort-matrix');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');
  const request=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'abort',expected_revision:initial.revision,intent:{kind:'abort_outcome'}});
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:request.view.revision,intent:{kind:'advance',to:120000}});const session=await game.open_outcome_debrief(initial.run_id);
  const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:request.view.decision_records[0].ref});
  expect(result.dimensions.map(d=>d.result)).toEqual(['not_evaluable',2,1,2]);expect(result.dimensions[0].missing).toEqual(['not_applicable']);expect(result.dimensions[2].missing.some(m=>m.includes('待'))).toBe(true);
  expect(await game.get_view(initial.run_id)).toMatchObject({finished:true,outcome:{result:'aborted'}});
 }finally{await store.delete();}
});


test('B24 E28 actual valid decision with absent administrative receipt is not evaluable at the isolated evaluation seam, never zero',async()=>{
 const store=new Persistence('b24-owned-t03-missing-evaluation-record');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}});
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:issued.view.revision,actor:'HQ',layer:'known_then',topic:'evidence'};
  const originals=await game.query_outcome_debrief(query),decision=issued.view.decision_records[0],complete=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:decision.ref});
  expect(complete.dimensions.map(d=>d.result)).toEqual([2,2,1,1]);
  const missing=await evaluate_outcome_decision_record(decision,registered as unknown as OutcomeDefinition,{run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},{receipt:undefined,evidence:originals.entries});
  expect(missing.dimensions.map(d=>d.result)).toEqual(['not_evaluable','not_evaluable','not_evaluable','not_evaluable']);expect(missing.dimensions.every(d=>d.missing.some(m=>m.includes('收据')))).toBe(true);expect(await game.get_receipt(initial.run_id,'return-W')).not.toBeNull();
 }finally{await store.delete();}
});

test('B24 E29 later aborted versus failed Outcome and the independent optional-reason factor cannot change the same signing-time evaluation',async()=>{
 const results=[];
 for(const variant of [{id:'failed',abort:false,reason:undefined},{id:'aborted',abort:true,reason:undefined},{id:'reason',abort:false,reason:'先回收本组'}]){
  const store=new Persistence('b24-owned-t03-evaluation-differential-'+variant.id);try{
   const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
   const issued=await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:initial.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000},...(variant.reason?{reason:variant.reason}:{})}});
   const selected=variant.abort?await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'abort',expected_revision:issued.view.revision,intent:{kind:'abort_outcome'}}):issued;
   const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:selected.view.revision,intent:{kind:'advance',to:variant.abort?120000:910000}})).view;if(final.scenario_kind!=='play_outcome')throw Error('Outcome view missing');const session=await game.open_outcome_debrief(initial.run_id),evaluation=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:issued.view.decision_records[0].ref});
   results.push({variant:variant.id,knowledge:JSON.stringify(issued.view.decision_records[0].knowledge).replaceAll(initial.run_id,'RUN'),outcome:final.outcome!.result,dimensions:evaluation.dimensions.map(d=>({result:d.result,matched:d.matched_conditions,missing:d.missing})),reason:evaluation.reason_status});
  }finally{await store.delete();}
 }
 expect(results.map(r=>r.knowledge)).toEqual([results[0].knowledge,results[0].knowledge,results[0].knowledge]);expect(results[0].outcome).not.toBe(results[1].outcome);expect(results[1].outcome).toBe('aborted');expect(results[2].outcome).toBe(results[0].outcome);
 expect(results.map(r=>r.dimensions)).toEqual([results[0].dimensions,results[0].dimensions,results[0].dimensions]);expect(results.map(r=>r.reason)).toEqual(['not_recorded','not_recorded','recorded']);
});


test('B24 E28 actual stale request creates an idempotent rejection record and V0 without a World input or reserving its operation ID',async()=>{
 const store=new Persistence('b24-owned-t03-rejected-stale');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const before=(await game.control_clock({run_id:initial.run_id,operation_id:'to-1000',expected_revision:initial.revision,intent:{kind:'advance',to:1000}})).view;
  const stale={run_id:initial.run_id,operation_id:'attempt',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}};
  await expect(game.apply_outcome_intent(stale)).rejects.toThrow('STALE_REVISION');await expect(game.apply_outcome_intent(stale)).rejects.toThrow('STALE_REVISION');expect(await game.get_view(initial.run_id)).toEqual(before);expect(await game.get_receipt(initial.run_id,'attempt')).toBeNull();
  const rejected=await game.get_outcome_rejections(initial.run_id);expect(rejected).toHaveLength(1);expect(rejected[0]).toMatchObject({code:'STALE_REVISION',source_revision:before.revision,at:1000,request:stale});
  const retried=await game.apply_outcome_intent({...stale,expected_revision:before.revision});expect(retried.receipt.result).toBe('committed');expect(await game.get_outcome_rejections(initial.run_id)).toEqual(rejected);
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:retried.view.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id);
  const result=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:rejected[0].ref});
  expect(result.dimensions.map(d=>d.result)).toEqual(['not_evaluable','not_evaluable','not_evaluable',0]);expect(result.dimensions[3].necessary_refs).toContainEqual(rejected[0].ref);expect(result.dimensions[3].missing.some(m=>m.includes('旧版本'))).toBe(true);expect(result.dimensions.map(d=>d.matched_conditions)).toEqual([[],[],[],['V1:violated']]);
 }finally{await store.delete();}
});


test('B24 E28 default command clock-bearing stale intent records the actual pre-advance refusal without advancing to the supplied clock',async()=>{
 const store=new Persistence('b24-owned-t03-command-rejected-stale');try{
  const game=new Game(store),initial=await game.create_run(registered,'command','create'),before=(await game.tick(initial.run_id,1000,'actual-tick')).view,ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  await expect(game.apply_outcome_intent({run_id:initial.run_id,operation_id:'stale-with-clock',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}},2000)).rejects.toThrow('STALE_REVISION');
  expect(await game.get_view(initial.run_id)).toEqual(before);const rejected=await game.get_outcome_rejections(initial.run_id);expect(rejected).toHaveLength(1);expect(rejected[0]).toMatchObject({code:'STALE_REVISION',source_revision:before.revision,at:1000});
  await game.tick(initial.run_id,910000,'finish');const session=await game.open_outcome_debrief(initial.run_id),binding={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq};
  const result=await game.evaluate_outcome_decision({...binding,decision_ref:rejected[0].ref});expect(result.dimensions.map(d=>d.result)).toEqual(['not_evaluable','not_evaluable','not_evaluable',0]);
  const missing=await evaluate_outcome_rejection(rejected[0],registered as unknown as OutcomeDefinition,binding,{record:undefined,source_digest:rejected[0].source_digest});expect(missing.dimensions.map(d=>d.result)).toEqual(['not_evaluable','not_evaluable','not_evaluable','not_evaluable']);
 }finally{await store.delete();}
});


test.each([{rule:'DQ-E',code:'EVIDENCE_REQUIRED',setup:'missing-preparation',conditions:[['E2:violated'],[],[],[]]},{rule:'DQ-A',code:'INVALID_REQUEST',setup:'wrong-authority',conditions:[[],['A1:violated'],[],[]]},{rule:'DQ-C',code:'CAPACITY_CONFLICT',setup:'after-return',conditions:[[],[],['C1:violated'],[]]}])('B24 E28 complete public refusal $code supports only its proven $rule violation without a World input',async({rule,code,setup,conditions})=>{
 const store=new Persistence('b24-owned-t03-public-rejection-'+rule);try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let view:Awaited<ReturnType<Game['create_run']>>=initial;
  if(setup==='after-return')view=(await game.return_and_deliver({run_id:initial.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor','W'),return_route_ref:ref('return_route','W-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-W'),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view;
  const before=view;await expect(game.apply_outcome_intent({run_id:initial.run_id,operation_id:'refused',expected_revision:view.revision,intent:{kind:'issue_activity',actor_ref:ref('actor',setup==='wrong-authority'?'R':'W'),activity_ref:ref('activity',setup==='wrong-authority'?'R-to-A':'W-repair'),authority_ref:ref('authority',setup==='wrong-authority'?'wrong-authority':'HQ-field-authority'),basis_delivery_refs:[]}})).rejects.toThrow(code);expect(await game.get_view(initial.run_id)).toEqual(before);expect(await game.get_receipt(initial.run_id,'refused')).toBeNull();
  const records=await game.get_outcome_rejections(initial.run_id);expect(records).toHaveLength(1);expect(records[0].code).toBe(code);
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:before.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),evaluation=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:records[0].ref});
  expect(evaluation.dimensions.map(d=>({rule:d.rule_ref.id,result:d.result}))).toEqual(['DQ-E','DQ-A','DQ-C','DQ-V'].map(id=>({rule:id,result:id===rule?0:'not_evaluable'})));expect(evaluation.dimensions.find(d=>d.rule_ref.id===rule)!.necessary_refs).toContainEqual(records[0].ref);expect(evaluation.dimensions.map(d=>d.matched_conditions)).toEqual(conditions);expect(valid_response({request_id:'public-refusal-matrix',ok:true,decision_evaluation:evaluation})).toBe(true);
 }finally{await store.delete();}
});


test('B24 E30 committed finish persists created binding; an actual metadata transaction failure cannot fake ready and retry keeps one original Outcome',async()=>{
 const store=new Persistence('b24-owned-t03-created-build-retry'),native=IDBObjectStore.prototype.put;
 try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
  const created=await game.get_outcome_debrief_state(initial.run_id);expect(created).toMatchObject({run_id:initial.run_id,finished_seq:final.revision,status:'created',lifecycle_revision:0,template_version:'B24-DEBRIEF-1',policy_ref:'B24-OUTCOME-DESIGN-1.0.0',evaluation_profile_ref:{id:'B24-DQ-01',version:1}});expect(await new Game(store).get_outcome_debrief_state(initial.run_id)).toEqual(created);
  let aborted=false;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const result=native.apply(this,args),value=args[0];if(!aborted&&this.transaction.db.name===store.name&&this.name==='metadata'&&value?.key==='outcome-debrief:'+initial.run_id&&value.debrief?.status==='ready')result.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});return result;};
  await expect(game.open_outcome_debrief(initial.run_id)).rejects.toThrow('DEBRIEF_BUILD_FAILED');IDBObjectStore.prototype.put=native;expect(aborted).toBe(true);expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(created);expect(await new Game(store).get_outcome_debrief_state(initial.run_id)).toEqual(created);expect(await game.get_view(initial.run_id)).toEqual(final);
  const ready=await game.open_outcome_debrief(initial.run_id);expect(ready).toMatchObject({run_id:created!.run_id,run_digest:created!.run_digest,finished_seq:created!.finished_seq,status:'ready'});expect(await game.get_outcome_debrief_state(initial.run_id)).toMatchObject({status:'ready',lifecycle_revision:1});expect(await game.open_outcome_debrief(initial.run_id)).toEqual(ready);expect(await game.get_view(initial.run_id)).toEqual(final);expect(await game.get_receipt(initial.run_id,'finish')).toMatchObject({revision:final.revision});
 }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B24 E30 the actual first terminal commit and created binding roll back together on IndexedDB failure, without a phantom finish receipt',async()=>{
 const store=new Persistence('b24-owned-t03-atomic-created'),native=IDBObjectStore.prototype.put;
 try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');let aborted=false;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const result=native.apply(this,args),value=args[0];if(!aborted&&this.transaction.db.name===store.name&&this.name==='metadata'&&value?.key==='outcome-debrief-anchor:'+initial.run_id)result.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});return result;};
  await expect(game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).rejects.toThrow('STORAGE_UNCONFIRMED');IDBObjectStore.prototype.put=native;expect(aborted).toBe(true);
  const reopened=new Game(store);expect(await reopened.get_view(initial.run_id)).toEqual(initial);expect(await reopened.get_receipt(initial.run_id,'finish')).toBeNull();await expect(reopened.get_outcome_debrief_state(initial.run_id)).rejects.toThrow('DEBRIEF_NOT_AVAILABLE');
  const committed=(await reopened.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view;
  expect(await reopened.get_outcome_debrief_state(initial.run_id)).toMatchObject({finished_seq:committed.revision,status:'created',lifecycle_revision:0});expect(await reopened.get_receipt(initial.run_id,'finish')).toMatchObject({revision:committed.revision});
 }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B24 E30 created-ready-viewing-archived lifecycle is bound, versioned and idempotent metadata, independent of truth exposure and sealed World',async()=>{
 const store=new Persistence('b24-owned-t03-session-lifecycle');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await expect(game.get_outcome_debrief_state(initial.run_id)).rejects.toThrow('DEBRIEF_NOT_AVAILABLE');
  const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view,ready=await game.open_outcome_debrief(initial.run_id);
  const request={run_id:initial.run_id,run_digest:ready.run_digest,finished_seq:ready.finished_seq,expected_lifecycle_revision:1,operation_id:'actual-open',status:'viewing' as const};
  expect(ready).toMatchObject({status:'ready',lifecycle_revision:1});const viewing=await game.transition_outcome_debrief(request);expect(viewing).toMatchObject({status:'viewing',lifecycle_revision:2,metadata_revision:1,truth_exposure:false});expect(await game.transition_outcome_debrief(request)).toEqual(viewing);
  await expect(game.transition_outcome_debrief({...request,operation_id:'stale-close',status:'archived'})).rejects.toThrow('OBJECT_VERSION_CONFLICT');await expect(game.transition_outcome_debrief({...request,operation_id:'wrong-run',run_digest:'0'.repeat(64)})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');
  const payload=await game.request_outcome_truth({run_id:initial.run_id,run_digest:ready.run_digest,finished_seq:ready.finished_seq,expected_meta_revision:1,operation_id:'reveal'});await game.confirm_outcome_truth({run_id:initial.run_id,run_digest:ready.run_digest,finished_seq:ready.finished_seq,expected_meta_revision:payload.grant.metadata_revision,operation_id:'reveal',payload_digest:payload.grant.payload_digest});
  const archive={...request,operation_id:'actual-close',expected_lifecycle_revision:2,status:'archived' as const},archived=await game.transition_outcome_debrief(archive);expect(archived).toMatchObject({status:'archived',lifecycle_revision:3,metadata_revision:3,truth_exposure:true});expect(await game.transition_outcome_debrief(archive)).toEqual(archived);
  const restored=new Game(store),reopened=await restored.open_outcome_debrief(initial.run_id);expect(reopened).toEqual(archived);expect(reopened.summary).toEqual(ready.summary);const again=await restored.transition_outcome_debrief({...request,operation_id:'open-again',expected_lifecycle_revision:3});expect(again).toMatchObject({status:'viewing',lifecycle_revision:4,metadata_revision:3,truth_exposure:true,default_layer:'known_then',actor:'HQ'});expect(again.run_digest).toBe(ready.run_digest);expect(await game.get_view(initial.run_id)).toEqual(final);
 }finally{await store.delete();}
});

test('B24 E30 real lifecycle transitions cross a closed separate channel; forged version, state and mixed World payloads are rejected',async()=>{
 const store=new Persistence('b24-owned-t03-lifecycle-contract');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const ready=await game.open_outcome_debrief(initial.run_id),envelope={run_id:initial.run_id,run_digest:ready.run_digest,finished_seq:ready.finished_seq,expected_lifecycle_revision:1,operation_id:'open',status:'viewing' as const},request={request_id:'lifecycle',kind:'transition_outcome_debrief',envelope};
  expect(valid_request(request)).toBe(true);for(const bad of [{status:'ready'},{status:'created'},{expected_lifecycle_revision:0},{run_digest:'forged'},{actor:'R'},{reason:'override'}])expect(valid_request({...request,envelope:{...envelope,...bad}})).toBe(false);
  const viewing=await game.transition_outcome_debrief(envelope);expect(valid_response({request_id:'lifecycle',ok:true,debrief:viewing})).toBe(true);expect(valid_response({request_id:'lifecycle',ok:true,debrief:{...viewing,status:'created'}})).toBe(false);expect(valid_response({request_id:'lifecycle',ok:true,debrief:{...viewing,lifecycle_revision:0}})).toBe(false);expect(valid_response({request_id:'lifecycle',ok:true,debrief:viewing,view:await game.get_view(initial.run_id)})).toBe(false);expect(valid_response({request_id:'failed-build',ok:false,code:'DEBRIEF_BUILD_FAILED'})).toBe(true);
 }finally{await store.delete();}
});

test('B24 E30 an array pretending to be a lifecycle state is rejected before a created session can be built',async()=>{
 const store=new Persistence('b24-owned-t03-invalid-state-no-build');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const created=await game.get_outcome_debrief_state(initial.run_id);
  await expect(game.transition_outcome_debrief({run_id:initial.run_id,run_digest:created!.run_digest,finished_seq:created!.finished_seq,expected_lifecycle_revision:1,operation_id:'invalid-array',status:['viewing']})).rejects.toThrow('INVALID_REQUEST');expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(created);
 }finally{await store.delete();}
});

test('B24 E30 a well-shaped but forged lifecycle binding cannot construct a created session before rejection',async()=>{
 const store=new Persistence('b24-owned-t03-invalid-binding-no-build');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const created=await game.get_outcome_debrief_state(initial.run_id);
  for(const invalid of [{run_digest:'0'.repeat(64)},{finished_seq:created!.finished_seq+1}]){await expect(game.transition_outcome_debrief({run_id:initial.run_id,run_digest:created!.run_digest,finished_seq:created!.finished_seq,expected_lifecycle_revision:1,operation_id:'invalid-binding',status:'viewing',...invalid})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(created);}
 }finally{await store.delete();}
});

test.each([{status:'archived',revision:1},{status:'viewing',revision:2}])('B24 E30 a bound but premature $status request cannot build created metadata before refusing its stage/version',async({status,revision})=>{
 const store=new Persistence('b24-owned-t03-premature-'+status);try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const created=await game.get_outcome_debrief_state(initial.run_id);
  await expect(game.transition_outcome_debrief({run_id:initial.run_id,run_digest:created!.run_digest,finished_seq:created!.finished_seq,expected_lifecycle_revision:revision,operation_id:'premature',status})).rejects.toThrow();expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(created);
 }finally{await store.delete();}
});

test('B24 E27 an actual field decision retains its optional signing reason across replay without changing its evidence or evaluation',async()=>{
 const store=new Persistence('b24-owned-t03-field-signing-reason');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),envelope={run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[],reason:'先前往A取得记录，其他回报仍待确认。'}};
  const issued=await game.apply_outcome_intent(envelope),decision=issued.view.decision_records[0];expect(decision.reason).toEqual({kind:'recorded',text:envelope.intent.reason});expect(decision.intent).toEqual(envelope.intent);expect(decision.at).toBe(0);expect(decision.knowledge_revision).toBe(1);expect(await game.get_receipt(initial.run_id,'R-to-A')).toMatchObject({revision:issued.view.revision});
  const history=await game.get_replay(initial.run_id,0,issued.view.revision);expect((await history.get_view(initial.run_id) as typeof issued.view).decision_records[0]).toEqual(decision);
  const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),evaluation=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:decision.ref});expect(evaluation.reason_status).toBe('recorded');expect(evaluation.dimensions.map(d=>d.result)).toEqual([2,2,1,1]);expect((await new Game(store).get_view(initial.run_id) as typeof issued.view).decision_records[0]).toEqual(decision);expect(final.finished).toBe(true);
 }finally{await store.delete();}
});

test.each(['save_plan','request_preparation','request_source_validation','abort_outcome'])('B24 E27 actual $0 keeps an optional original declaration and its own applicable matrix after restore',async kind=>{
 const store=new Persistence('b24-owned-t03-signing-reason-'+kind);try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),reason='这是当时实际填写的说明，未收到的回报仍待确认。';let view=initial;
  if(kind==='request_preparation')view=(await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得记录',repair_packs:2}}})).view;
  if(kind==='request_source_validation')view=(await game.control_clock({run_id:initial.run_id,operation_id:'receive-source',expected_revision:view.revision,intent:{kind:'advance',to:86000}})).view;
  if(view.scenario_kind!=='play_outcome')throw Error('Outcome view missing');
  const intent=kind==='save_plan'?{kind,base_plan_ref:null,draft:{purpose:'取得记录',repair_packs:2},reason}:kind==='request_preparation'?{kind,plan_ref:view.plan!.ref,reason}:kind==='request_source_validation'?{kind,basis_delivery_refs:[{run_id:initial.run_id,kind:'report_delivery',id:'D-R3',version:1}],reason}:{kind,reason};
  const original={run_id:initial.run_id,operation_id:'declared',expected_revision:view.revision,intent},issued=await game.apply_outcome_intent(original),decision=issued.view.decision_records.at(-1)!;expect(decision.reason).toEqual({kind:'recorded',text:reason});expect(decision.intent).toEqual(intent);
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:kind==='abort_outcome'?120000:910000}});const session=await game.open_outcome_debrief(initial.run_id),evaluation=await game.evaluate_outcome_decision({run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:decision.ref});
  expect(evaluation.reason_status).toBe('recorded');expect(evaluation.dimensions.map(d=>d.result)).toEqual(kind==='save_plan'?['not_evaluable','not_evaluable','not_evaluable','not_evaluable']:kind==='request_preparation'?[1,2,1,2]:kind==='request_source_validation'?[2,2,1,2]:['not_evaluable',2,1,2]);
  const restored=await new Game(store).get_view(initial.run_id);if(restored.scenario_kind!=='play_outcome')throw Error('Outcome view missing');expect(restored.decision_records.find(d=>d.operation_id==='declared')).toEqual(decision);
 }finally{await store.delete();}
});

test('B24 E27/E33 an actual user retrospective explanation has independent time/version and references without rewriting the original reason, evidence, evaluation or World',async()=>{
 const store=new Persistence('b24-owned-t03-user-retrospective');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1}),issued=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[],reason:'这是当时登记的原理由。'}}),decision=issued.view.decision_records[0];
  const final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),binding={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},query={...binding,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},known=await game.query_outcome_debrief(query),target=known.entries.find(entry=>entry.ref.kind==='decision'&&entry.record.operation_id==='R-to-A')!;expect(target).toBeDefined();
  const evaluation=await game.evaluate_outcome_decision({...binding,decision_ref:decision.ref}),request={...binding,operation_id:'actual-user-note',expected_version:0,target:{ref:target.ref,as_of_revision:session.finished_seq},basis_refs:[],text:'这是事后重新看记录写下的解释，不是当时理由或客观因果。'},before=Date.now(),note=await game.append_outcome_inference(request),after=Date.now();
  expect(note).toMatchObject({...binding,operation_id:request.operation_id,target:{ref:target.ref,as_of_revision:session.finished_seq},basis_refs:[],text:request.text,version:1,created_sequence:1,speaker_mode:'user',layer:'retrospective_inference'});expect(Date.parse(note.created_time)).toBeGreaterThanOrEqual(before);expect(Date.parse(note.created_time)).toBeLessThanOrEqual(after);expect(await game.append_outcome_inference(request)).toEqual(note);await expect(game.append_outcome_inference({...request,text:'同编号不同正文'})).rejects.toThrow('OPERATION_ID_REUSED');await expect(game.append_outcome_inference({...request,operation_id:'stale-note'})).rejects.toThrow('OBJECT_VERSION_CONFLICT');
  const first=await game.query_outcome_debrief({...query,layer:'retrospective_inference'});expect(first.entries).toHaveLength(1);expect(first.entries[0].record).toEqual(note);expect(first.entries[0].ref).toMatchObject({kind:'event',actor_scope:'HQ',layer:'retrospective_inference',recorded_at:{kind:'unknown'},received_at:{kind:'unknown'}});expect((await game.query_outcome_debrief({...query,layer:'retrospective_inference',as_of_revision:issued.view.revision})).entries).toEqual([]);
  const next=await game.append_outcome_inference({...request,operation_id:'actual-user-note-v2',expected_version:1,text:'这是第二版实际补充，第一版仍保留。'});expect(next).toMatchObject({version:2,created_sequence:2});const history=await game.query_outcome_debrief({...query,layer:'retrospective_inference'});expect(history.entries.map(entry=>entry.record)).toEqual([note,next]);expect(await game.query_outcome_debrief(query)).toEqual(known);expect(await game.evaluate_outcome_decision({...binding,decision_ref:decision.ref})).toEqual(evaluation);expect(await game.get_view(initial.run_id)).toEqual(final);expect(await game.get_receipt(initial.run_id,'actual-user-note')).toBeNull();
  const restored=new Game(store);expect((await restored.query_outcome_debrief({...query,layer:'retrospective_inference'})).entries.map(entry=>entry.record)).toEqual([note,next]);expect(await restored.get_view(initial.run_id)).toEqual(final);expect(await restored.open_outcome_debrief(initial.run_id)).toEqual(session);
 }finally{await store.delete();}
});

test('B24 E33 actual IndexedDB note transaction failure leaves no explanation, version gap or World write; the same operation can safely retry',async()=>{
 const store=new Persistence('b24-owned-t03-inference-transaction-failure'),native=IDBObjectStore.prototype.put;try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),final=(await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}})).view,session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},known=await game.query_outcome_debrief(query),target=known.entries.find(entry=>entry.ref.id==='OUTCOME')!,before=await game.get_outcome_debrief_state(initial.run_id),request={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,operation_id:'first-user-note',expected_version:0,target:{ref:target.ref,as_of_revision:session.finished_seq},basis_refs:[],text:'这是用户对已保存结果的说明。'};let aborted=false;
  IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const result=native.apply(this,args),value=args[0];if(!aborted&&this.transaction.db.name===store.name&&this.name==='metadata'&&value?.key==='outcome-inference:'+initial.run_id+':first-user-note')result.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});return result;};
  await expect(game.append_outcome_inference(request)).rejects.toThrow('DEBRIEF_BUILD_FAILED');IDBObjectStore.prototype.put=native;expect(aborted).toBe(true);expect((await game.query_outcome_debrief({...query,layer:'retrospective_inference'})).entries).toEqual([]);expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(before);expect(await game.get_view(initial.run_id)).toEqual(final);
  const note=await game.append_outcome_inference(request);expect(note).toMatchObject({version:1,created_sequence:1,text:request.text});expect(await game.append_outcome_inference(request)).toEqual(note);expect(await game.get_view(initial.run_id)).toEqual(final);const restored=new Game(store);expect((await restored.query_outcome_debrief({...query,layer:'retrospective_inference'})).entries.map(entry=>entry.record)).toEqual([note]);expect(await restored.get_receipt(initial.run_id,'first-user-note')).toBeNull();
 }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B24 E33 a real lawful early INTEL ledger remains a valid retrospective source after that ledger changes at the terminal node',async()=>{
 const store=new Persistence('b24-owned-t03-historical-inference-source');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create'),plan=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'plan',expected_revision:initial.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'记录回收',repair_packs:2}}});
  const prepared=await game.apply_outcome_intent({run_id:initial.run_id,operation_id:'prepare',expected_revision:plan.view.revision,intent:{kind:'request_preparation',plan_ref:plan.view.plan!.ref}}),early=(await game.control_clock({run_id:initial.run_id,operation_id:'early-processing',expected_revision:prepared.view.revision,intent:{kind:'advance',to:30000}})).view;
  await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:early.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:early.revision,actor:'INTEL',layer:'known_then',topic:'cost'},old=await game.query_outcome_debrief(query),ledger=old.entries.find(entry=>entry.ref.kind==='ledger')!;expect(ledger).toBeDefined();expect((await game.query_outcome_debrief({...query,as_of_revision:session.finished_seq})).entries.some(entry=>entry.ref.id===ledger.ref.id)).toBe(false);expect(await game.resolve_outcome_evidence({...query,ref:ledger.ref})).toMatchObject({status:'answered',entry:ledger,history:{revision:early.revision}});
  const request={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,operation_id:'actual-early-ledger-note',expected_version:0,target:{ref:ledger.ref,as_of_revision:early.revision},basis_refs:[],text:'这条事后说明依据当时尚在使用的实际预约账目。'},state=await game.get_outcome_debrief_state(initial.run_id);
  await expect(game.append_outcome_inference({...request,target:{...request.target,as_of_revision:session.finished_seq}})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');await expect(game.append_outcome_inference({...request,target:{...request.target,ref:{...ledger.ref,source_digest:'0'.repeat(64)}}})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');await expect(game.append_outcome_inference({...request,target:{...request.target,ref:{...ledger.ref,layer:'engine_event'}}})).rejects.toThrow('DEBRIEF_QUERY_REJECTED');expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(state);
  const note=await game.append_outcome_inference(request);expect(note).toMatchObject({version:1,target:request.target,text:request.text});
  const hqQuery={...query,actor:'HQ',as_of_revision:session.finished_seq,topic:'evidence'},terminal=await game.query_outcome_debrief(hqQuery),outcome=terminal.entries.find(entry=>entry.ref.id==='OUTCOME')!,mixed={...request,operation_id:'actual-mixed-node-note',target:{ref:outcome.ref,as_of_revision:session.finished_seq},basis_refs:[{ref:ledger.ref,as_of_revision:early.revision}],text:'根据早期预约记录，事后说明这个已保存的结果。'};
  const second=await game.append_outcome_inference(mixed);expect(second).toMatchObject({version:1,created_sequence:2,target:mixed.target,basis_refs:mixed.basis_refs});
  await expect(game.append_outcome_inference({...mixed,operation_id:'future-source',basis_refs:[{ref:ledger.ref,as_of_revision:session.finished_seq+1}]})).rejects.toThrow('INVALID_REQUEST');await expect(game.append_outcome_inference({...mixed,operation_id:'forged-created-time',created_time:'1970-01-01T00:00:00.000Z'})).rejects.toThrow('INVALID_REQUEST');
  const notes=await game.query_outcome_debrief({...hqQuery,layer:'retrospective_inference'});expect(notes.entries.map(entry=>entry.record)).toEqual([note,second]);expect((await game.query_outcome_debrief({...hqQuery,actor:'INTEL',layer:'retrospective_inference'})).entries).toEqual([]);expect(await game.get_outcome_debrief_state(initial.run_id)).toEqual(state);
 }finally{await store.delete();}
});

test('B24 E33 a real user note crosses a closed separate request/receipt channel and corrupted returned bytes cannot be accepted',async()=>{
 const store=new Persistence('b24-owned-t03-note-channel');try{
  const game=new Game(store),initial=await game.create_run(registered,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),binding={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq},entries=await game.query_outcome_debrief({...binding,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'}),target=entries.entries.find(entry=>entry.ref.id==='OUTCOME')!,envelope={...binding,operation_id:'note-channel',expected_version:0,target:{ref:target.ref,as_of_revision:session.finished_seq},basis_refs:[],text:'这是实际玩家写下的事后说明。'},request={request_id:'note-channel',kind:'append_outcome_inference',envelope};
  expect(valid_request(request)).toBe(true);for(const bad of [{created_time:'1970-01-01T00:00:00.000Z'},{speaker_mode:'template'},{expected_version:-1},{text:['非字符串']},{target:{...envelope.target,as_of_revision:0}}])expect(valid_request({...request,envelope:{...envelope,...bad}})).toBe(false);
  const note=await game.append_outcome_inference(envelope),receipt={note,source_digest:await hash(note)},response={request_id:request.request_id,ok:true,debrief_inference:receipt};expect(valid_response(response)).toBe(true);expect(valid_response({...response,view:await game.get_view(initial.run_id)})).toBe(false);expect(valid_response({...response,debrief_inference:{...receipt,note:{...note,speaker_mode:['user']}}})).toBe(false);expect(valid_response({...response,debrief_inference:{...receipt,note:{...note,version:0}}})).toBe(false);expect(valid_response({...response,debrief_inference:{...receipt,note:{...note,created_time:'0'}}})).toBe(false);
  const {verify_outcome_inference_receipt}=await import('../src/outcome-dto');expect(await verify_outcome_inference_receipt(receipt)).toBe(true);expect(await verify_outcome_inference_receipt({...receipt,note:{...note,text:'被传输篡改后的文字'}})).toBe(false);
 }finally{await store.delete();}
});
