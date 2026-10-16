import {GameError} from './contracts';
import {record,fields,valid_id} from './protocol';
import {dense_array,coordinate} from './spatial';
import type {ConditionExpr,MissionDraft,SavePlanEnvelope,IssueMissionEnvelope,EvaluateMissionDecision,AppendMissionExplanation} from './mission-contracts';
import {mission_preview} from './mission-dto';
export const mission_input_limits={phase_budget:2,route_point_budget:64,total_route_point_budget:128,evidence_budget:32,expression_depth_budget:4,expression_node_budget:32,text_budget:2000};
const text=(x:unknown):x is string=>typeof x==='string'&&[...x].length<=mission_input_limits.text_budget;
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const list=(x:unknown,check:(x:unknown)=>boolean)=>dense_array(x)&&x.length<=32&&x.every(check);
function object(x:unknown,keys:string[]):asserts x is Record<string,unknown>{if(!record(x)||!fields(x,keys))throw new GameError('INVALID_REQUEST');}
export function mission_ref(x:unknown,run:string,kind:string):boolean{return record(x)&&fields(x,['run_id','kind','id','version'])&&x.run_id===run&&x.kind===kind&&valid_id(x.id)&&integer(x.version)&&x.version>0;}
function expression(x:unknown,depth=1,budget={nodes:0}):x is ConditionExpr{
  if(depth>mission_input_limits.expression_depth_budget||++budget.nodes>mission_input_limits.expression_node_budget)return false;
  if(!record(x))return false;
  if(x.kind==='not')return fields(x,['kind','child'])&&expression(x.child,depth+1,budget);
  if(x.kind==='all'||x.kind==='any')return fields(x,['kind','children'])&&dense_array(x.children)&&x.children.length>0&&x.children.length<=32&&x.children.every(child=>expression(child,depth+1,budget));
  if(x.kind!=='compare'||!fields(x,['kind','field_ref','operator','typed_value']))return false;
  return x.field_ref==='position.scope'?['eq','in'].includes(String(x.operator))&&valid_id(x.typed_value):['phase.confirmed','route.permitted','capability.ready'].includes(String(x.field_ref))&&['eq','ne'].includes(String(x.operator))&&typeof x.typed_value==='boolean';
}
export function valid_mission_expression(value:unknown):value is ConditionExpr{return expression(value);}
export function parse_mission_intent(value:unknown,run:string):MissionDraft['intent']{
  object(value,['id','version','purpose','desired_end_state','key_tasks','priorities','constraint_refs','acceptable_risk','delegation_ref']);
  if(!valid_id(value.id)||!integer(value.version)||value.version<1||!text(value.purpose)||!value.purpose.trim()||!text(value.desired_end_state)||!value.desired_end_state.trim()||!list(value.key_tasks,text)||!list(value.priorities,text)||!list(value.constraint_refs,valid_id)||!text(value.acceptable_risk)||!mission_ref(value.delegation_ref,run,'authority'))throw new GameError('INVALID_REQUEST');
  return structuredClone(value) as MissionDraft['intent'];
}
export function parse_mission_draft(value:unknown,run:string):MissionDraft{
  object(value,['run_id','plan_id','mission_ref','intent','objective','phases','routes','actor_assignments','support_windows','assumptions','evidence_refs','decision_points','note']);
  if(value.run_id!==run||!valid_id(value.plan_id)||!mission_ref(value.mission_ref,run,'mission')||!text(value.note))throw new GameError('INVALID_REQUEST');
  parse_mission_intent(value.intent,run);
  const objective=value.objective;object(objective,['id','purpose','success_expr','failure_expr','deadline_time_ms','verification_requirements','priority','dependencies']);
  if(!valid_id(objective.id)||!text(objective.purpose)||!expression(objective.success_expr)||!expression(objective.failure_expr)||!integer(objective.deadline_time_ms)||!integer(objective.priority)||!list(objective.verification_requirements,valid_id)||!list(objective.dependencies,x=>mission_ref(x,run,'objective')))throw new GameError('INVALID_REQUEST');
  if(!dense_array(value.phases)||value.phases.length<1||value.phases.length>mission_input_limits.phase_budget||!dense_array(value.routes)||!value.routes.length||value.routes.length>mission_input_limits.total_route_point_budget/2)throw new GameError('INVALID_REQUEST');
  for(const phase of value.phases){
    object(phase,['id','version','kind','dependencies','entry_gate','exit_gate','earliest_start_time_ms','latest_finish_time_ms','activity']);
    if(!integer(phase.version)||phase.version<1)throw new GameError('INVALID_REQUEST');
    object(phase.activity,['kind','actor','route_ref']);
    if(!valid_id(phase.id)||phase.kind!=='move'||!list(phase.dependencies,x=>mission_ref(x,run,'phase'))||!expression(phase.entry_gate)||!expression(phase.exit_gate)||!integer(phase.earliest_start_time_ms)||!integer(phase.latest_finish_time_ms)||phase.latest_finish_time_ms<=phase.earliest_start_time_ms||phase.activity.kind!=='move'||phase.activity.actor!=='R'||!mission_ref(phase.activity.route_ref,run,'route'))throw new GameError('INVALID_REQUEST');
    if((phase.dependencies as Array<{id:string}>).some(ref=>ref.id===phase.id))throw new GameError('INVALID_REQUEST','mission_draft.phases.self_dependency');
  }
  let total_points=0;
  for(const route of value.routes){object(route,['id','version','path']);if(!valid_id(route.id)||!integer(route.version)||route.version<1||!dense_array(route.path)||route.path.length<2||route.path.length>mission_input_limits.route_point_budget||!route.path.every(coordinate))throw new GameError('INVALID_REQUEST');total_points+=route.path.length;}
  if(total_points>mission_input_limits.total_route_point_budget)throw new GameError('INVALID_REQUEST','mission_draft.routes.total_points');
  if(!dense_array(value.actor_assignments)||value.actor_assignments.length!==1||value.actor_assignments[0]!=='R'||!dense_array(value.support_windows)||value.support_windows.length!==0||!list(value.assumptions,text)||!list(value.evidence_refs,valid_id)||!list(value.decision_points,text))throw new GameError('INVALID_REQUEST');
  const draft=structuredClone(value) as MissionDraft;
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string)=>{
    if(!draft.phases.some(x=>x.id===id))throw new GameError('INVALID_REQUEST','mission_draft.phases.dangling_dependency');
    if(visiting.has(id))throw new GameError('INVALID_REQUEST','mission_draft.phases.cyclic_dependencies');
    if(visited.has(id))return;
    visiting.add(id);
    for(const ref of draft.phases.find(x=>x.id===id)?.dependencies??[])visit(ref.id);
    visiting.delete(id);visited.add(id);
  };
  for(const phase of draft.phases)visit(phase.id);
  return draft;
}
export function parse_save_plan(value:unknown):SavePlanEnvelope{
  object(value,['run_id','operation_id','expected_revision','intent']);
  if(!valid_id(value.run_id)||!valid_id(value.operation_id)||!integer(value.expected_revision)||value.expected_revision<1)throw new GameError('INVALID_REQUEST');
  const intent=value.intent;object(intent,['kind','base_plan_ref','expected_object_revision','draft']);
  if(intent.kind!=='save_plan'||!integer(intent.expected_object_revision)||!(intent.base_plan_ref===null||mission_ref(intent.base_plan_ref,value.run_id,'plan')))throw new GameError('INVALID_REQUEST');
  return {run_id:value.run_id,operation_id:value.operation_id,expected_revision:value.expected_revision,intent:{kind:'save_plan',base_plan_ref:intent.base_plan_ref as SavePlanEnvelope['intent']['base_plan_ref'],expected_object_revision:intent.expected_object_revision,draft:parse_mission_draft(intent.draft,value.run_id)}};
}
export function parse_issue_mission(value:unknown):IssueMissionEnvelope{
  object(value,['run_id','operation_id','expected_revision','intent']);
  if(!valid_id(value.run_id)||!valid_id(value.operation_id)||!integer(value.expected_revision)||value.expected_revision<1||!record(value.intent))throw new GameError('INVALID_REQUEST');
  const intent=value.intent;
  object(intent,['kind','expected_object_revision','plan_ref','phase_ref','grant_ref','preview','evidence_refs',...(Object.hasOwn(intent,'reason')?['reason']:[])]);
  if(intent.kind!=='issue_mission'||!integer(intent.expected_object_revision)||!mission_ref(intent.plan_ref,value.run_id,'plan')||!mission_ref(intent.phase_ref,value.run_id,'phase')||!mission_ref(intent.grant_ref,value.run_id,'authority')||!mission_preview(intent.preview)||!list(intent.evidence_refs,valid_id)||Object.hasOwn(intent,'reason')&&!text(intent.reason))throw new GameError('INVALID_REQUEST');
  return structuredClone(value) as IssueMissionEnvelope;
}
export function parse_evaluate_mission(value:unknown):EvaluateMissionDecision{
  object(value,['run_id','view_revision','decision_ref']);
  if(!valid_id(value.run_id)||!integer(value.view_revision)||value.view_revision<1||!record(value.decision_ref)||!valid_id(value.decision_ref.run_id)||!mission_ref(value.decision_ref,value.decision_ref.run_id,'decision'))throw new GameError('INVALID_REQUEST');
  return structuredClone(value) as EvaluateMissionDecision;
}
export function parse_append_mission(value:unknown):AppendMissionExplanation{
  object(value,['run_id','operation_id','expected_revision','intent']);
  if(!valid_id(value.run_id)||!valid_id(value.operation_id)||!integer(value.expected_revision)||value.expected_revision<1)throw new GameError('INVALID_REQUEST');
  const intent=value.intent;object(intent,['kind','decision_ref','expected_object_revision','text']);
  if(intent.kind!=='append_explanation'||!mission_ref(intent.decision_ref,value.run_id,'decision')||!integer(intent.expected_object_revision)||!text(intent.text)||!intent.text.trim())throw new GameError('INVALID_REQUEST');
  return structuredClone(value) as AppendMissionExplanation;
}
