import type {Mode,Envelope} from '../contracts';
import type {IntegratedFieldDefinition} from './integrated-field-definition';
export type IntegratedFieldState={
  schema:13;contract:'0.5.1';scenario_kind:'play_integrated_field';
  run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;
  paused:boolean;finished:boolean;ended:boolean;status:'ready'|'deadline';source_run:string|null;
  definition_hash:string;hashes:Record<string,string>;definition:IntegratedFieldDefinition;
  rng:{algorithm:'xorshift32-v1';version:1;seed:1;state:1;origin:string;used:false};
  generation:number;origin_generation:number;phase:'committed';integrity?:string;
  inputs:Array<{envelope:Envelope;at:number;revision:number;clock_to?:number}>;
};
export function initial_integrated_field_state(definition:IntegratedFieldDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null,rng_origin:string):IntegratedFieldState{
  return {schema:13,contract:'0.5.1',scenario_kind:'play_integrated_field',run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,ended:false,status:'ready',source_run,
    definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),definition:structuredClone(definition),
    rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:rng_origin,used:false},generation,origin_generation:generation,phase:'committed',inputs:[]};
}
