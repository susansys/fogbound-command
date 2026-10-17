import type {RoutePlan} from './route-contracts';
export type Mode = "command" | "research";
export type DefinitionRef='FB01-ENG-MOVE'|'FB02-ENG-RECORD'|'ENG-PRESTART-REPLACE'|'B21-CORRIDOR-01'|'B22-MISSION-01'|'B23-INTELLIGENCE-01'|'B24-OUTCOME-01';
export const prestart_case_refs=['normal','hq_short_outage','hq_expiry_outage','old_acceptance_delayed','hq_result_unconfirmed','reports_unconfirmed'] as const;
export type PrestartCaseRef=typeof prestart_case_refs[number];
export type Position = {
  x: number;
  y: number;
  observed: number;
  received: number;
  evidence: string;
};
export type KnownTime =
  | { kind: "unknown" }
  | { kind: "known"; value: number; evidence: string };
export type OriginalReport = {
  id: string;
  origin: string;
  target: string;
  source_event_time: KnownTime;
  observed: { value: number; evidence: string };
  reported: { value: number; evidence: string };
};
export type ReportDelivery = {
  id: string;
  report_id: string;
  received: { value: number; evidence: string };
};
export type TaskRefusalReason='window_closed'|'authority_closed'|'request_expired';
export type LogEntry = {
  id: string;
  at: number;
  kind: string;
  text: string;
  observed?: number;
  sender?: string;
  activity_id?: string;
  rejection?:TaskRefusalReason;
  request_kind?:'task'|'replacement';
  evidence: string;
};
export type RecordArtifact = {
  id: string;
  report_id: string;
  delivery_id: string;
  completed: number;
  verified: false;
  activity_id: string;
};
export type PlayerView = {
  scenario_kind?:'record'|'prestart_move';
  scenario_case?:PrestartCaseRef;
  run_id: string;
  revision: number;
  sim_time: number;
  mode: Mode;
  rate: 1 | 2 | 4;
  paused: boolean;
  finished: boolean;
  source_run: string | null;
  status: "ready" | "queued" | "preparing" | "executing" | "terminating" | "finished" | "deadline";
  position: Position;
  report: OriginalReport;
  delivery: ReportDelivery;
  geometry: {
    H: [number, number];
    T: [number, number];
    N?:[number,number];
    extent: [number, number];
    corridor_width: number;
    plain: [number, number, number, number];
    rough: [number, number, number, number];
  };
  authority: { from: number; to: number };
  can_issue: boolean;
  next_action: string;
  gap: string;
  resources: {
    equipment_energy: number;
    equipment_wear: number;
    movement_energy: number;
    movement_energy_reserved?:number;
    confirmed_at: number;
    record_energy?: number;
    record_wear?: number;
    record_packs?: number;
    record_energy_reserved?:number;
    record_packs_reserved?:number;
    hq_energy?: number;
    hq_wear?: number;
  };
  artifacts?: RecordArtifact[];
  replacement?:{original_command_id:string;replacement_command_id:string;accepted_at:number;received_at:number;evidence:string};
  issued_orders: Array<{command_id:string;issued:number;plan:Plan;reason?:string}>;
  replay_nodes:Array<{revision:number;at:number;meaningful:boolean;label:string}>;
  log: LogEntry[];
};
export type MovePlan = {
  run_id: string;
  revision: number;
  editing_seq: number;
  version: 1;
  actor: "R";
  target: "T";
  path: "H-T";
  distance: 120;
  estimated_move_ms: 31800;
  link_ms: 1000;
  allowed: boolean;
  gap: string;
};
export type RecordPlan = {
  kind:'record';run_id:string;revision:number;editing_seq:number;version:1;
  actor:'R';target:'A';station:'H';definition_hash:string;report_id:string;delivery_id:string;
  setup_ms:number;work:number;estimated_record_ms:number;estimated_total_ms:number;link_ms:1000;
  record_energy:number;record_wear:number;record_packs:number;allowed:boolean;gap:string;
};
export type PrestartPlan={kind:'prestart_move';run_id:string;revision:number;editing_seq:number;version:1;actor:'R';target:'N'|'T';path:'H-N'|'H-T';distance:60|120;estimated_move_ms:15900|31800;setup_ms:5000;link_ms:1000;definition_hash:string;allowed:boolean;gap:string;supersedes?:string};
export type Plan=MovePlan|RecordPlan|PrestartPlan;
export function is_record_plan(plan:Plan|RoutePlan):plan is RecordPlan{return 'kind' in plan&&plan.kind==='record';}
export type Intent =
  | { kind: "issue"; command_id: string; plan: Plan|RoutePlan; reason?: string }
  | {kind:'replace_task';command_id:string;original_command_id:string;original_version:1;plan:PrestartPlan;reason?:string}
  | { kind: "advance"; to: number }
  | { kind: "tick"; to: number }
  | { kind: "pause"; reason: "manual" | "focus_lost" | "application_hidden" }
  | { kind: "continue" }
  | { kind: "rate"; rate: 1 | 2 | 4 }
  | { kind: "mode"; mode: Mode }
  | { kind: "save" }
  | {kind:'restore';snapshot_revision:number};
export type TaskIntent=Extract<Intent,{kind:'issue'|'replace_task'}>;
export function is_task_intent(intent:Intent):intent is TaskIntent{return intent.kind==='issue'||intent.kind==='replace_task';}
export function task_intent(plan:Plan,command_id:string,reason?:string):TaskIntent{
  const common={command_id,plan,...(reason===undefined?{}:{reason})};
  return 'kind' in plan&&plan.kind==='prestart_move'&&plan.supersedes
    ?{...common,kind:'replace_task',plan,original_command_id:plan.supersedes,original_version:plan.version}
    :{...common,kind:'issue'};
}
export type Envelope = {
  run_id: string;
  operation_id: string;
  expected_revision: number;
  intent: Intent;
};
export type Receipt = {
  run_id: string;
  operation_id: string;
  revision: number;
  sim_time: number;
  fingerprint: string;
  result: "committed";
  kind: Intent["kind"]|'save_plan'|'issue_mission'|'append_explanation'|'request_source_validation'|'request_preparation'|'issue_activity'|'return_and_deliver';
  snapshot_revision?:number;
};
export class GameError extends Error {
  constructor(public code: string,public field_path?:string) {
    super(code);
  }
}
