import type {PlayPlayerView} from '../play-contracts';
import type {RouteDraft,RoutePlan,RouteEstimate} from '../route-contracts';
import {hash} from './scenario';
import {canonical_route,public_route_gap,valid_route_draft} from '../route-validation';
import {GameError} from '../contracts';

export async function preview_corridor(view:PlayPlayerView,editing_seq:number,draft:RouteDraft):Promise<RoutePlan>{
  const {map_id,map_version,crs_id,geometry_version}=view.geometry,identity={map_id,map_version,crs_id,geometry_version};
  if(!valid_route_draft(draft)||draft.map_id!==map_id||draft.map_version!==map_version||draft.crs_id!==crs_id||draft.geometry_version!==geometry_version)throw new GameError('INVALID_REQUEST','route_draft');
  const path=canonical_route(draft.path),basis=view.movement_basis;
  const length_units=path.slice(1).reduce((sum,b,i)=>sum+Math.floor(Math.hypot(b[0]-path[i][0],b[1]-path[i][1])*basis.length_scale+0.5),0);
  const distance=length_units/basis.length_scale,estimated_move_ms=Math.ceil(distance/basis.speed*basis.terrain_factor*basis.environment_factor*(1+basis.load_factor_per_unit*basis.load)*1000);
  const evidence_refs=[...new Set([...basis.evidence_refs,...(view.position_knowledge.status==='conflicting'?[]:view.position_knowledge.evidence_refs)])];
  const location=view.position_knowledge;
  const exact=location.status==='known_scope'&&location.scope.kind==='point'&&location.scope.uncertainty.kind==='known'&&location.scope.uncertainty.value===0;
  const start=location.status==='known_scope'&&location.scope.kind==='point'?location.scope.typed_geometry.position:null;
  const startGap=!exact?'需要明确起点回报':start&&path[0].some((value,index)=>value!==start[index])?'路线起点必须与总部精确定位一致':'';
  const routeGap=public_route_gap(view.geometry,path),gap=startGap||routeGap||view.gap;
  const estimate:RouteEstimate=startGap||routeGap?{estimate_kind:'unknown',estimated_move_ms:null,estimate_range:null}:{estimate_kind:'known',estimated_move_ms,estimate_range:{min_ms:estimated_move_ms,max_ms:estimated_move_ms,basis:'registered_rule_time'}};
  return {...identity,...estimate,kind:'corridor_move',run_id:view.run_id,revision:view.revision,editing_seq,version:1,actor:'R',path,path_digest:await hash({identity,path}),distance,unit:'fictional_metre',capability_ref:basis.capability_ref,rules_hash:view.public_rules.rules_hash,evidence_refs,allowed:view.can_issue&&!gap,gap,link_ms:1000,assumptions:['按已知地形估计，途中条件待回报','规则行进时间不含单向消息等待，不是抵达承诺']};
}
