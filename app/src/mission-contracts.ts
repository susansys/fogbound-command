import type {Mode,LogEntry,PlayerView} from './contracts';
import type {PublicMap} from './spatial';
import type {PositionKnowledge} from './play-contracts';
import type {Coordinate} from './spatial';
export type MissionRef<K extends string>={run_id:string;kind:K;id:string;version:number};
export type ConditionExpr=
  |{kind:'compare';field_ref:'position.scope';operator:'eq'|'in';typed_value:string}
  |{kind:'compare';field_ref:'phase.confirmed'|'route.permitted'|'capability.ready';operator:'eq'|'ne';typed_value:boolean}
  |{kind:'all'|'any';children:ConditionExpr[]}
  |{kind:'not';child:ConditionExpr};
export type MissionDraft={
  run_id:string;plan_id:string;mission_ref:MissionRef<'mission'>;
  intent:{id:string;version:number;purpose:string;desired_end_state:string;key_tasks:string[];priorities:string[];constraint_refs:string[];acceptable_risk:string;delegation_ref:MissionRef<'authority'>};
  objective:{id:string;purpose:string;success_expr:ConditionExpr;failure_expr:ConditionExpr;deadline_time_ms:number;verification_requirements:string[];priority:number;dependencies:MissionRef<'objective'>[]};
  phases:Array<{id:string;kind:'move';dependencies:MissionRef<'phase'>[];entry_gate:ConditionExpr;exit_gate:ConditionExpr;earliest_start_time_ms:number;latest_finish_time_ms:number;activity:{kind:'move';actor:'R';route_ref:MissionRef<'route'>}}>;
  routes:Array<{id:string;path:Coordinate[]}>;actor_assignments:['R'];support_windows:[];assumptions:string[];evidence_refs:string[];decision_points:string[];note:string;
};
export type MissionPreview={kind:'mission_plan';run_id:string;revision:number;editing_seq:number;draft_digest:string;phases:Array<{phase_id:string;distance:number;estimated_move_ms:number|null;assumptions:string[];gap:string}>};
export type SavedMissionPlan={plan_id:string;version:number;draft:MissionDraft;preview:MissionPreview};
export type KnownMission={id:'M1';object_revision:number;status:'draft';current_plan_ref:MissionRef<'plan'>;support_refs:[]};
export type SavePlanEnvelope={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'save_plan';base_plan_ref:MissionRef<'plan'>|null;expected_object_revision:number;draft:MissionDraft}};
export type MissionResources={movement_energy:number;movement_energy_reserved:number;equipment_energy:number;equipment_wear:number;hq_energy:number;hq_wear:number;confirmed_at:number};
export type MissionPlayerView={
  scenario_kind:'play_mission';run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;source_run:string|null;
  status:'draft';geometry:PublicMap;position_knowledge:PositionKnowledge;authority:{from:number;to:number};resources:MissionResources;
  mission:KnownMission|null;plans:SavedMissionPlan[];issued_orders:never[];can_issue:false;next_action:string;gap:string;
  replay_nodes:PlayerView['replay_nodes'];log:LogEntry[];
};
