import {GameError} from '../contracts';
import {record,valid_id} from '../protocol';
import type {OutcomeEnvelope} from '../outcome-contracts';
import type {ConflictingActionPlayerView,FacilityDelivery,FacilityClaim,ConflictingActionEnvelope,WorkingAssessment} from '../conflicting-action-contracts';
import {parse_working_assessment} from '../conflicting-action-protocol';
import type {ConflictingActionState} from './conflicting-action-state';
import {compose_conflicting_state,initial_conflicting_state} from './conflicting-action-state';
import {conflicting_definition_for_package,load_conflicting_action_definition} from './conflicting-action-definition';
import {project_outcome_view} from './outcome-knowledge';
import {project_source_reading} from './source-time';
import {source_time_definition} from './source-time-definition';
import type {SourceTimeState} from './source-time-state';
import {apply_outcome_control} from './outcome-game';
import {canonical,state_hash} from './snapshot';

export function project_conflicting_action_view(state:ConflictingActionState):ConflictingActionPlayerView{
 const definition=conflicting_definition_for_package(state.definition_hash),ref=<K extends string>(kind:K,id:string)=>({run_id:state.run_id,kind,id,version:1});
 const messages=definition.catalogs.messages.filter(m=>m.received<=state.sim_time);
 const reports:FacilityClaim[]=definition.catalogs.reports.filter(r=>messages.some(m=>m.report===r.id)).map(r=>({ref:ref('facility_report',r.id),target:'B',source:r.source,claim:r.claim,text:r.text,event_time:{kind:'unknown'},observed_time:{kind:'known',value:r.observed,basis_ref:ref('facility_basis',r.id+'-observation')},source_reported_time:{kind:'known',value:r.source_reported,basis_ref:ref('facility_basis',r.id+'-source-reported')},verification:'unverified'}));
 const deliveries:FacilityDelivery[]=messages.map(m=>({ref:ref('facility_delivery',m.id),report_ref:ref('facility_report',m.report),message_ref:ref('facility_message','MSG-'+m.id),sender:'FacilityArchive',recipient:'HQ',sent:m.sent,received:m.received}));
 // The existing B31 projection reads only its own catalog and delivered events.
 // This adapter is never persisted or accepted as a standalone schema11 save.
 const frame={...state,schema:11 as const,scenario_kind:'play_source_time' as const,definition_hash:source_time_definition.definition_hash,hashes:source_time_definition.hashes,inputs:state.task.inputs} satisfies SourceTimeState;
 return {...project_outcome_view(state.task),revision:state.revision,replay_nodes:state.inputs.map(input=>({revision:input.revision,at:Math.min(input.clock_to??(input.envelope.intent.kind==='advance'||input.envelope.intent.kind==='tick'?input.envelope.intent.to:input.at),state.task.outcome?.finished_at??Infinity),meaningful:true,label:input.revision+'号记录'})),source_package:{id:'B31-SOURCE-TIME-01',version:1},source_reading:project_source_reading(frame,'HQ'),conflicting_action:{package:{id:'B32-CONFLICTING-ACTION-01',version:1},reports,deliveries,independence:{kind:'unknown'},assessments:structuredClone(state.assessments)}};
}
export async function apply_conflicting_action_control(state:ConflictingActionState,envelope:ConflictingActionEnvelope,clock_to?:number):Promise<ConflictingActionState>{
 if(envelope.run_id!==state.run_id)throw new GameError('INVALID_REQUEST');
 if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
 if(envelope.intent.kind==='save_working_assessment'){
  const request=parse_working_assessment(envelope),intent=request.intent,draft=intent.draft,previous=state.assessments.at(-1)?.ref,base=intent.base_ref;
  if(clock_to!==undefined)throw new GameError('INVALID_REQUEST');
  if(state.ended||state.finished||state.sim_time>=900000)throw new GameError('RUN_ENDED');
  if(previous?base===null||base.run_id!==previous.run_id||base.kind!==previous.kind||base.id!==previous.id||base.version!==previous.version:base!==null)throw new GameError('STALE_ASSESSMENT');
  const definition=conflicting_definition_for_package(state.definition_hash),known=new Set(definition.catalogs.messages.filter(m=>m.recipient==='HQ'&&m.received<=state.sim_time).map(m=>m.report));
  if(draft.basis_refs.some(r=>r.run_id!==state.run_id||r.kind!=='facility_report'||r.version!==1||!known.has(r.id)))throw new GameError('INVALID_REQUEST');
  if(state.assessments.length>=definition.profile.parameters.assessment_versions)throw new GameError('CONSTRAINT_DENIED');
  const assessment:WorkingAssessment={ref:{run_id:state.run_id,kind:'working_assessment',id:'WA-B',version:state.assessments.length+1},target_scope:'B',explanations:['operable','faulted'],preferred:draft.preferred??'undecided',basis_refs:structuredClone(draft.basis_refs),...('reason' in draft?{reason:draft.reason}:{}),supersedes:previous?structuredClone(previous):null,recorded_at:state.sim_time},revision=state.revision+1;
  // The schema12 input is the authoritative assessment history. Keep the
  // embedded task's snapshot sequence aligned for existing sealed metadata,
  // without inventing a field command, a save intent, or a decision record.
  const task=structuredClone(state.task);task.revision=revision;
  return compose_conflicting_state(task,definition,state.facility,[...state.assessments,assessment],[...state.inputs,{envelope:structuredClone(request),at:state.sim_time,revision}],revision);
 }
 const inner={...structuredClone(envelope as OutcomeEnvelope),expected_revision:state.task.revision};
 if(envelope.intent.kind==='restore'){
  if(envelope.intent.snapshot_revision!==state.revision)throw new GameError('STALE_REVISION');
  inner.intent={kind:'restore',snapshot_revision:state.task.revision};
 }
 const facility=structuredClone(state.facility),task=await apply_outcome_control(state.task,inner,clock_to,[],facility),revision=state.revision+1;
 return compose_conflicting_state(task,conflicting_definition_for_package(state.definition_hash),facility,state.assessments,[...state.inputs,{envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:task.sim_time,revision,...(clock_to===undefined?{}:{clock_to})}],revision);
}
export async function validate_conflicting_action_state(value:Record<string,unknown>):Promise<ConflictingActionState>{
 try{
  const definition=await load_conflicting_action_definition(conflicting_definition_for_package(value.definition_hash));
  if(!valid_id(value.run_id)||(value.mode!=='command'&&value.mode!=='research')||!Number.isSafeInteger(value.origin_generation)||Number(value.origin_generation)<1||!(value.source_run===null||valid_id(value.source_run))||!record(value.rng)||!valid_id(value.rng.origin)||value.source_run===null&&value.rng.origin!==value.run_id||!record(value.facility)||!['operable','faulted'].includes(String(value.facility.initial))||!Array.isArray(value.inputs))throw Error('identity');
  let expected=await initial_conflicting_state(definition,value.run_id,value.mode,Number(value.origin_generation),value.source_run,value.rng.origin,value.facility.initial as 'operable'|'faulted');const operations=new Set<string>();
  for(const entry of value.inputs){if(!record(entry)||!record(entry.envelope)||!record(entry.envelope.intent)||!valid_id(entry.envelope.operation_id)||operations.has(entry.envelope.operation_id))throw Error('input');operations.add(entry.envelope.operation_id);expected=await apply_conflicting_action_control(expected,entry.envelope as ConflictingActionEnvelope,entry.clock_to as number|undefined);if(JSON.stringify(canonical(expected.inputs.at(-1)))!==JSON.stringify(canonical(entry)))throw Error('entry');}
  const {integrity,...body}=value;if(integrity!==await state_hash(value as unknown as ConflictingActionState)||JSON.stringify(canonical(body))!==JSON.stringify(canonical(expected)))throw Error('replay');
  return value as unknown as ConflictingActionState;
 }catch{throw new GameError('INVALID_SAVE');}
}
