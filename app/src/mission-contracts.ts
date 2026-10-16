import type {Mode,LogEntry,PlayerView} from './contracts';
import type {PublicMap} from './spatial';
import type {PositionKnowledge} from './play-contracts';
import type {Coordinate} from './spatial';
export type MissionRef<K extends string>={run_id:string;kind:K;id:string;version:number};
export type ConditionExpr=
  |{kind:'compare';field_ref:'position.scope';operator:'eq'|'in';typed_value:string}
  |{kind:'compare';field_ref:'phase.confirmed'|'route.permitted'|'capability.ready';operator:'eq'|'ne';typed_value:boolean}
  |{kind:'all'|'any';children:ConditionExpr[]}
  |{kind:'not';child:ConditionExpr};
export type MissionDraft={
  run_id:string;plan_id:string;mission_ref:MissionRef<'mission'>;
  intent:{id:string;version:number;purpose:string;desired_end_state:string;key_tasks:string[];priorities:string[];constraint_refs:string[];acceptable_risk:string;delegation_ref:MissionRef<'authority'>};
  objective:{id:string;purpose:string;success_expr:ConditionExpr;failure_expr:ConditionExpr;deadline_time_ms:number;verification_requirements:string[];priority:number;dependencies:MissionRef<'objective'>[]};
  phases:Array<{id:string;version:number;kind:'move';dependencies:MissionRef<'phase'>[];entry_gate:ConditionExpr;exit_gate:ConditionExpr;earliest_start_time_ms:number;latest_finish_time_ms:number;activity:{kind:'move';actor:'R';route_ref:MissionRef<'route'>}}>;
  routes:Array<{id:string;version:number;path:Coordinate[]}>;actor_assignments:['R'];support_windows:[];assumptions:string[];evidence_refs:string[];decision_points:string[];note:string;
};
export type MissionAuthorization={status:'met'|'denied';session_role:'staff';grant_ref:MissionRef<'authority'>;dimensions:Record<'mission'|'actor'|'action'|'space'|'time'|'risk',boolean>;code:null|'AUTHORITY_DENIED';gap:string};
export type MissionTruth='T'|'F'|'U';
export type MissionLocalPositionCandidate=Omit<Extract<PositionKnowledge,{status:'conflicting'}>['candidates'][number],'provenance'>&{provenance:Extract<PositionKnowledge,{status:'conflicting'}>['candidates'][number]['provenance']|{kind:'local_observation';observation_ref:string}};
export type MissionLocalPositionKnowledge=({status:'known_scope'}&MissionLocalPositionCandidate)|Extract<PositionKnowledge,{status:'unresolved'}>|{status:'conflicting';observed:Extract<PositionKnowledge,{status:'conflicting'}>['observed'];candidates:MissionLocalPositionCandidate[]};
export type MissionExpiry={kind:'timeless'}|{kind:'unknown'}|{kind:'known';value:number};
export type MissionGateEvaluation={gate_id:string;rule_version:string;evaluated_by:'HQ'|'R';knowledge_revision:number;evaluated_at_time_ms:number;result:MissionTruth;conditions:Array<{condition:Extract<ConditionExpr,{kind:'compare'}>;result:MissionTruth;evidence_refs:string[];expires_at_time_ms:MissionExpiry}>;evidence_refs:string[];expires_at_time_ms:MissionExpiry};
export type MissionPreview={kind:'mission_plan';run_id:string;revision:number;editing_seq:number;draft_digest:string;phases:Array<{phase_id:string;distance:number;estimated_move_ms:number|null;assumptions:string[];gap:string;authorization:MissionAuthorization;gate:MissionGateEvaluation}>};
export type SavedMissionPlan={plan_id:string;version:number;draft:MissionDraft;preview:MissionPreview};
export type KnownMission={id:'M1';object_revision:number;status:'draft'|'active'|'completed';current_plan_ref:MissionRef<'plan'>;support_refs:[]};
export type SavePlanEnvelope={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'save_plan';base_plan_ref:MissionRef<'plan'>|null;expected_object_revision:number;draft:MissionDraft}};
export type IssueMissionEnvelope={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'issue_mission';expected_object_revision:number;plan_ref:MissionRef<'plan'>;phase_ref:MissionRef<'phase'>;grant_ref:MissionRef<'authority'>;preview:MissionPreview;evidence_refs:string[];reason?:string}};
export type MissionHeldWindow={order_ref:string;capability_ref:'R:move';concurrency_group:'R:execution';from:number;to:number;amount:1;status:'held'|'committed'|'released'};
export type MissionOrder={id:string;origin:'staff';mission_ref:MissionRef<'mission'>;phase_ref:MissionRef<'phase'>;plan_ref:MissionRef<'plan'>;intent_ref:MissionRef<'intent'>;grant_ref:MissionRef<'authority'>;frozen_payload_digest:string;message_ref:string;execution_ref:string|null;supersedes_id:null;issued:number;sent:number;expiry_time_ms:number;hq_gate:MissionGateEvaluation;status:'sent'|'accepted'|'arrived'|'gate_hold'|'not_started'|'refused'|'cutoff'|'blocked';reason?:string};
export type MissionResources={movement_energy:number;movement_energy_reserved:number;equipment_energy:number;equipment_wear:number;hq_energy:number;hq_wear:number;confirmed_at:number};
export type MissionRefusalReason='start_mismatch'|'window_closed'|'authority_denied'|'insufficient_movement_energy'|'capacity_conflict'|'start_unconfirmed';
export type MissionReport={id:string;run_id:string;actor:'R';target:'HQ';kind:'accepted'|'arrived'|'gate_hold'|'not_started'|'refused'|'cutoff'|'blocked';order_ref:string;phase_ref:MissionRef<'phase'>;plan_ref:MissionRef<'plan'>;execution_ref:string|null;observed:import('./contracts').KnownTime;source_event_time:import('./contracts').KnownTime;reported:number;refusal_reason:MissionRefusalReason|null;position_scope:Exclude<import('./spatial').SpatialScope,{kind:'unresolved'}>|null;local_gate:MissionGateEvaluation;resources:Omit<MissionResources,'hq_energy'|'hq_wear'>};
export type MissionDelivery={id:string;report_ref:string;received:number};
export type MissionUnsentReport=Omit<MissionReport,'reported'>&{reported:{kind:'unknown'}};
export type MissionPhaseResult={order_ref:string;phase_ref:MissionRef<'phase'>;plan_ref:MissionRef<'plan'>;known_report_delivery_refs:[string,string];verification_state:'confirmed'};
export type MissionDecisionEvidenceReceipt={kind:'mission_report'|'position_report';run_id:string;report_ref:string;delivery_ref:string;origin:'R';target:'HQ';reported_at:number;received_at:number};
export type MissionDecisionRecord={
  id:string;run_id:string;version:1;actor:'staff';operation:'issue_mission';knowledge_revision:number;view_digest:string;at:number;
  actual_intent:MissionDraft['intent'];selected_action:MissionDraft['phases'][number]['activity'];plan_ref:MissionRef<'plan'>;phase_ref:MissionRef<'phase'>;authority_ref:MissionRef<'authority'>;order_ref:string;evidence_refs:string[];
  reason_status:'recorded'|'not_recorded';declared_reason?:string;
  known_then:{mission:KnownMission;plan:SavedMissionPlan;position_knowledge:PositionKnowledge;resources:MissionResources;phase_results:MissionPhaseResult[];prior_orders:Array<Pick<MissionOrder,'id'|'phase_ref'|'plan_ref'|'status'>>;held_windows:MissionHeldWindow[];outbound_sent_times:number[];selected_received_evidence:MissionDecisionEvidenceReceipt[]};
};
export type MissionDecisionRuleId='context_completeness'|'public_rule_compliance'|'declared_reason_evaluability';
export type MissionEvaluationRecord=Omit<MissionDecisionRecord,'known_then'>&{known_then:Partial<MissionDecisionRecord['known_then']>};
export type MissionDecisionHistory={id:string;version:1;source_ref:string;records:[{case_id:'complete_public_violation';record:MissionEvaluationRecord},{case_id:'missing_necessary_evidence';record:MissionEvaluationRecord}]};
export type EvaluateMissionDecision={run_id:string;view_revision:number;decision_ref:MissionRef<'decision'>};
export type MissionAssessmentRef=MissionRef<'decision'|'plan'|'authority'>|{run_id:string;kind:'evidence';id:string};
export type MissionDecisionCheck={rule_ref:{id:MissionDecisionRuleId;version:number};known_then_refs:MissionAssessmentRef[];result:'met'|'violated'|'not_evaluable';missing:string[];violations:string[]};
export type MissionDecisionEvaluation={run_id:string;decision_ref:MissionRef<'decision'>;view_revision:number;known_at_time_ms:number;checks:MissionDecisionCheck[];record_source:{kind:'current_run'}|{kind:'registered_history';catalog_ref:string;source_ref:string}};
export type MissionRetrospectiveExplanation={id:string;run_id:string;version:number;decision_ref:MissionRef<'decision'>;text:string;created_time_ms:number;author:'staff';layer:'retrospective_inference'};
export type AppendMissionExplanation={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'append_explanation';decision_ref:MissionRef<'decision'>;expected_object_revision:number;text:string}};
export type MissionPlayerView={
  scenario_kind:'play_mission';run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;source_run:string|null;
  status:'draft'|'ready'|'preparing'|'denied'|'active'|'completed';geometry:PublicMap;position_knowledge:PositionKnowledge;authority:{from:number;to:number};resources:MissionResources;
  mission:KnownMission|null;plans:SavedMissionPlan[];issued_orders:MissionOrder[];held_windows:MissionHeldWindow[];can_issue:boolean;next_action:string;gap:string;
  reports:MissionReport[];deliveries:MissionDelivery[];phase_results:MissionPhaseResult[];decision_records:MissionDecisionRecord[];retrospective_explanations:MissionRetrospectiveExplanation[];
  replay_nodes:PlayerView['replay_nodes'];log:LogEntry[];
};
