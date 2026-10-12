import type { Mode, PlayerView, OriginalReport } from '../contracts';
import { GameError } from '../contracts';
import { Persistence } from './persistence';
import { load_definition } from './scenario';
import type { State } from './state';
import { project_player_view } from './knowledge';
import { valid_id } from '../protocol';
export class Game {
  private epoch:number|null=null;
  constructor(readonly store:Persistence) {}
  private async writer() { if(this.epoch===null) this.epoch=await this.store.claim_writer(); return this.epoch; }
  async create_run(input:unknown,mode:Mode,operation:string):Promise<PlayerView> {
    const definition=await load_definition(input);
    if(!['command','research'].includes(mode) || !valid_id(operation)) throw new GameError('INVALID_INPUT');
    const previous=await this.store.creation(operation);
    if(previous) {
      if(previous.fingerprint!==`create:${mode}`)throw new GameError('OPERATION_CONFLICT');
      const snapshot=await this.store.snapshot(previous.run_id,previous.revision);
      if(!snapshot)throw new GameError('STORAGE_UNCONFIRMED');
      return project_player_view(snapshot);
    }
    const epoch=await this.writer(),run_id=crypto.randomUUID();
    const state:State={
      run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,source_run:null,
      schema:4,contract:'0.5.1',definition_hash:definition.definition_hash,hashes:definition.hashes,
      rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:run_id,used:false},generation:epoch,phase:'committed',
      public_rules:{geometry:{H:definition.catalogs.geometry.H as [number,number],T:definition.catalogs.geometry.T as [number,number],extent:definition.profile.parameters.extent as [number,number],corridor_width:definition.profile.parameters.corridor_width},authority:{from:definition.catalogs.authority.from,to:definition.catalogs.authority.to}},
      known:{position:definition.catalogs.position,report:definition.catalogs.report as OriginalReport,delivery:definition.catalogs.delivery,resources:{equipment_energy:definition.profile.parameters.equipment_energy,equipment_wear:definition.profile.parameters.equipment_wear,movement_energy:definition.profile.parameters.movement_energy,confirmed_at:0}},
      log:[{id:'initial-report',at:0,kind:'report',text:'原始工位报告已递交；R最后确认在H。',evidence:'DELIVERY-T'}],
    };
    await this.store.commit_batch(state,epoch,null,operation,`create:${mode}`);
    return project_player_view(state);
  }
  async get_view(run:string):Promise<PlayerView> {
    const state=await this.store.read_committed(run);if(!state)throw new GameError('RUN_NOT_FOUND');
    return project_player_view(state);
  }
}
