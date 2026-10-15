import type {MissionDraft,MissionPhaseResult,MissionReport,MissionDelivery} from './mission-contracts';
import type {PublicMap} from './spatial';

type GoalEvidence={draft:MissionDraft;phase_results:MissionPhaseResult[];reports:MissionReport[];deliveries:MissionDelivery[];geometry:PublicMap;as_of_time_ms:number};
// This interface accepts HQ-delivered evidence only. Actual world status,
// undelivered actor originals and engine provenance are not goal inputs.
export function mission_goal_confirmed(context:GoalEvidence):boolean{
  const {draft,reports,deliveries,geometry,as_of_time_ms}=context,success=draft.objective.success_expr;
  if(success.kind!=='compare'||success.field_ref!=='position.scope'||success.operator!=='eq')return false;
  const target=geometry.scopes.find(s=>s.id===success.typed_value);if(target?.kind!=='point')return false;
  const confirmed:Array<{report:MissionReport;observed_at:number}>=[];
  for(const phase of draft.phases){
    const result=context.phase_results.find(r=>r.phase_ref.run_id===draft.run_id&&r.phase_ref.id===phase.id&&r.phase_ref.version===phase.version);
    if(!result||result.verification_state!=='confirmed'||result.plan_ref.run_id!==draft.run_id)return false;
    const report=reports.find(r=>r.id===result.known_report_delivery_refs[0]),delivery=deliveries.find(d=>d.id===result.known_report_delivery_refs[1]);
    if(!report||!delivery||delivery.report_ref!==report.id||delivery.received>as_of_time_ms||report.run_id!==draft.run_id||report.actor!=='R'||report.target!=='HQ'||report.kind!=='arrived'||report.order_ref!==result.order_ref||report.phase_ref.run_id!==draft.run_id||report.phase_ref.id!==phase.id||report.phase_ref.version!==phase.version||report.plan_ref.run_id!==draft.run_id||report.plan_ref.id!==result.plan_ref.id||report.plan_ref.version!==result.plan_ref.version||report.observed.kind!=='known'||report.observed.value<phase.earliest_start_time_ms||report.observed.value>phase.latest_finish_time_ms||report.observed.value>draft.objective.deadline_time_ms||report.observed.value>report.reported||report.reported>delivery.received)return false;
    confirmed.push({report,observed_at:report.observed.value});
  }
  const last=confirmed.sort((a,b)=>b.observed_at-a.observed_at)[0],scope=last?.report.position_scope;
  return scope?.kind==='point'&&scope.uncertainty.kind==='known'&&scope.uncertainty.value===0&&scope.typed_geometry.position[0]===target.typed_geometry.position[0]&&scope.typed_geometry.position[1]===target.typed_geometry.position[1];
}
