import {GameError} from '../contracts';
import {integratedPlanningPolicy as policy,integrated_plan_gates,integrated_plan_estimate} from '../integrated-field-contracts';
import type {IntegratedAssessment,IntegratedFieldEnvelope,IntegratedFieldPlayerView,IntegratedPlanningBasis,IntegratedPlanningRef,IntegratedPlanIssue,IntegratedSavedPlan,IntegratedActionPayload} from '../integrated-field-contracts';
import type {IntegratedFieldState} from './integrated-field-state';
import {canonical} from './snapshot';

export type IntegratedPlanningState={assessments:IntegratedAssessment[];plans:IntegratedSavedPlan[];issues:IntegratedPlanIssue[]};
export const initial_integrated_planning=():IntegratedPlanningState=>({assessments:[],plans:[],issues:[]});
const same=(a:IntegratedPlanningRef<'working_assessment'|'field_plan'>|null,b:IntegratedPlanningRef<'working_assessment'|'field_plan'>|null)=>a===null||b===null?a===b:a.run_id===b.run_id&&a.kind===b.kind&&a.id===b.id&&a.version===b.version;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

function legal_basis(view:IntegratedFieldPlayerView,problem:typeof policy.problems[keyof typeof policy.problems],basis:IntegratedPlanningBasis){
 if(basis.run_id!==view.run_id||basis.version!==1)return false;
 const delivery=basis.kind==='delivery'?view.activity_reports.find(value=>value.id===basis.id):view.activity_reports.find(value=>value.report_ref===basis.id),report=view.reports.find(value=>value.ref.id===(basis.kind==='report'?basis.id:delivery?.report_ref));
 return !!delivery&&!!report&&delivery.received_at<=view.sim_time&&problem.report_scopes.some(scope=>scope===report.scope_ref.id)&&(problem.question_type!=='facility_condition'||report.body.kind==='facility_status');
}
export function save_integrated_assessment(state:IntegratedFieldState,envelope:IntegratedFieldEnvelope,view:IntegratedFieldPlayerView){
 const intent=envelope.intent;if(intent.kind!=='integrated_assess')throw new GameError('INVALID_INPUT');
 const draft=intent.draft,problem=policy.problems[draft.problem_id],previous=state.planning.assessments.filter(value=>value.problem_id===draft.problem_id).at(-1)?.ref??null;
 if(!same(previous,intent.base_ref))throw new GameError('STALE_ASSESSMENT');
 if(state.planning.assessments.length>=policy.assessment_versions)throw new GameError('CONSTRAINT_DENIED');
 if(draft.basis_refs.some(basis=>!legal_basis(view,problem,basis))||new Set(draft.basis_refs.map(basis=>basis.kind+':'+basis.id)).size!==draft.basis_refs.length)throw new GameError('INVALID_REQUEST');
 if(draft.assumption_refs.some(ref=>ref.run_id!==state.run_id||ref.version!==1||!problem.assumption_ids.some(id=>id===ref.id)||!view.model_catalog.parameters.some(parameter=>parameter.id===ref.id&&parameter.category==='C')))throw new GameError('INVALID_REQUEST');
 const assessment:IntegratedAssessment={ref:{run_id:state.run_id,kind:'working_assessment',id:'ASSESS-'+draft.problem_id,version:(previous?.version??0)+1},problem_id:draft.problem_id,target_scope:problem.target_scope,question_type:problem.question_type,explanations:[...problem.explanations],preferred:draft.preferred??'undecided',basis_refs:structuredClone(draft.basis_refs),assumption_refs:structuredClone(draft.assumption_refs),as_of:state.sim_time,supersedes:previous?structuredClone(previous):null,...(draft.reason===undefined?{}:{reason:draft.reason})};
 state.planning.assessments.push(assessment);
}

function action_basis_legal(view:IntegratedFieldPlayerView,action:IntegratedActionPayload){
 if(action.kind==='integrated_prepare')return action.plan_ref.run_id===view.run_id&&action.plan_ref.id==='B33-PLAN-1';
 if(action.kind==='integrated_move')return true;
 const known=new Set([...view.activity_reports.map(report=>report.id),...view.actors.map(actor=>actor.position.evidence),'opening-A-access',...(view.preparation?.approval_ref?[view.preparation.approval_ref.id]:[])]);
 return action.basis_refs.every(ref=>ref.run_id===view.run_id&&ref.version===1&&known.has(ref.id))&&(action.actor!=='W'||action.plan_ref.run_id===view.run_id&&action.plan_ref.id==='B33-PLAN-1');
}
export function save_integrated_plan(state:IntegratedFieldState,envelope:IntegratedFieldEnvelope,view:IntegratedFieldPlayerView){
 const intent=envelope.intent;if(intent.kind!=='integrated_save_plan')throw new GameError('INVALID_INPUT');
 const assessment=state.planning.assessments.find(value=>same(value.ref,intent.assessment_ref));if(!assessment||!action_basis_legal(view,intent.action))throw new GameError('INVALID_REQUEST');
 const previous=state.planning.plans.filter(plan=>plan.assessment_ref.id===assessment.ref.id).at(-1)?.ref??null;if(!same(previous,intent.base_ref))throw new GameError('STALE_PLAN');
 if(state.planning.plans.length>=policy.plan_versions)throw new GameError('CONSTRAINT_DENIED');
 const action=intent.action;if(assessment.problem_id==='facility_B'&&action.kind!=='integrated_prepare'&&action.target!=='B')throw new GameError('INVALID_REQUEST');
 const actor=action.kind==='integrated_prepare'?null:action.actor,configuration=actor?view.model_catalog.objects.find(object=>object.object_ref.id===actor)?.configuration_ref??null:null,known=actor?view.actors.find(value=>value.id===actor)?.position.point[0]:undefined,paths:Array<'HA'|'AB'>=[];
 if(action.kind==='integrated_move'&&known!==undefined){const to=view.geometry.points[action.target][0],a=view.geometry.points.A[0];if(Math.min(known,to)<a)paths.push('HA');if(Math.max(known,to)>a)paths.push('AB');if(to<known)paths.reverse();}
 const hard_gates=integrated_plan_gates(action);
 const evidence=[...assessment.basis_refs.map(({run_id,id,version})=>({run_id,id,version})),...(action.kind==='integrated_activity'?action.basis_refs:[])];
 const plan:IntegratedSavedPlan={ref:{run_id:state.run_id,kind:'field_plan',id:'PLAN-'+assessment.ref.id,version:(previous?.version??0)+1},assessment_ref:structuredClone(assessment.ref),as_of:state.sim_time,supersedes:previous?structuredClone(previous):null,evidence_version_refs:evidence.filter((ref,index,all)=>all.findIndex(other=>other.run_id===ref.run_id&&other.id===ref.id&&other.version===ref.version)===index).map(ref=>structuredClone(ref)),action:structuredClone(action),model_ref:structuredClone(view.model_catalog.model_ref),definition_hash:state.definition_hash,model_hash:state.hashes.model,configuration_ref:structuredClone(configuration),path_refs:paths.map(id=>({run_id:state.run_id,kind:'road',id,version:1})),parameter_snapshot:structuredClone(view.model_catalog.parameters),position_snapshot:structuredClone(view.actors),estimate:integrated_plan_estimate({parameters:view.model_catalog.parameters,actors:view.actors,geometry:view.geometry},action),hard_gates,conditions:['条件情景值，非现实校准；短长档为假设范围，非统计区间','保存方案不占资源、不签发命令；签发与当地接令仍分别核验'],unknowns:['排队、当地实时条件与拒绝不包含在预计中'],...(intent.note===undefined?{}:{note:intent.note})};
 state.planning.plans.push(plan);
}
export function validate_integrated_plan_issue(state:IntegratedFieldState,envelope:IntegratedFieldEnvelope){
 const intent=envelope.intent;if(!('saved_plan_ref' in intent)||intent.saved_plan_ref===undefined)return null;
 const {saved_plan_ref,...payload}=intent,plan=state.planning.plans.find(plan=>same(plan.ref,saved_plan_ref));if(!plan||plan.definition_hash!==state.definition_hash||!equal(plan.action,payload))throw new GameError('INVALID_REQUEST');return plan;
}
export function planning_view(state:IntegratedFieldState):IntegratedFieldPlayerView['planning']{
 const changed=(as_of:number)=>state.work.deliveries.filter(delivery=>delivery.received_at<=state.sim_time).sort((a,b)=>a.received_at-b.received_at||a.id.localeCompare(b.id)).filter((delivery,index,all)=>all.findIndex(other=>other.report_id===delivery.report_id)===index).some(delivery=>delivery.received_at>as_of)||state.position_reports.some(report=>report.received_at>as_of&&report.received_at<=state.sim_time)||(state.work.preparation?.approved_at!==null&&state.work.preparation?.approved_at!==undefined&&state.work.preparation.approved_at>as_of&&state.work.preparation.approved_at<=state.sim_time);
 const position_evidence:IntegratedFieldPlayerView['actors']=(['R','W'] as const).filter(id=>state.actors[id].known!==null).map(id=>({id,position:{point:structuredClone(state.definition.geometry.points[id==='R'?'H':'B']),observed_at:0,received_at:0,evidence:'opening-'+id}}));
 for(const report of state.position_reports.filter(report=>state.actors[report.actor].known!==null&&report.received_at<=state.sim_time))position_evidence.push({id:report.actor,position:{point:[report.point_um[0]/1000000,report.point_um[1]/1000000],observed_at:report.observed_at,received_at:report.received_at,evidence:report.evidence}});
 return{catalog:structuredClone(policy),position_evidence,assessments:structuredClone(state.planning.assessments),plans:state.planning.plans.map(plan=>({plan:structuredClone(plan),has_new_material:changed(plan.as_of)})),issues:structuredClone(state.planning.issues)};
}
