import type {KnownTime,Mode,LogEntry,PlayerView,Plan} from './contracts';
import type {PublicMap,SpatialScope} from './spatial';
import type {MovementBasis} from './route-contracts';

type LocationEvidence={observed:KnownTime;reported:KnownTime;source_event_time:KnownTime;evidence_refs:string[]}&(
  |{received:null;provenance:{kind:'registered_initial';initial_evidence_ref:string}}
  |{received:number;provenance:{kind:'delivered';report_ref:string;delivery_ref:string}}
);
export type PositionKnowledge=
  |({status:'known_scope';scope:Exclude<SpatialScope,{kind:'unresolved'}>}&LocationEvidence)
  |({status:'unresolved'}&LocationEvidence)
  |{status:'conflicting';observed:Extract<KnownTime,{kind:'known'}>;candidates:Array<{scope:Exclude<SpatialScope,{kind:'unresolved'}>}&LocationEvidence>};
export type PlayStatus='ready'|'queued'|'accepted'|'arrived'|'blocked'|'cutoff_confirmed'|'window_ended_unconfirmed'|'window_sealed_unconfirmed';
export type PlayPlayerView={
  scenario_kind:'play_corridor';run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;source_run:string|null;
  status:PlayStatus;geometry:PublicMap;position_knowledge:PositionKnowledge;
  authority:{from:number;to:number};public_rules:{deadline:number;receipt_grace:number;link_ms:number;rules_hash:string};
  resources:PlayerView['resources'];can_issue:boolean;next_action:string;gap:string;
  movement_basis:MovementBasis;
  issued_orders:Array<{command_id:string;issued:number;plan:Plan;reason?:string}>;
  replay_nodes:PlayerView['replay_nodes'];log:LogEntry[];
};
export type GamePlayerView=PlayerView|PlayPlayerView;
export function is_play_view(view:GamePlayerView):view is PlayPlayerView{return view.scenario_kind==='play_corridor';}
