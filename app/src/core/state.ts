import type { Mode, PlayerView, LogEntry, Envelope, Plan, RecordArtifact } from "../contracts";
import type {ExactQuantity} from './record-accounting';
import type {PrestartData} from './prestart-move';
export type MoveEvent = {
  id: string;
  at: number;
  phase: number;
  generation: number;
  kind:
    | "command_send"
    | "accept"
    | "accepted_receipt"
    | "fix"
    | "fix_receipt"
    | "complete"
    | "complete_receipt"
    | "deadline"
    | "deadline_receipt";
  index?: number;
  payload?: {
    position?: PlayerView["position"];
    resources: PlayerView["resources"];
    observed: number;
    artifacts?: RecordArtifact[];
  };
};
export type State = {
  prestart?:PrestartData;
  integrity?:string;
  run_id: string;
  revision: number;
  sim_time: number;
  mode: Mode;
  rate: 1 | 2 | 4;
  paused: boolean;
  finished: boolean;
  ended: boolean;
  status: PlayerView["status"];
  order: {
    command_id: string;
    issued: number;
    expiry: number;
    accepted: number | null;
    plan: Plan;
    reason?: string;
  } | null;
  world: {
    position: { xn: number; yn: number; d: number };
    equipment_energy: number;
    equipment_wear: number;
    movement_energy: number;
    movement_energy_reserved?:number;
    record_energy?: ExactQuantity;
    record_energy_used?: ExactQuantity;
    record_energy_reserved?: ExactQuantity;
    record_packs_used?: number;
    record_packs_accrued?:ExactQuantity;
    record_packs_reserved?: number;
    record_causes?: string[];
    record_wear?: number;
    record_packs?: number;
    hq_energy?: number;
    hq_wear?: number;
    record_work?: ExactQuantity;
    record_artifacts?: RecordArtifact[];
    sends: number;
    completed: boolean;
    stopped: boolean;
  };
  schedule: MoveEvent[];
  movement_rules: {fix_ms:number;task_expiry_ms:number};
  inputs: Array<{ envelope: Envelope; at: number; revision: number;clock_to?:number }>;
  source_run: string | null;
  schema: 4 | 5 | 6;
  scenario_kind?: 'record'|'prestart_move';
  contract: "0.5.1";
  definition_hash: string;
  hashes: Record<string, string>;
  rng: {
    algorithm: "xorshift32-v1";
    version: 1;
    seed: 1;
    state: 1;
    origin: string;
    used: false;
  };
  generation: number;
  phase: "committed";
  known: Pick<PlayerView, "position" | "report" | "delivery" | "resources" | "artifacts" | "replacement"> & {prestart?:{report_sequence:number;terminal?:{kind:'finished'|'deadline';received_at:number};cleanup_deadline?:number}};
  public_rules: Pick<PlayerView, "geometry" | "authority"> & {
    preview: Pick<
      import("../contracts").MovePlan,
      "distance" | "estimated_move_ms" | "link_ms"
    >;
  };
  log: LogEntry[];
};
export type StoredState=import('./source-time-state').SourceTimeState|State|import('./play-state').PlayState|import('./mission-state').MissionState|import('./intelligence-state').IntelligenceState|import('./outcome-state').OutcomeState;
