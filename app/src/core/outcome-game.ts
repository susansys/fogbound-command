import type {ConflictingFacilityState} from './conflicting-action-state';
import {canonical} from './snapshot';
import {capture_outcome_observations,hq_outcome_evidence} from './outcome-evidence';
import {evaluate_outcome,finish_outcome,outcome_public_obligations} from './outcome-evaluation';
import {receive_outcome_abort} from './outcome-termination';import {public_cleanup_complete} from '../outcome-contracts';
import type {Envelope} from '../contracts';import {GameError} from '../contracts';import {valid_envelope} from '../protocol';import {parse_outcome_envelope} from '../outcome-protocol';import type {ReturnAndDeliver,OutcomeActor,OutcomeEnvelope} from '../outcome-contracts';import type {OutcomeState} from './outcome-state';import {outcome_definition_for_package,type OutcomeDefinition} from './outcome-definition';import {apply_intelligence_control} from './intelligence-game';
import {advance_intelligence_source} from './intelligence-source';import {advance_intelligence_reports} from './intelligence-reports';import {advance_field_work} from './intelligence-execution';import {advance_processing_work,request_source_work,request_preparation_work,type SharedProcessingAdmission} from './intelligence-work';
import {project_outcome_view} from './outcome-knowledge';import {hash} from './scenario';import {advance_return_reception,next_outcome_time} from './outcome-execution';
async function decision_sources(state:OutcomeState,envelope:OutcomeEnvelope,known:import('../outcome-contracts').OutcomePlayerView){
 const intent=envelope.intent;
 // A schema12 assessment advances the authoritative revision without inventing
 // an inner action input. Decision sequence follows that public revision.
 const evidence=await hq_outcome_evidence(known),known_then_refs=evidence.filter(entry=>entry.ref.kind==='report'||entry.ref.kind==='delivery'||entry.ref.kind==='event').map(entry=>entry.ref);
 return {knowledge_revision:state.revision,operation_seq:state.revision,basis_refs:'basis_delivery_refs' in intent?structuredClone(intent.basis_delivery_refs):[],known_then_refs,selected_versions:{plan_ref:'plan_ref' in intent?structuredClone(intent.plan_ref):intent.kind==='save_plan'?structuredClone(intent.base_plan_ref):null,activity_ref:'activity_ref' in intent?structuredClone(intent.activity_ref):null,authority_ref:'authority_ref' in intent?structuredClone(intent.authority_ref):null},administrative_receipt_ref:{run_id:state.run_id,kind:'administrative_receipt' as const,id:envelope.operation_id,version:1}};
}
export async function create_outcome_rejection(state:OutcomeState,request:OutcomeEnvelope,code:import('../outcome-contracts').OutcomeRejectedDecision['code'],owned:readonly OutcomeDefinition[]=[]):Promise<Omit<import('../outcome-contracts').OutcomeRejectedDecision,'ref'|'attempt_seq'>>{
 if(typeof state.integrity!=='string')throw new GameError('INVALID_SAVE');
 const known=project_outcome_view(state,owned),knowledge=structuredClone({actors:known.actors,received_reports:known.received_reports,processing:known.processing,plan:known.plan}),sources=await decision_sources(state,request,known);
 return {code,public_constraints:structuredClone({field_activities:known.field_activities,return_plans:known.return_plans}),source_revision:state.revision,source_digest:state.integrity,at:state.sim_time,request:structuredClone(request),request_digest:await hash(canonical(request)),knowledge,knowledge_digest:await hash(knowledge),known_then_refs:sources.known_then_refs};
}
export async function apply_outcome_control(state:OutcomeState,envelope:OutcomeEnvelope,clock_to?:number,owned:readonly OutcomeDefinition[]=[],facility?:ConflictingFacilityState):Promise<OutcomeState>{
 const d=outcome_definition_for_package(state.definition_hash,owned),p=d.profile.parameters;
 if(['abort_outcome','return_and_deliver','save_plan','request_source_validation','request_preparation','issue_activity'].includes(envelope.intent.kind))parse_outcome_envelope(envelope);else if(!valid_envelope(envelope,p.deadline+p.receipt_grace,true))throw new GameError('INVALID_REQUEST');
 const declared_reason='reason' in envelope.intent&&typeof envelope.intent.reason==='string'?{kind:'recorded' as const,text:envelope.intent.reason}:{kind:'not_recorded' as const};
 if(envelope.run_id!==state.run_id)throw new GameError('INVALID_REQUEST');if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
 const next=structuredClone(state),intent=envelope.intent;
 const sync=()=>{next.sim_time=next.prefix.sim_time;next.paused=next.prefix.paused;next.rate=next.prefix.rate;next.ended=next.prefix.ended;};
 const processingAdmission=():SharedProcessingAdmission=>{const head=next.verification_batches.filter(b=>b.status==='queued').sort((a,b)=>a.queued_at-b.queued_at||a.ref.id.localeCompare(b.ref.id))[0];return {deadline:p.deadline,blocked_intervals:next.verification_batches.filter(b=>b.started_at!==null).map(b=>({from:b.started_at!,to:Math.min(b.started_at!+d.profile.outcome.verification_work*p.ms_per_work,p.deadline)})).sort((a,b)=>a.from-b.from),...(head?{external_head:{accepted_at:head.queued_at,eligible_at:head.queued_at,id:head.ref.id}}:{})};};
 const advance=async(to:number)=>{
  if(!Number.isSafeInteger(to)||to<next.sim_time||to>p.deadline+p.receipt_grace)throw new GameError('INVALID_INPUT');let steps=0;
  while(next.sim_time<to&&!next.finished){if(++steps>128)throw new GameError('ENGINE_UNCONFIRMED');const at=Math.min(next_outcome_time(next,to,d),next.termination?.cleanup_deadline??Infinity),kind=state.mode==='command'?'tick':'advance';
   const inner:Envelope={run_id:state.run_id,operation_id:'B24-clock-'+state.revision+'-'+at,expected_revision:next.prefix.revision,intent:{kind,to:at}},oldTime=next.prefix.sim_time;
   receive_outcome_abort(next,at,d);advance_intelligence_source(next.prefix,at,d.prefix_definition);advance_intelligence_reports(next.prefix,at,d.prefix_definition);advance_processing_work(next.prefix,at,d.prefix_definition,processingAdmission());advance_field_work(next.prefix,at,d.prefix_definition,{facility,deadline:p.deadline,abort_receipts:next.abort_notifications.filter(n=>(n.target==='R'||n.target==='W')&&n.received!==null).map(n=>({actor:n.target,received_at:n.received!}))});next.prefix.sim_time=at;next.prefix.ended=at===p.deadline+p.receipt_grace;if(next.prefix.ended)next.prefix.paused=true;next.prefix.revision++;next.prefix.inputs.push({envelope:inner,at:oldTime,revision:next.prefix.revision});sync();receive_outcome_abort(next,at,d);await advance_return_reception(next,at,d);receive_outcome_abort(next,at,d);
   if(d.catalogs.hard_boundary&&at===d.catalogs.hard_boundary.hard_close_time)finish_outcome(next,{...evaluate_outcome(next,at,d,'failure'),result:'failure'});
   else if(next.termination){const result=evaluate_outcome(next,at,d,'aborted');if(at===next.termination.cleanup_deadline||public_cleanup_complete(project_outcome_view(next,owned),result))finish_outcome(next,result);}
   else if(!next.termination){const result=evaluate_outcome(next,at,d,'success');if(result.result==='success'&&result.qualified_artifacts.length===2&&result.missing_people.length===0)finish_outcome(next,result);else if(at===p.deadline+p.receipt_grace)finish_outcome(next,evaluate_outcome(next,at,d,'failure'));}
  }
 };


 if(clock_to!==undefined){if(state.mode!=='command'||state.paused)throw new GameError('CLOCK_PAUSED');await advance(clock_to);}
 if((next.termination||next.finished||next.sim_time>=p.deadline)&&['save_plan','request_source_validation','request_preparation','issue_activity'].includes(intent.kind))throw new GameError('RUN_ENDED');
 if(intent.kind==='issue_activity'&&next.return_plans.some(p=>p.actor===intent.actor_ref.id))throw new GameError('CAPACITY_CONFLICT');
 if(intent.kind==='abort_outcome'){
  if(next.ended||next.finished||next.sim_time>=p.deadline)throw new GameError('RUN_ENDED');
  if(!next.termination){
   const known=project_outcome_view(next,owned),knowledge=structuredClone({actors:known.actors,received_reports:known.received_reports,processing:known.processing,plan:known.plan}),original_decision_ref={run_id:state.run_id,kind:'decision_record' as const,id:'DEC-'+state.revision,version:1};
   next.decision_records.push({ref:original_decision_ref,operation_id:envelope.operation_id,at:next.sim_time,actor:'HQ',intent:structuredClone(intent),...await decision_sources(state,envelope,known),knowledge,knowledge_digest:await hash(knowledge),policy_ref:d.rules.outcome_policy,reason:declared_reason});
   next.termination={original_decision_ref,operation_id:envelope.operation_id,status:'terminating',effective_at:next.sim_time,scoring_cutoff:next.sim_time,cleanup_deadline:Math.min(next.sim_time+120000,p.deadline),notification_targets:['R','W','H','INTEL']};for(const target of next.termination.notification_targets)next.abort_notifications.push({ref:{run_id:state.run_id,kind:'abort_notification',id:original_decision_ref.id+'-'+target,version:1},original_decision_ref,target,sent:next.sim_time,eligible_at:next.sim_time+p.link_ms,received:null});const result=evaluate_outcome(next,next.sim_time,d,'aborted');if(outcome_public_obligations(d).length===0||public_cleanup_complete(project_outcome_view(next,owned),result))finish_outcome(next,result);}
 }else if(intent.kind==='return_and_deliver'){
  if(next.finished)throw new GameError('RUN_ENDED');
  const actor=intent.actor_ref.id;if(!['R','W'].includes(actor)||!([actor+'-B-H',...(actor==='R'?['R-A-H']:[])].includes(intent.return_route_ref.id))||intent.receiver_ref.id!=='H'||intent.authority_ref.id!=='HQ-outcome-authority'||next.sim_time<intent.effective_window.from||next.sim_time>=Math.min(intent.effective_window.to,p.deadline))throw new GameError('INVALID_REQUEST');
  if(next.return_plans.some(plan=>plan.actor===actor))throw new GameError('CAPACITY_CONFLICT');if(!project_outcome_view(next,owned).return_candidates.find(c=>c.actor===actor)?.available)throw new GameError('EVIDENCE_REQUIRED');
  const known=project_outcome_view(next,owned);const knownDeliveries=[...known.received_reports.map(r=>r.delivery),...known.field_reports.map(r=>r.delivery.ref),...known.assessments.map(r=>r.delivery.ref),...known.preparation_results.map(r=>r.delivery.ref),...known.return_reports.map(r=>r.delivery.ref),...known.reception_reports.map(r=>r.delivery.ref),...known.verification_reports.map(r=>r.delivery.ref)];if(intent.basis_delivery_refs.some(ref=>!knownDeliveries.some(known=>known.run_id===ref.run_id&&known.kind===ref.kind&&known.id===ref.id&&known.version===ref.version)))throw new GameError('EVIDENCE_REQUIRED');if(intent.return_route_ref.id!==actor+'-'+known.actors.find(a=>a.actor===actor)!.position_scope+'-H')throw new GameError('EVIDENCE_REQUIRED');const knowledge=structuredClone({actors:known.actors,received_reports:known.received_reports,processing:known.processing,plan:known.plan}),decision_ref={run_id:state.run_id,kind:'decision_record' as const,id:'DEC-'+state.revision,version:1};
  next.decision_records.push({ref:decision_ref,operation_id:envelope.operation_id,at:next.sim_time,actor:'HQ',intent:structuredClone(intent),...await decision_sources(state,envelope,known),knowledge,knowledge_digest:await hash(knowledge),policy_ref:d.rules.outcome_policy,reason:declared_reason});
  for(const target of [actor as OutcomeActor,'H','INTEL'] as const)next.notifications.push({ref:{run_id:state.run_id,kind:'return_notification',id:decision_ref.id+'-'+target,version:1},original_decision_ref:decision_ref,target,sent:next.sim_time,eligible_at:next.sim_time+p.link_ms,received:null});
  next.return_plans.push({actor:actor as OutcomeActor,request:structuredClone(envelope as ReturnAndDeliver),original_decision_ref:decision_ref,issued_at:next.sim_time,arrives_at:next.sim_time+p.link_ms,accepted_at:null,completes_at:null,path:[],timing:null,reserved_energy:0,settled:false,status:'issued',reason:null,generation:state.generation});
 }else if(intent.kind==='advance'||intent.kind==='tick'){
  if(state.mode!==(intent.kind==='tick'?'command':'research'))throw new GameError('MODE_LOCKED');if(intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');if(state.ended)throw new GameError('RUN_ENDED');if(intent.to<=state.sim_time)throw new GameError('TIME_NOT_ADVANCED');await advance(intent.to);
 }else{
  if(['save_plan','request_source_validation','request_preparation','issue_activity'].includes(intent.kind)){
   const known=project_outcome_view(next,owned),knowledge=structuredClone({actors:known.actors,received_reports:known.received_reports,processing:known.processing,plan:known.plan});
   next.decision_records.push({ref:{run_id:state.run_id,kind:'decision_record',id:'DEC-'+state.revision,version:1},operation_id:envelope.operation_id,at:next.sim_time,actor:'HQ',intent:structuredClone(intent),...await decision_sources(state,envelope,known),knowledge,knowledge_digest:await hash(knowledge),policy_ref:d.rules.outcome_policy,reason:declared_reason});
  }
  if(intent.kind==='restore'&&intent.snapshot_revision!==state.revision)throw new GameError('STALE_REVISION');
  // The B24 declaration belongs to its original decision/input. The preserved
  // B23 engine receives its unchanged contract, never a retroactive reason.
  const {reason:ignoredReason,...prefixIntent}=intent as typeof intent&{reason?:string};void ignoredReason;
  // Management pause has a required control reason, not an optional declaration.
  const inner={...envelope,expected_revision:next.prefix.revision,intent:intent.kind==='restore'?{kind:'restore',snapshot_revision:next.prefix.revision}:intent.kind==='pause'?intent:prefixIntent} as import('./intelligence-state').IntelligenceState['inputs'][number]['envelope'];
  if(inner.intent.kind==='request_source_validation'||inner.intent.kind==='request_preparation'){
   if(inner.intent.kind==='request_source_validation')request_source_work(next.prefix,inner as import('../intelligence-protocol').IntelligenceSourceRequest,d.prefix_definition,processingAdmission());else request_preparation_work(next.prefix,inner as import('../intelligence-contracts').IntelligencePreparationRequest,d.prefix_definition,processingAdmission());
   next.prefix.revision++;next.prefix.inputs.push({envelope:inner,at:next.prefix.sim_time,revision:next.prefix.revision});
  }else next.prefix=apply_intelligence_control(next.prefix,inner,undefined,[d.prefix_definition],facility);sync();
 }
 capture_outcome_observations(next);next.revision++;next.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:next.sim_time,revision:next.revision,...(clock_to===undefined?{}:{clock_to})});return next;
}
