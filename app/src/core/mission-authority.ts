import type {MissionDraft,MissionAuthorization} from '../mission-contracts';
import type {PublicMap} from '../spatial';
import type {MissionDefinition} from './mission-definition';
import {public_route_gap} from '../route-validation';

type AuthorityContext={at:number;grant:MissionDefinition['catalogs']['authority'];map:PublicMap};
export function evaluate_mission_authority(draft:MissionDraft,phase:MissionDraft['phases'][number],context:AuthorityContext):MissionAuthorization{
  const {grant,map,at}=context,route=draft.routes.find(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version);
  const permitted={...map,scopes:map.scopes.filter(scope=>scope.kind!=='corridor'||grant.spatial_scope.includes(scope.id))};
  const dimensions={
    mission:grant.mission_scope.includes(draft.mission_ref.id),
    actor:grant.holder==='staff'&&grant.actors.includes(phase.activity.actor),
    action:grant.action_kinds.includes(phase.activity.kind),
    space:!!route&&!public_route_gap(permitted,route.path),
    time:at>=grant.valid_from_time_ms&&at<grant.valid_to_time_ms&&phase.earliest_start_time_ms>=grant.valid_from_time_ms&&phase.latest_finish_time_ms<=grant.valid_to_time_ms,
    risk:grant.risk_limits.includes(draft.intent.acceptable_risk)
  };
  const labels={mission:'任务',actor:'编组',action:'行动类型',space:'路线空间',time:'时段',risk:'风险'};
  const denied=(Object.keys(dimensions) as Array<keyof typeof dimensions>).filter(key=>!dimensions[key]);
  return {status:denied.length?'denied':'met',session_role:'staff',grant_ref:{...draft.intent.delegation_ref},dimensions,code:denied.length?'AUTHORITY_DENIED':null,gap:denied.length?'既有预授权未覆盖：'+denied.map(key=>labels[key]).join('、'):''};
}
