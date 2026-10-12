import type { Mode, PlayerView, LogEntry } from '../contracts';
export type State = {
  run_id:string; revision:number; sim_time:number; mode:Mode; rate:1|2|4; paused:boolean;
  finished:boolean; source_run:string|null; schema:4; contract:'0.5.1';
  definition_hash:string; hashes:Record<string,string>;
  rng:{algorithm:'xorshift32-v1';version:1;seed:1;state:1;origin:string;used:false};
  generation:number; phase:'committed';
  known:Pick<PlayerView,'position'|'report'|'delivery'|'resources'>;
  public_rules:Pick<PlayerView,'geometry'|'authority'>;
  log:LogEntry[];
};
