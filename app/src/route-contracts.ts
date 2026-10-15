import type {GeometryIdentity,Coordinate} from './spatial';
import type {Plan} from './contracts';
export type RouteDraft=GeometryIdentity&{actor:'R';path:Coordinate[]};
export type MovementBasis={capability_ref:string;speed:number;unit:'fictional_metre/s';load:number;terrain_factor:number;environment_factor:number;load_factor_per_unit:number;length_scale:1000000;evidence_refs:string[]};
export type RouteEstimate=
  |{estimate_kind:'known';estimated_move_ms:number;estimate_range:{min_ms:number;max_ms:number;basis:'registered_rule_time'}}
  |{estimate_kind:'unknown';estimated_move_ms:null;estimate_range:null};
export type RoutePlan=GeometryIdentity&RouteEstimate&{
  kind:'corridor_move';run_id:string;revision:number;editing_seq:number;version:1;actor:'R';
  path:Coordinate[];path_digest:string;distance:number;unit:'fictional_metre';
  capability_ref:string;rules_hash:string;evidence_refs:string[];allowed:boolean;gap:string;
  link_ms:1000;assumptions:string[];
};
export type PreviewPlan=Plan|RoutePlan;
export function is_legacy_plan(plan:PreviewPlan):plan is Plan{return !('kind' in plan&&plan.kind==='corridor_move');}
