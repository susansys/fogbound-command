export type Mode = "command" | "research";
export type DefinitionRef='FB01-ENG-MOVE'|'FB02-ENG-RECORD';
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
export type LogEntry = {
  id: string;
  at: number;
  kind: string;
  text: string;
  observed?: number;
  evidence: string;
};
export type PlayerView = {
  scenario_kind?:'record';
  run_id: string;
  revision: number;
  sim_time: number;
  mode: Mode;
  rate: 1 | 2 | 4;
  paused: boolean;
  finished: boolean;
  source_run: string | null;
  status: "ready" | "queued" | "executing" | "finished" | "deadline";
  position: Position;
  report: OriginalReport;
  delivery: ReportDelivery;
  geometry: {
    H: [number, number];
    T: [number, number];
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
    confirmed_at: number;
  };
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
export type Plan=MovePlan|RecordPlan;
export type Intent =
  | { kind: "issue"; command_id: string; plan: Plan; reason?: string }
  | { kind: "advance"; to: number }
  | { kind: "tick"; to: number }
  | { kind: "pause"; reason: "manual" | "focus_lost" | "application_hidden" }
  | { kind: "continue" }
  | { kind: "rate"; rate: 1 | 2 | 4 }
  | { kind: "mode"; mode: Mode }
  | { kind: "save" }
  | {kind:'restore';snapshot_revision:number};
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
  kind: Intent["kind"];
  snapshot_revision?:number;
};
export class GameError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
