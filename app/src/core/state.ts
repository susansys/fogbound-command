import type { Mode, PlayerView, LogEntry, Envelope, Plan } from "../contracts";
export type MoveEvent = {
  id: string;
  at: number;
  phase: number;
  generation: number;
  kind:
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
  };
};
export type State = {
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
    sends: number;
    completed: boolean;
    stopped: boolean;
  };
  schedule: MoveEvent[];
  movement_rules: {fix_ms:number;task_expiry_ms:number};
  inputs: Array<{ envelope: Envelope; at: number; revision: number;clock_to?:number }>;
  source_run: string | null;
  schema: 4;
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
  known: Pick<PlayerView, "position" | "report" | "delivery" | "resources">;
  public_rules: Pick<PlayerView, "geometry" | "authority"> & {
    preview: Pick<
      import("../contracts").Plan,
      "distance" | "estimated_move_ms" | "link_ms"
    >;
  };
  log: LogEntry[];
};
