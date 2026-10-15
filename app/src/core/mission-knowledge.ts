import type {MissionPlayerView} from '../mission-contracts';
import type {MissionState} from './mission-state';
import {mission_definition_for_package} from './mission-definition';
export function project_mission_view(state:MissionState):MissionPlayerView{
  const definition=mission_definition_for_package(state.definition_hash),p=definition.profile.parameters;
  return {scenario_kind:'play_mission',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:false,source_run:state.source_run,status:state.status,geometry:structuredClone(definition.catalogs.map),position_knowledge:structuredClone(state.known.position_knowledge),authority:{from:p.grant_from,to:p.grant_until},resources:structuredClone(state.known.resources),mission:structuredClone(state.mission),plans:structuredClone(state.plans),issued_orders:[],can_issue:false,next_action:state.mission?'草案已保存，尚未下达':'填写目的与期望结果，保存结构化任务草案',gap:state.mission?'已保存草案不会发送或执行':'任务尚未保存或下达',replay_nodes:state.inputs.map(x=>({revision:x.revision,at:x.at,meaningful:true,label:'保存任务草案'})),log:structuredClone(state.log)};
}
