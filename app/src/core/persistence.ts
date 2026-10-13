import Dexie, { type Table } from "dexie";
import type { State } from "./state";
import { GameError } from "../contracts";
import {state_hash,validate_state} from './snapshot';
class Database extends Dexie {
  runs!: Table<State, string>;
  snapshots!: Table<{ key: string; run_id: string; state: State }, string>;
  operations!: Table<
    {
      key: string;
      run_id: string;
      operation_id: string;
      fingerprint: string;
      revision: number;
      sim_time: number;
    },
    string
  >;
  metadata!: Table<{ key: string; value: number }, string>;
  constructor(name: string) {
    super(name);
    this.version(4).stores({
      runs: "run_id",
      snapshots: "key,run_id",
      operations: "key,run_id",
      metadata: "key",
    });
  }
}
export class Persistence {
  private db: Database;
  constructor(readonly name: string) {
    this.db = new Database(name);
  }
  async claim_writer(): Promise<number> {
    return this.db.transaction("rw", this.db.metadata, async () => {
      const next = ((await this.db.metadata.get("writer"))?.value ?? 0) + 1;
      await this.db.metadata.put({ key: "writer", value: next });
      return next;
    });
  }
  async commit_batch(
    state: State,
    epoch: number,
    expected: number | null,
    operation_id: string,
    fingerprint: string,
  ): Promise<void> {
    state.integrity=await state_hash(state);
    await this.db.transaction(
      "rw",
      [this.db.runs, this.db.snapshots, this.db.operations, this.db.metadata],
      async () => {
        if ((await this.db.metadata.get("writer"))?.value !== epoch)
          throw new GameError("STALE_WRITER");
        const old = await this.db.runs.get(state.run_id);
        if(await this.db.metadata.get(`readonly:${state.run_id}`))throw new GameError('HISTORY_READ_ONLY');
        if ((old?.revision ?? null) !== expected)
          throw new GameError("STALE_REVISION");
        if (
          expected === null &&
          (await this.db.operations.get(`create:${operation_id}`))
        )
          throw new GameError("OPERATION_CONFLICT");
        await this.db.runs.put(structuredClone(state));
        await this.db.snapshots.put({
          key: `${state.run_id}:${state.revision}`,
          run_id: state.run_id,
          state: structuredClone(state),
        });
        await this.db.operations.put({
          key: `${state.run_id}:${operation_id}`,
          run_id: state.run_id,
          operation_id,
          fingerprint,
          revision: state.revision,
          sim_time: state.sim_time,
        });
        if (expected === null) {
          await this.db.operations.put({
            key: `create:${operation_id}`,
            run_id: state.run_id,
            operation_id,
            fingerprint,
            revision: state.revision,
            sim_time: state.sim_time,
          });
          const created=((await this.db.metadata.get('creation-counter'))?.value??0)+1;
          await this.db.metadata.put({key:'creation-counter',value:created});
          await this.db.metadata.put({key:`created:${state.run_id}`,value:created});
        }
        if(expected===null&&state.source_run!==null){
          const source=await this.db.runs.get(state.source_run);
          if(!source||await this.db.metadata.get(`readonly:${state.source_run}`))throw new GameError('HISTORY_READ_ONLY');
          await this.db.metadata.put({key:`readonly:${state.source_run}`,value:1});
        }
      },
    );
  }
  async read_committed(run: string): Promise<State | undefined> {
    return this.db.runs.get(run);
  }
  async is_read_only(run:string){return !!await this.db.metadata.get(`readonly:${run}`);}
  async receipt(run: string, operation: string) {
    return this.db.operations.get(`${run}:${operation}`);
  }
  async creation(operation: string) {
    return this.db.operations.get(`create:${operation}`);
  }
  async snapshot(run: string, revision: number) {
    return (await this.db.snapshots.get(`${run}:${revision}`))?.state;
  }
  async list_runs() {
    const entries=await this.db.runs.toArray();
    for(const state of entries)await validate_state(state);
    const ranked=await Promise.all(entries.map(async state=>({state,created:(await this.db.metadata.get(`created:${state.run_id}`))?.value??0,read_only:await this.is_read_only(state.run_id)})));
    ranked.sort((a,b)=>b.created-a.created||Number(a.read_only)-Number(b.read_only)||b.state.revision-a.state.revision);
    const latest=new Map<string,(typeof ranked)[number]>();
    for(const entry of ranked)if(!latest.has(entry.state.definition_hash))latest.set(entry.state.definition_hash,entry);
    return [...latest.values()].map(({state:x,read_only}) => ({
      run_id: x.run_id,
      sim_time: x.sim_time,
      revision: x.revision,
      mode: x.mode,
      finished: x.finished,
      scenario_kind: x.schema===5?'record' as const:'move' as const,
      read_only,
    }));
  }
  async delete(): Promise<void> {
    await this.db.delete();
  }
}
