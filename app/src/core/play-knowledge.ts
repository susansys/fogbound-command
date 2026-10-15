import type {PlayPlayerView} from '../play-contracts';
import type {PlayState} from './play-state';
import {play_definition_for_package,type PlayDefinition} from './scenario';
import {validate_public_map} from '../spatial';
import {movement_basis_for_definition} from './play-timing';
import {GameError} from '../contracts';

export function project_play_view(state:PlayState,registered:readonly PlayDefinition[]=[]):PlayPlayerView{
  const definition=play_definition_for_package(state.definition_hash,registered),p=definition.profile.parameters;
  const map=structuredClone(definition.catalogs.map);validate_public_map(map);
  const position=state.known.position_knowledge;
  const exact=position.status==='known_scope'&&position.scope.kind==='point'&&position.scope.uncertainty.kind==='known'&&position.scope.uncertainty.value===0;
  const can_issue=['ready','arrived'].includes(state.status)&&state.sim_time<p.deadline&&exact;
  return {
    scenario_kind:'play_corridor',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:false,source_run:state.source_run,status:state.status,
    geometry:map,position_knowledge:structuredClone(position),authority:{from:definition.catalogs.authority.from,to:definition.catalogs.authority.to},
    public_rules:{deadline:p.deadline,receipt_grace:p.receipt_grace,link_ms:p.link_ms,rules_hash:definition.hashes.rules,report_policy:{budget:p.report_budget,energy_per_send:p.report_energy_cost,wear_per_send:p.report_wear_cost}},
    movement_basis:movement_basis_for_definition(definition),resources:structuredClone(state.known.resources),can_issue,
    next_action:can_issue?'选择公开走廊，拟定移动路线':'查看已收到的位置依据与记录',gap:!exact?'需要明确起点回报':state.sim_time>=p.deadline?'移动窗口已结束':'',
    issued_orders:state.requests.map(request=>({command_id:request.command_id,issued:request.issued,plan:structuredClone(request.plan),...(request.reason===undefined?{}:{reason:request.reason})})),
    received_reports:state.deliveries.map(delivery=>{const report=state.reports.find(value=>value.id===delivery.report_id);if(!report)throw new GameError('ENGINE_UNCONFIRMED');return {report:structuredClone(report),delivery:structuredClone(delivery)};}),
    replay_nodes:state.inputs.map(x=>({revision:x.revision,at:x.at,meaningful:true,label:x.envelope.intent.kind==='save'?'保存记录':'管理记录'})),log:structuredClone(state.log)
  };
}
