import type {IssueMissionEnvelope,MissionDecisionRecord,MissionDecisionEvaluation,MissionDecisionCheck,MissionDecisionRuleId,MissionAssessmentRef,MissionEvaluationRecord} from '../mission-contracts';
import type {MissionState} from './mission-state';
import type {MissionDefinition} from './mission-definition';
import {apply_issue_mission,assert_mission_phase,type MissionIssueContext} from './mission-issue';
import {project_mission_view} from './mission-knowledge';
import {canonical} from './snapshot';
import {hash} from './scenario';
import {GameError} from '../contracts';
import {mission_phase_previews,type MissionPublicDefinition} from './mission-preview';
import {parse_append_mission} from '../mission-protocol';

export async function apply_recorded_issue(state:MissionState,input:IssueMissionEnvelope,owned:readonly MissionDefinition[]=[]):Promise<MissionState>{
  const candidate=await apply_issue_mission(state,input,owned),before=project_mission_view(state,owned),order=candidate.orders.at(-1)!;
  const plan=before.plans.find(p=>p.plan_id===order.plan_ref.id&&p.version===order.plan_ref.version)!;
  const phase=plan.draft.phases.find(p=>p.id===order.phase_ref.id&&p.version===order.phase_ref.version)!;
  const reason=input.intent.reason?.trim()?input.intent.reason:undefined;
  const record:MissionDecisionRecord={
    id:'decision-'+order.id,run_id:state.run_id,version:1,actor:'staff',operation:'issue_mission',knowledge_revision:before.revision,view_digest:await hash(canonical(before)),at:before.sim_time,
    actual_intent:structuredClone(plan.draft.intent),selected_action:structuredClone(phase.activity),plan_ref:structuredClone(order.plan_ref),phase_ref:structuredClone(order.phase_ref),authority_ref:structuredClone(order.grant_ref),order_ref:order.id,evidence_refs:[...input.intent.evidence_refs],reason_status:reason===undefined?'not_recorded':'recorded',...(reason===undefined?{}:{declared_reason:reason}),
    known_then:{mission:structuredClone(before.mission!),plan:structuredClone(plan),position_knowledge:structuredClone(before.position_knowledge),resources:structuredClone(before.resources),phase_results:structuredClone(before.phase_results),prior_orders:before.issued_orders.map(({id,phase_ref,plan_ref,status})=>({id,phase_ref:structuredClone(phase_ref),plan_ref:structuredClone(plan_ref),status})),held_windows:structuredClone(before.held_windows),outbound_sent_times:before.issued_orders.map(o=>o.sent)}
  };
  candidate.decision_records.push(record);
  return candidate;
}
export function apply_mission_explanation(state:MissionState,input:import('../mission-contracts').AppendMissionExplanation):MissionState{
  const envelope=parse_append_mission(input),intent=envelope.intent;
  if(envelope.run_id!==state.run_id||envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  const decision=state.decision_records.find(r=>r.id===intent.decision_ref.id&&r.version===intent.decision_ref.version);if(!decision)throw new GameError('INVALID_REQUEST');
  const revision=state.retrospective_explanations.filter(e=>e.decision_ref.id===decision.id).length;
  if(intent.expected_object_revision!==revision)throw new GameError('OBJECT_VERSION_CONFLICT');
  const candidate=structuredClone(state);
  candidate.retrospective_explanations.push({id:'retrospective-'+(state.retrospective_explanations.length+1),run_id:state.run_id,version:revision+1,decision_ref:structuredClone(intent.decision_ref),text:intent.text,created_time_ms:state.sim_time,author:'staff',layer:'retrospective_inference'});
  candidate.revision++;candidate.inputs.push({envelope:structuredClone(envelope),at:state.sim_time,revision:candidate.revision});return candidate;
}

export function evaluate_mission_decision(record:MissionEvaluationRecord,definition:MissionPublicDefinition,view_revision:number):MissionDecisionEvaluation{
  const ref={run_id:record.run_id,kind:'decision' as const,id:record.id,version:record.version};
  const refs:MissionAssessmentRef[]=[ref,record.plan_ref,record.authority_ref];
  const rule=(id:MissionDecisionRuleId)=>{const selected=definition.rules.decision_checks.find(r=>r.id===id);if(!selected||selected.version!==1)throw new GameError('INVALID_DEFINITION');return {id,version:selected.version};};
  const required=['mission','plan','position_knowledge','resources','phase_results','prior_orders','held_windows','outbound_sent_times'] as const;
  const missing:string[]=required.filter(field=>record.known_then[field]===undefined||record.known_then[field]===null);
  const context=record.known_then as MissionDecisionRecord['known_then'];
  if(!missing.length){
    if(context.plan.plan_id!==record.plan_ref.id||context.plan.version!==record.plan_ref.version||!context.plan.draft.phases.some(p=>p.id===record.phase_ref.id&&p.version===record.phase_ref.version))missing.push('plan_or_phase_ref');
    const position=context.position_knowledge,position_refs=position.status==='conflicting'?position.candidates.flatMap(c=>c.evidence_refs):position.evidence_refs;
    const available=new Set([...context.plan.draft.evidence_refs,...position_refs,...context.phase_results.flatMap(r=>r.known_report_delivery_refs),...definition.capabilities.flatMap(c=>c.evidence_refs),...definition.catalogs.map.scopes.flatMap(s=>s.evidence_refs)]);
    for(const id of record.evidence_refs)if(!available.has(id))missing.push('evidence:'+id);
  }
  const checks:MissionDecisionCheck[]=[{rule_ref:rule('context_completeness'),known_then_refs:refs,result:missing.length?'not_evaluable':'met',missing:[...missing],violations:[]}];
  const compliance:MissionDecisionCheck={rule_ref:rule('public_rule_compliance'),known_then_refs:[...refs,...record.evidence_refs.map(id=>({run_id:record.run_id,kind:'evidence' as const,id}))],result:missing.length?'not_evaluable':'met',missing:[...missing],violations:[]};
  if(!missing.length){
    const known:MissionIssueContext={mission:context.mission,sim_time:record.at,ended:record.at>=definition.profile.parameters.deadline+definition.profile.parameters.receipt_grace,known:{position_knowledge:context.position_knowledge,resources:context.resources,phase_confirmations:context.phase_results.map(r=>({phase_id:r.phase_ref.id,phase_version:r.phase_ref.version,plan_id:r.plan_ref.id,plan_version:r.plan_ref.version,order_ref:r.order_ref,report_ref:r.known_report_delivery_refs[0],delivery_ref:r.known_report_delivery_refs[1]}))},orders:context.prior_orders,held_windows:context.held_windows,outbound_messages:context.outbound_sent_times.map(sent=>({sent}))};
    const draft=context.plan.draft,phase=draft.phases.find(p=>p.id===record.phase_ref.id&&p.version===record.phase_ref.version)!;
    try{const preview=mission_phase_previews({...known,revision:record.knowledge_revision},draft,definition).find(p=>p.phase_id===phase.id)!;assert_mission_phase(known,draft,phase,preview,definition);}catch(error){if(!(error instanceof GameError))throw error;compliance.result='violated';compliance.violations=[error.code];}
  }
  checks.push(compliance);
  const reason_missing=[...missing,...(record.reason_status==='recorded'&&record.declared_reason?.trim()?[]:['declared_reason'])];
  checks.push({rule_ref:rule('declared_reason_evaluability'),known_then_refs:[ref],result:reason_missing.length?'not_evaluable':'met',missing:reason_missing,violations:[]});
  return {run_id:record.run_id,decision_ref:ref,view_revision,known_at_time_ms:record.at,checks,record_source:{kind:'current_run'}};
}
