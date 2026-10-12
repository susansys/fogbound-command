import Dexie, { type Table } from 'dexie';
import type { State } from './state';
import { GameError } from '../contracts';
class Database extends Dexie {
  runs!:Table<State,string>;
  snapshots!:Table<{key:string;run_id:string;state:State},string>;
  operations!:Table<{key:string;run_id:string;operation_id:string;fingerprint:string;revision:number;sim_time:number},string>;
  metadata!:Table<{key:string;value:number},string>;
  constructor(name:string) { super(name); this.version(4).stores({runs:'run_id',snapshots:'key,run_id',operations:'key,run_id',metadata:'key'}); }
}
export class Persistence {
  private db:Database;
  constructor(readonly name:string) { this.db=new Database(name); }
  async claim_writer():Promise<number> {
    return this.db.transaction('rw',this.db.metadata,async()=>{
      const next=((await this.db.metadata.get('writer'))?.value??0)+1;
      await this.db.metadata.put({key:'writer',value:next}); return next;
    });
  }
  async commit_batch(state:State,epoch:number,expected:number|null,operation_id:string,fingerprint:string):Promise<void> {
    await this.db.transaction('rw',[this.db.runs,this.db.snapshots,this.db.operations,this.db.metadata],async()=>{
      if((await this.db.metadata.get('writer'))?.value!==epoch) throw new GameError('STALE_WRITER');
      const old=await this.db.runs.get(state.run_id);
      if((old?.revision??null)!==expected) throw new GameError('STALE_REVISION');
      if(expected===null && await this.db.operations.get(`create:${operation_id}`))throw new GameError('OPERATION_CONFLICT');
      await this.db.runs.put(structuredClone(state));
      await this.db.snapshots.put({key:`${state.run_id}:${state.revision}`,run_id:state.run_id,state:structuredClone(state)});
      await this.db.operations.put({key:`${state.run_id}:${operation_id}`,run_id:state.run_id,operation_id,fingerprint,revision:state.revision,sim_time:state.sim_time});
      if(expected===null)await this.db.operations.put({key:`create:${operation_id}`,run_id:state.run_id,operation_id,fingerprint,revision:state.revision,sim_time:state.sim_time});
    });
  }
  async read_committed(run:string):Promise<State|undefined> { return this.db.runs.get(run); }
  async receipt(run:string,operation:string) { return this.db.operations.get(`${run}:${operation}`); }
  async creation(operation:string) { return this.db.operations.get(`create:${operation}`); }
  async snapshot(run:string,revision:number) { return (await this.db.snapshots.get(`${run}:${revision}`))?.state; }
  async list_runs() { return (await this.db.runs.toArray()).map(x=>({run_id:x.run_id,sim_time:x.sim_time,revision:x.revision,mode:x.mode,finished:x.finished})); }
  async delete():Promise<void> { await this.db.delete(); }
}
