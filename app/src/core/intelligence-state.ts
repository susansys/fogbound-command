import type {Mode,Envelope} from '../contracts';
import type {State} from './state';
import type {IntelligenceDefinition} from './intelligence-definition';
import type {IntelligenceReport,IntelligenceDelivery} from '../intelligence-contracts';
export type IntelligenceState={
  schema:9;scenario_kind:'play_intelligence';contract:'0.5.1';integrity?:string;definition_hash:string;hashes:Record<string,string>;
  run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;ended:boolean;source_run:string|null;
  generation:number;origin_generation:number;phase:'committed';rng:State['rng'];
  inputs:Array<{envelope:Envelope;at:number;revision:number;clock_to?:number}>;log:State['log'];
  reports:IntelligenceReport[];deliveries:IntelligenceDelivery[];
  source:{work:{status:'pending'|'running'|'completed'|'cutoff'|'blocked';done_ms:number;generation:number};resources:{energy:number;durability:number;packs:number;energy_reserved:number;packs_reserved:number};wear_charged:boolean;settled:boolean;published_report_ref:string|null};
};
export function initial_intelligence_state(definition:IntelligenceDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null=null,rng_origin=run_id):IntelligenceState{
  const p=definition.profile.parameters;
  return {schema:9,scenario_kind:'play_intelligence',contract:'0.5.1',definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,ended:false,source_run,generation,origin_generation:generation,phase:'committed',rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:rng_origin,used:false},inputs:[],log:[],reports:[],deliveries:[],source:{work:{status:'pending',done_ms:0,generation},resources:{energy:p.source_energy,durability:p.source_durability,packs:p.source_packs,energy_reserved:0,packs_reserved:0},wear_charged:false,settled:false,published_report_ref:null}};
}
