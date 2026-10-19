import type {KnownTime,Mode,LogEntry,PlayerView} from './contracts';
import type {PublicMap,SpatialScope} from './spatial';
import type {MovementBasis,RoutePlan} from './route-contracts';
export type PlayResources={equipment_energy:number;equipment_wear:number;movement_energy:number;movement_energy_reserved:number;record_energy:number;record_wear:number;record_packs:number;hq_energy:number;hq_wear:number;confirmed_at:number};
export type PlayReport={id:string;origin:'R';target:'HQ';kind:'accepted'|'arrived'|'blocked'|'cutoff'|'refused'|'position';command_id:string|null;activity_id:string|null;source_event_time:KnownTime;observed:KnownTime;reported:KnownTime;position_scope:Exclude<SpatialScope,{kind:'unresolved'}>|null;resources:Omit<PlayResources,'hq_energy'|'hq_wear'>;refusal_reason:'start_mismatch'|'window_closed'|'insufficient_movement_energy'|null};
export type PositionCatalogEntry={id:string;scope_ref:string|null;observed:KnownTime;reported_at:number;delivery_at:number;source_event_time:KnownTime};
export type PlayDelivery={id:string;report_id:string;received:{value:number;evidence:string}};

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
  authority:{from:number;to:number};public_rules:{deadline:number;receipt_grace:number;link_ms:number;rules_hash:string;report_policy:{budget:number;energy_per_send:number;wear_per_send:number}};
  resources:PlayResources;can_issue:boolean;next_action:string;gap:string;
  received_reports:Array<{report:PlayReport;delivery:PlayDelivery}>;
  movement_basis:MovementBasis;
  issued_orders:Array<{command_id:string;issued:number;plan:RoutePlan;reason?:string}>;
  replay_nodes:PlayerView['replay_nodes'];log:LogEntry[];
};
export type GamePlayerView=import('./conflicting-action-contracts').ConflictingActionPlayerView|import('./source-time-contracts').SourceTimePlayerView|PlayerView|PlayPlayerView|import('./mission-contracts').MissionPlayerView|import('./intelligence-contracts').IntelligencePlayerView|import('./outcome-contracts').OutcomePlayerView;
export function is_play_view(view:GamePlayerView):view is PlayPlayerView{return view.scenario_kind==='play_corridor';}
