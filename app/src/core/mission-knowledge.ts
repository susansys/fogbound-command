import type {MissionPlayerView} from '../mission-contracts';
import type {MissionState} from './mission-state';
import {mission_definition_for_package} from './mission-definition';
import type {MissionDefinition} from './mission-definition';
import {mission_phase_previews} from './mission-preview';
import {assert_mission_phase} from './mission-issue';
import {GameError} from '../contracts';
export function project_mission_view(state:MissionState,owned:readonly MissionDefinition[]=[]):MissionPlayerView{
  const definition=mission_definition_for_package(state.definition_hash,owned),p=definition.profile.parameters;
  let status:MissionPlayerView['status']=state.status,can_issue=false,gap=state.mission?'已保存草案不会发送或执行':'任务尚未保存或下达';
  const plan=state.plans.find(v=>v.plan_id===state.mission?.current_plan_ref.id&&v.version===state.mission.current_plan_ref.version);
  const phase=plan?.draft.phases.find(v=>!state.orders.some(o=>o.phase_ref.id===v.id&&o.phase_ref.version===v.version));
  if(plan&&phase){
    try{
      const checked=mission_phase_previews(state,plan.draft,definition).find(v=>v.phase_id===phase.id)!;
      assert_mission_phase(state,plan.draft,phase,checked,definition);can_issue=true;status='ready';gap='总部依据齐备，确认前仍会重核；现场须独立接令复核';
    }catch(error){
      const code=error instanceof GameError?error.code:'ENGINE_UNCONFIRMED';
      status=['CONSTRAINT_HOLD','EVIDENCE_REQUIRED','STATE_CONFIRMATION_REQUIRED'].includes(code)?'preparing':'denied';
      const gaps:Record<string,string>={AUTHORITY_DENIED:'当前预授权未覆盖，需要核对授权范围',CONSTRAINT_HOLD:'依据未知或已过期，需要核实',CONSTRAINT_DENIED:'已知硬条件或时间窗不满足',EVIDENCE_REQUIRED:'缺少当前可用的唯一精确位置依据',STATE_CONFIRMATION_REQUIRED:'等待对应阶段的合法确认回报',CAPACITY_CONFLICT:'当前已知预约或发送窗口有冲突'};
      gap=gaps[code]??'当前条件尚未核实';
    }
  }else if(state.orders.length)gap=state.orders.at(-1)!.status==='accepted'?'等待完成回报，结果尚未确认':'等待接令回报，结果尚未确认';
  if(state.mission?.status==='completed'){status='completed';can_issue=false;gap='移动目标已确认';}
  return {scenario_kind:'play_mission',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:false,source_run:state.source_run,status,geometry:structuredClone(definition.catalogs.map),position_knowledge:structuredClone(state.known.position_knowledge),authority:{from:p.grant_from,to:p.grant_until},resources:structuredClone(state.known.resources),mission:structuredClone(state.mission),plans:structuredClone(state.plans),issued_orders:state.orders.map(({frozen_payload,...order})=>structuredClone(order)),held_windows:structuredClone(state.held_windows),reports:state.sent_reports.filter(r=>state.deliveries.some(d=>d.report_ref===r.id)).map(r=>structuredClone(r)),deliveries:structuredClone(state.deliveries),phase_results:state.known.phase_confirmations.map(c=>({order_ref:c.order_ref,phase_ref:{run_id:state.run_id,kind:'phase' as const,id:c.phase_id,version:c.phase_version},plan_ref:{run_id:state.run_id,kind:'plan' as const,id:c.plan_id,version:c.plan_version},known_report_delivery_refs:[c.report_ref,c.delivery_ref] as [string,string],verification_state:'confirmed' as const})),can_issue,next_action:state.mission?.status==='completed'?'查看已收阶段凭证与记录':can_issue?'核对当前阶段并明确下达':state.mission?'查看当前缺口或合法回报':'填写目的与期望结果，保存结构化任务草案',gap,replay_nodes:state.inputs.map(x=>({revision:x.revision,at:x.at,meaningful:true,label:'保存任务草案'})),log:structuredClone(state.log)};
}
