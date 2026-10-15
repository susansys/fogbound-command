import type {PlayPlayerView} from '../play-contracts';
import type {PlayState} from './play-state';
import {play_definition_for_package,type PlayDefinition} from './scenario';
import {validate_public_map} from '../spatial';

export function project_play_view(state:PlayState,registered:readonly PlayDefinition[]=[]):PlayPlayerView{
  const definition=play_definition_for_package(state.definition_hash,registered),p=definition.profile.parameters;
  const map=structuredClone(definition.catalogs.map);validate_public_map(map);
  const position=state.known.position_knowledge;
  const exact=position.status==='known_scope'&&position.scope.kind==='point'&&position.scope.uncertainty.kind==='known'&&position.scope.uncertainty.value===0;
  const can_issue=state.status==='ready'&&state.sim_time<p.deadline&&exact;
  return {scenario_kind:'play_corridor',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:false,source_run:state.source_run,status:state.status,geometry:map,position_knowledge:structuredClone(position),authority:{from:definition.catalogs.authority.from,to:definition.catalogs.authority.to},public_rules:{deadline:p.deadline,receipt_grace:p.receipt_grace,link_ms:p.link_ms,rules_hash:definition.hashes.rules},resources:structuredClone(state.known.resources),can_issue,next_action:can_issue?'选择公开走廊，拟定移动路线':'查看已收到的位置依据与记录',gap:!exact?'需要明确起点回报':state.sim_time>=p.deadline?'移动窗口已结束':'',issued_orders:[],replay_nodes:state.inputs.map(x=>({revision:x.revision,at:x.at,meaningful:true,label:x.envelope.intent.kind==='save'?'保存记录':'管理记录'})),log:structuredClone(state.log)};
}
