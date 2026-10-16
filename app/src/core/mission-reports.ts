import type {MissionState} from './mission-state';
import type {MissionDefinition} from './mission-definition';
import type {MissionReport} from '../mission-contracts';
import {merge_mission_position} from './mission-evidence';
import {evaluate_mission_gate} from './mission-gates';
import {canonical} from './snapshot';
import {observe_mission_position,next_local_link_time} from './mission-local';
import {GameError} from '../contracts';
import {mission_goal_confirmed} from '../mission-goal';
export function send_mission_acceptance(state:MissionState,order:MissionState['orders'][number],execution:MissionState['executions'][number],definition:MissionDefinition):void{
  send_report(state,order,execution,definition,'accepted');
}
export function send_mission_terminal(state:MissionState,order:MissionState['orders'][number],execution:MissionState['executions'][number],definition:MissionDefinition,kind:'arrived'|'cutoff'|'blocked'):void{
  send_report(state,order,execution,definition,kind);
}
export function send_mission_hold(state:MissionState,order:MissionState['orders'][number],definition:MissionDefinition,terminal=false):void{
  send_report(state,order,null,definition,terminal?'not_started':'gate_hold');
}
export function send_mission_refusal(state:MissionState,order:MissionState['orders'][number],definition:MissionDefinition):void{
  send_report(state,order,null,definition,'refused');
}
function send_report(state:MissionState,order:MissionState['orders'][number],execution:MissionState['executions'][number]|null,definition:MissionDefinition,kind:MissionReport['kind']):void{
  const p=definition.profile.parameters,r=state.world.resources;
  if(state.reports.filter(report=>report.order_ref===order.id).length>=definition.rules.reports_per_attempt)throw new GameError('ENGINE_UNCONFIRMED');
  const own=state.local.resources,eligible=state.sim_time<p.deadline+p.receipt_grace&&own.equipment_energy>=p.send_energy_cost&&own.equipment_wear>=p.send_wear_cost,busy_until=next_local_link_time(state,state.sim_time,p.link_ms);
  const sendable=eligible&&busy_until===state.sim_time;
  if(sendable){if(r.equipment_energy<p.send_energy_cost||r.equipment_wear<p.send_wear_cost)throw new GameError('ENGINE_UNCONFIRMED');r.equipment_energy-=p.send_energy_cost;r.equipment_wear-=p.send_wear_cost;own.equipment_energy-=p.send_energy_cost;own.equipment_wear-=p.send_wear_cost;state.local.revision++;}
  const id=order.id+'-'+kind,at=state.sim_time;own.confirmed_at=at;
  const position_scope=['arrived','not_started','refused','cutoff','blocked'].includes(kind)?observe_mission_position(state,definition,id):null,attempt=state.attempts.find(a=>a.order_ref===order.id)!,gate=execution?.gate??attempt.gate!;
  const payload:Omit<MissionReport,'reported'>={id,run_id:state.run_id,actor:'R',target:'HQ',kind,order_ref:order.id,phase_ref:structuredClone(order.phase_ref),plan_ref:structuredClone(order.plan_ref),execution_ref:execution?.id??null,observed:{kind:'known',value:at,evidence:id},source_event_time:{kind:'unknown'},position_scope,local_gate:structuredClone(gate),refusal_reason:attempt.refusal_reason,resources:structuredClone(own)};
  if(!sendable){state.reports.push({...payload,reported:{kind:'unknown'}});if(eligible&&busy_until<p.deadline+p.receipt_grace)state.pending_reports.push({report_ref:id,at:busy_until});return;}
  const report:MissionReport={...payload,reported:at};
  state.reports.push(report);state.sent_reports.push(structuredClone(report));state.transmissions.push({sender:'R',report_ref:id,at,until:at+p.link_ms,energy:p.send_energy_cost,wear:p.send_wear_cost});
}
export function transmit_pending_mission_report(state:MissionState,id:string,definition:MissionDefinition):void{
  const pending=state.pending_reports.find(q=>q.report_ref===id),original=state.reports.find(r=>r.id===id);if(!pending||!original)throw new GameError('ENGINE_UNCONFIRMED');
  const p=definition.profile.parameters,r=state.world.resources,busy_until=next_local_link_time(state,state.sim_time,p.link_ms);
  const own=state.local.resources;
  if(state.sim_time>=p.deadline+p.receipt_grace||own.equipment_energy<p.send_energy_cost||own.equipment_wear<p.send_wear_cost){state.pending_reports=state.pending_reports.filter(q=>q!==pending);return;}
  if(busy_until>=p.deadline+p.receipt_grace){state.pending_reports=state.pending_reports.filter(q=>q!==pending);return;}
  if(busy_until>state.sim_time){pending.at=busy_until;return;}
  if(state.sent_reports.some(report=>report.id===id))throw new GameError('ENGINE_UNCONFIRMED');
  r.equipment_energy-=p.send_energy_cost;r.equipment_wear-=p.send_wear_cost;
  own.equipment_energy-=p.send_energy_cost;own.equipment_wear-=p.send_wear_cost;own.confirmed_at=state.sim_time;state.local.revision++;
  // The formed original and its observed resource sample remain immutable.
  // Actual send time belongs to the separate envelope, not a backfilled original.
  state.sent_reports.push({...structuredClone(original),reported:state.sim_time});
  state.transmissions.push({sender:'R',report_ref:id,at:state.sim_time,until:state.sim_time+p.link_ms,energy:p.send_energy_cost,wear:p.send_wear_cost});
  state.pending_reports=state.pending_reports.filter(q=>q!==pending);
}
export function deliver_mission_report(state:MissionState,report:MissionReport,at:number,definition:MissionDefinition):void{
  const delivery={id:report.id+'-delivery',report_ref:report.id,received:at};state.deliveries.push(delivery);
  const order=state.orders.find(o=>o.id===report.order_ref)!;
  order.status=report.kind;order.execution_ref=report.execution_ref;
  const held=state.held_windows.find(w=>w.order_ref===order.id);if(held)held.status=report.kind==='accepted'?'committed':report.kind==='gate_hold'?'held':'released';
  if(report.resources.confirmed_at>=state.known.resources.confirmed_at)state.known.resources={...state.known.resources,...structuredClone(report.resources)};
  if(report.position_scope)state.known.position_knowledge=merge_mission_position(state.known.position_knowledge,{scope:structuredClone(report.position_scope),observed:structuredClone(report.observed),reported:{kind:'known',value:report.reported,evidence:report.id},source_event_time:structuredClone(report.source_event_time),received:at,provenance:{kind:'delivered',report_ref:report.id,delivery_ref:delivery.id},evidence_refs:[report.id]});
  const {draft,phase,route}=order.frozen_payload,p=definition.profile.parameters,equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  if(report.kind!=='arrived'||report.actor!=='R'||report.run_id!==state.run_id||!equal(report.phase_ref,order.phase_ref)||!equal(report.plan_ref,order.plan_ref)||report.position_scope?.kind!=='point'||!equal(report.position_scope.typed_geometry.position,route.path.at(-1))||!equal(draft.objective.verification_requirements,['matching_arrival_report_and_delivery']))return;
  const exit=evaluate_mission_gate(phase.id+'-exit',phase.exit_gate,{evaluated_by:'HQ',revision:state.revision,at,rule_version:definition.rules.version,capability:{ready:definition.catalogs.actor.qualification_refs.includes('R:move'),evidence_refs:definition.capabilities.find(c=>c.id==='R:move')!.evidence_refs},route:{permitted:true,evidence_refs:[order.grant_ref.id]},confirmation:{confirmed:true,evidence_refs:[report.id,delivery.id]},position:{knowledge:state.known.position_knowledge,max_age_ms:p.position_max_age_ms,valid_until_time_ms:p.evidence_valid_until},map:definition.catalogs.map});
  if(exit.result==='T'&&exit.evidence_refs.length<=p.evidence_budget)state.known.phase_confirmations.push({phase_id:phase.id,phase_version:phase.version,plan_id:order.plan_ref.id,plan_version:order.plan_ref.version,order_ref:order.id,report_ref:report.id,delivery_ref:delivery.id});
  const operative=state.orders.at(-1)!.frozen_payload.draft,phase_results=state.known.phase_confirmations.map(c=>({order_ref:c.order_ref,phase_ref:{run_id:state.run_id,kind:'phase' as const,id:c.phase_id,version:c.phase_version},plan_ref:{run_id:state.run_id,kind:'plan' as const,id:c.plan_id,version:c.plan_version},known_report_delivery_refs:[c.report_ref,c.delivery_ref] as [string,string],verification_state:'confirmed' as const}));
  if(mission_goal_confirmed({draft:operative,phase_results,reports:state.sent_reports.filter(r=>state.deliveries.some(d=>d.report_ref===r.id)),deliveries:state.deliveries,geometry:definition.catalogs.map,as_of_time_ms:state.sim_time})){state.status='completed';state.mission!.status='completed';state.actual_mission_status='completed';}
}
