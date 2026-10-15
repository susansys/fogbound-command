import {GameError} from '../contracts';
import type {IssueMissionEnvelope,MissionDraft,MissionPreview} from '../mission-contracts';
import type {MissionState} from './mission-state';
import {mission_definition_for_package,type MissionDefinition} from './mission-definition';
import {preview_mission} from './mission-preview';
import {parse_issue_mission} from '../mission-protocol';
import {validate_mission_evidence} from './mission-evidence';
import {canonical} from './snapshot';
import {hash} from './scenario';

const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function assert_mission_phase(state:MissionState,draft:MissionDraft,phase:MissionDraft['phases'][number],checked:MissionPreview['phases'][number],definition:MissionDefinition){
  const p=definition.profile.parameters;
  if(checked.authorization.status!=='met')throw new GameError('AUTHORITY_DENIED');
  if(checked.gate.result!=='T')throw new GameError(checked.gate.result==='F'?'CONSTRAINT_DENIED':'CONSTRAINT_HOLD');
  if(phase.dependencies.some(ref=>!state.known.phase_confirmations.some(c=>c.phase_id===ref.id&&c.phase_version===ref.version)))throw new GameError('STATE_CONFIRMATION_REQUIRED');
  if(state.orders.some(o=>o.phase_ref.id===phase.id))throw new GameError('STATE_CONFIRMATION_REQUIRED');
  if(state.orders.length>=p.attempt_budget)throw new GameError('INVALID_REQUEST');
  const route=draft.routes.find(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version)!;
  const location=state.known.position_knowledge;
  if(location.status!=='known_scope'||location.scope.kind!=='point'||location.scope.uncertainty.kind!=='known'||location.scope.uncertainty.value!==0)throw new GameError('EVIDENCE_REQUIRED');
  if(location.observed.kind==='known'&&location.observed.value>state.sim_time||location.received!==null&&location.received>state.sim_time)throw new GameError('EVIDENCE_REQUIRED');
  if(location.observed.kind!=='known'||state.sim_time>=Math.min(location.observed.value+p.position_max_age_ms,p.evidence_valid_until))throw new GameError('CONSTRAINT_HOLD');
  if(!equal(location.scope.typed_geometry.position,route.path[0]))throw new GameError('CONSTRAINT_DENIED');
  if(checked.gap||checked.estimated_move_ms===null)throw new GameError('CONSTRAINT_DENIED');
  const actor=definition.catalogs.actor,move_cost=Math.ceil(checked.distance*definition.rules.movement_energy_per_distance);
  if(actor.load>actor.load_capacity||actor.space>actor.space_capacity||state.known.resources.movement_energy-state.known.resources.movement_energy_reserved<move_cost)throw new GameError('CONSTRAINT_DENIED');
  const effective=Math.max(state.sim_time+p.link_ms,phase.earliest_start_time_ms);
  if(state.ended||effective>=phase.latest_finish_time_ms||effective+checked.estimated_move_ms>phase.latest_finish_time_ms||phase.latest_finish_time_ms>p.deadline)throw new GameError('CONSTRAINT_DENIED');
  if(state.held_windows.some(w=>w.status!=='released'&&w.from<phase.latest_finish_time_ms&&phase.earliest_start_time_ms<w.to))throw new GameError('CAPACITY_CONFLICT');
  if(state.outbound_messages.some(m=>state.sim_time<m.sent+p.send_window_ms))throw new GameError('CAPACITY_CONFLICT');
  if(state.known.resources.hq_energy<p.send_energy_cost||state.known.resources.hq_wear<p.send_wear_cost)throw new GameError('CONSTRAINT_DENIED');
  return route;
}
export async function apply_issue_mission(state:MissionState,input:IssueMissionEnvelope,owned:readonly MissionDefinition[]=[]):Promise<MissionState>{
  const envelope=parse_issue_mission(input),intent=envelope.intent,definition=mission_definition_for_package(state.definition_hash,owned),p=definition.profile.parameters;
  if(envelope.run_id!==state.run_id||envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  if(!state.mission||intent.expected_object_revision!==state.mission.object_revision||!equal(intent.plan_ref,state.mission.current_plan_ref))throw new GameError('OBJECT_VERSION_CONFLICT');
  const plan=state.plans.find(v=>v.plan_id===intent.plan_ref.id&&v.version===intent.plan_ref.version);
  const phase=plan?.draft.phases.find(v=>v.id===intent.phase_ref.id&&v.version===intent.phase_ref.version);
  if(!plan||!phase)throw new GameError('INVALID_REQUEST');
  if(!equal(intent.grant_ref,plan.draft.intent.delegation_ref))throw new GameError('AUTHORITY_DENIED');
  validate_mission_evidence(intent.evidence_refs,state,definition);
  const preview=await preview_mission(state,intent.preview.editing_seq,plan.draft,owned);
  if(!equal(intent.preview,preview))throw new GameError('STALE_REVISION');
  const checked=preview.phases.find(v=>v.phase_id===phase.id)!;
  const route=assert_mission_phase(state,plan.draft,phase,checked,definition);
  const candidate=structuredClone(state),id='mission-order-'+(state.orders.length+1),message_ref='mission-message-'+(state.orders.length+1);
  const frozen_payload={draft:structuredClone(plan.draft),phase:structuredClone(phase),route:structuredClone(route),grant:structuredClone(definition.catalogs.authority),authorization:structuredClone(checked.authorization),gate:structuredClone(checked.gate),evidence_refs:[...intent.evidence_refs]};
  const frozen_payload_digest=await hash(canonical(frozen_payload));
  candidate.orders.push({id,origin:'staff',mission_ref:structuredClone(plan.draft.mission_ref),phase_ref:structuredClone(intent.phase_ref),plan_ref:structuredClone(intent.plan_ref),intent_ref:{run_id:state.run_id,kind:'intent',id:plan.draft.intent.id,version:plan.draft.intent.version},grant_ref:structuredClone(intent.grant_ref),frozen_payload_digest,message_ref,execution_ref:null,supersedes_id:null,issued:state.sim_time,sent:state.sim_time,expiry_time_ms:Math.min(phase.latest_finish_time_ms,p.deadline,definition.catalogs.authority.valid_to_time_ms),hq_gate:structuredClone(checked.gate),status:'sent',...(intent.reason===undefined?{}:{reason:intent.reason}),frozen_payload});
  candidate.held_windows.push({order_ref:id,capability_ref:'R:move',concurrency_group:'R:execution',from:phase.earliest_start_time_ms,to:phase.latest_finish_time_ms,amount:1,status:'held'});
  candidate.outbound_messages.push({id:message_ref,order_ref:id,origin:'HQ',target:'R',sent:state.sim_time,deliver_at:state.sim_time+p.link_ms,payload_digest:frozen_payload_digest});
  for(const resources of [candidate.world.resources,candidate.known.resources]){resources.hq_energy-=p.send_energy_cost;resources.hq_wear-=p.send_wear_cost;}
  candidate.status='active';candidate.mission!.status='active';candidate.mission!.object_revision++;
  candidate.revision++;candidate.inputs.push({envelope:structuredClone(envelope),at:state.sim_time,revision:candidate.revision});
  return candidate;
}
