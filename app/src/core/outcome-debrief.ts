import type {OutcomePlayerView,OutcomeDebriefSession} from '../outcome-contracts';
import {GameError} from '../contracts';
import type {OutcomeState} from './outcome-state';
import {outcome_decision_profile_for,type OutcomeDefinition} from './outcome-definition';
import {record} from '../protocol';

// Private record paths identify actual participation in the sealed state. They
// are not evidence refs and must never be copied into the default HQ payload.
export type OutcomeStoredDebriefAnchor=import('../outcome-contracts').OutcomeDebriefAnchor&{participant_index:Array<{actor:string;activity_refs:string[]}>};
function outcome_participant_index(state:OutcomeState,definition:OutcomeDefinition):OutcomeStoredDebriefAnchor['participant_index']{
  const actors=['HQ','INTEL','R','W','ArchiveSource','H'],refs=new Map(actors.map(actor=>[actor,new Set<string>()]));
  const add=(actor:string,collection:string,id?:string)=>refs.get(actor)?.add(collection+(id?':'+id:''));
  for(const input of state.inputs)add('HQ','inputs',input.envelope.operation_id);
  for(const decision of state.decision_records)add(decision.actor,'decision_records',decision.ref.id);
  if(state.prefix.source.work.status!=='pending'||state.prefix.source.work.done_ms>0||state.prefix.source.published_report_ref)add(definition.catalogs.source.actor,'prefix.source.work');
  for(const report of state.prefix.reports)if(report.origin.kind==='known')add(report.origin.actor,'prefix.reports',report.id);
  for(const delivery of state.prefix.deliveries)if(delivery.received<=state.sim_time){add(delivery.sender,'prefix.deliveries',delivery.id);add(delivery.target,'prefix.deliveries',delivery.id);}
  for(const order of state.prefix.field.orders)if(order.arrives_at<=state.sim_time)add(order.payload.actor_ref.id,'prefix.field.orders',order.ref.id);
  for(const report of state.prefix.field.reports)add(report.actor,'prefix.field.reports',report.ref.id);
  for(const observation of state.local_observations)add(observation.actor,'local_observations',observation.ref.id);
  for(const message of state.prefix.field.messages)add(message.actor,'prefix.field.messages',message.report_ref.id);
  for(const delivery of state.prefix.field.deliveries)if(delivery.received<=state.sim_time)add('HQ','prefix.field.deliveries',delivery.ref.id);
  for(const [collection,items] of [['items',state.prefix.processing.items],['assessments',state.prefix.processing.assessments],['preparations',state.prefix.processing.preparations],['reservations',state.prefix.processing.reservations]] as const)for(const item of items)add('INTEL','prefix.processing.'+collection,item.ref.id);
  for(const delivery of state.prefix.processing.deliveries)if(delivery.received<=state.sim_time){add('INTEL','prefix.processing.deliveries',delivery.ref.id);add('HQ','prefix.processing.deliveries',delivery.ref.id);}
  for(const [collection,notifications] of [['notifications',state.notifications],['abort_notifications',state.abort_notifications]] as const)for(const notification of notifications){add('HQ',collection,notification.ref.id);if(notification.received!==null&&notification.received<=state.sim_time)add(notification.target,collection,notification.ref.id);}
  for(const report of state.return_reports)add(report.actor,'return_reports',report.ref.id);
  for(const report of state.abort_reports)add(report.actor,'abort_reports',report.ref.id);
  for(const continuation of state.continuation_records)add(continuation.actor,'continuation_records',continuation.ref.id);
  for(const delivery of state.return_deliveries)if(delivery.received<=state.sim_time)add(delivery.target,'return_deliveries',delivery.ref.id);
  for(const batch of state.reception_batches)add('H','reception_batches',batch.ref.id);
  for(const report of state.reception_reports)add('H','reception_reports',report.ref.id);
  for(const receipt of state.person_receipts)add('H','person_receipts',receipt.ref.id);
  for(const confirmation of state.handover_confirmations)add(confirmation.actor,'handover_confirmations',confirmation.ref.id);
  for(const event of state.custody_events){add(event.from,'custody_events',event.ref.id);add(event.to,'custody_events',event.ref.id);}
  for(const delivery of state.reception_deliveries)if(delivery.received<=state.sim_time)add(delivery.target,'reception_deliveries',delivery.ref.id);
  for(const batch of state.verification_batches)add('INTEL','verification_batches',batch.ref.id);
  for(const [collection,reports] of [['verification_reports',state.verification_reports],['verification_status_reports',state.verification_status_reports]] as const)for(const report of reports)add('INTEL',collection,report.ref.id);
  for(const [collection,deliveries] of [['verification_deliveries',state.verification_deliveries],['verification_status_deliveries',state.verification_status_deliveries],['abort_deliveries',state.abort_deliveries]] as const)for(const delivery of deliveries)if(delivery.received<=state.sim_time)add(delivery.target,collection,delivery.ref.id);
  return actors.map(actor=>({actor,activity_refs:[...refs.get(actor)!].sort()}));
}
export function create_outcome_debrief_anchor(state:OutcomeState,definition:OutcomeDefinition,origin:import('../outcome-contracts').OutcomeDebriefAnchor['origin']='terminal_commit'):OutcomeStoredDebriefAnchor{
  if(!state.finished||!state.outcome||!state.integrity)throw new GameError('DEBRIEF_NOT_AVAILABLE');
  const profile=outcome_decision_profile_for(definition);
  return {run_id:state.run_id,run_digest:state.integrity,finished_seq:state.revision,template_version:'B24-DEBRIEF-1',policy_ref:'B24-OUTCOME-DESIGN-1.0.0',evaluation_profile_ref:profile?{id:profile.id,version:profile.version,definition_hash:definition.definition_hash}:null,origin,status:'created',lifecycle_revision:0,participant_index:outcome_participant_index(state,definition)};
}

// Template organisation is persisted with ready metadata. Only each role's
// lawful records supply its refs; a template is never that role's old speech.
export function create_outcome_participant_template(anchor:OutcomeStoredDebriefAnchor,sources:ReadonlyMap<string,import('../outcome-contracts').OutcomeDebriefAnswer['entries']>):import('../outcome-contracts').OutcomeParticipantTemplate{
 const participants=anchor.participant_index.map(participant=>{
  const entries=sources.get(participant.actor);if(!entries)throw new GameError('DEBRIEF_BUILD_FAILED');
  const participated=participant.activity_refs.length>0,available=participated?entries:[],declared=available.some(e=>e.ref.kind==='decision'&&record(e.record.reason)&&e.record.reason.kind==='recorded');
  return {actor:participant.actor,participation:participated?'participated' as const:'not_participated' as const,declaration:!participated?'not_recorded' as const:available.length===0?'record_missing' as const:declared?'recorded' as const:'not_recorded' as const,claims:available.length?[{id:'TEMPLATE-'+participant.actor,speaker_mode:'template' as const,layer:'known_then' as const,actor_scope:participant.actor,text:'以下依据该主体在本局保存的合法记录组织；模板文字不代表其当时说过的话，也不证明心理动机或客观因果。',evidence_refs:available.slice(0,3).map(e=>structuredClone(e.ref))}]:[],missing:!participated?['该注册角色没有本局活动、消息、决定或效果记录，未参与。']:available.length===0?['有本局活动索引，但缺少可引用的当地记录；无声明／记录缺失，无法补写原因。']:declared?[]:['未登记当时声明；原始报告及实际记录仍分别保留。']};
 });
 return {run_id:anchor.run_id,run_digest:anchor.run_digest,finished_seq:anchor.finished_seq,template_version:anchor.template_version,agenda:['task_outcome','timeline','participants','coordination','questions'],branch_comparison:'not_provided',participants};
}

// Only the already projected HQ view supplies the default summary. Local
// execution state is deliberately absent from this presentation seam.
export function create_outcome_debrief(view:OutcomePlayerView,run_digest:string):OutcomeDebriefSession{
  if(!view.finished||!view.outcome)throw new GameError('DEBRIEF_NOT_AVAILABLE');
  // B24-DEBRIEF-1 selects only actual confirmations connected to public
  // objectives/constraints. Management, return, field work, preparation and
  // source validation have that fixed priority; ties use original commit order.
  // Present the selected records chronologically, without using future truth.
  const priority:Partial<Record<OutcomePlayerView['decision_records'][number]['intent']['kind'],number>>={abort_outcome:0,return_and_deliver:1,issue_activity:2,request_preparation:3,request_source_validation:4};
  const key_decisions=view.decision_records.map((decision,index)=>({decision,index})).filter(({decision})=>priority[decision.intent.kind]!==undefined)
    .sort((a,b)=>priority[a.decision.intent.kind]!-priority[b.decision.intent.kind]!||a.index-b.index).slice(0,3).sort((a,b)=>a.index-b.index)
    .map(({decision:d})=>({ref:structuredClone(d.ref),at:d.at,operation_id:d.operation_id,reason:structuredClone(d.reason),knowledge_digest:d.knowledge_digest,action:d.intent.kind}));
  return {run_id:view.run_id,run_digest,finished_seq:view.revision,template_version:'B24-DEBRIEF-1',status:'ready',lifecycle_revision:1,default_layer:'known_then',actor:'HQ',metadata_revision:1,truth_exposure:false,summary:{result:view.outcome.result,missing_people:[...view.outcome.missing_people],key_decisions}};
}
// This private-state projection is called only by the explicit finished truth
// request, never by the HQ summary or ordinary PlayerView.
export function outcome_truth_facts(state:OutcomeState):import('../outcome-contracts').OutcomeTruthFacts{
  if(!state.finished||!state.outcome)throw new GameError('DEBRIEF_NOT_AVAILABLE');
  return structuredClone({source:{resources:state.prefix.source.resources},reports:{source:state.prefix.reports,field:state.prefix.field.reports,returns:state.return_reports,receptions:state.reception_reports,abort:state.abort_reports},events:{continuations:state.continuation_records,return_notifications:state.notifications,abort_notifications:state.abort_notifications},ledgers:{processing_reservations:state.prefix.processing.reservations,verification_batches:state.verification_batches,field_orders:state.prefix.field.orders},custody:{reception_batches:state.reception_batches,manifests:state.reception_manifests,person_receipts:state.person_receipts,custody_events:state.custody_events},verification:{reports:state.verification_reports,deliveries:state.verification_deliveries,status_reports:state.verification_status_reports,status_deliveries:state.verification_status_deliveries},outcome:state.outcome});
}
