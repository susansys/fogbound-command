import {initial_field_actors} from './intelligence-execution';
import type {Mode,Envelope} from '../contracts';
import type {State} from './state';
import type {IntelligenceDefinition} from './intelligence-definition';
import type {IntelligenceReport,IntelligenceDelivery,IntelligencePlan,SaveIntelligencePlan,IntelligenceWorkItem,IntelligenceAssessment,IntelligenceProductDelivery,IntelligenceRef,IntelligencePreparationRequest,IntelligencePreparationResult,IntelligenceSupplyCommitment} from '../intelligence-contracts';
import type {IntelligenceSourceRequest} from '../intelligence-protocol';
import type {IntelligenceActivityRequest,IntelligenceRecordMaterial,IntelligenceArtifact,IntelligenceFieldActor,IntelligenceFieldOrder,IntelligenceFieldReport,IntelligenceFieldDelivery} from '../intelligence-contracts';
export type IntelligenceState={
  schema:9;scenario_kind:'play_intelligence';contract:'0.5.1';integrity?:string;definition_hash:string;hashes:Record<string,string>;
  run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;ended:boolean;source_run:string|null;
  generation:number;origin_generation:number;phase:'committed';rng:State['rng'];
  inputs:Array<{envelope:Envelope|SaveIntelligencePlan|IntelligenceSourceRequest|IntelligencePreparationRequest|IntelligenceActivityRequest;at:number;revision:number;clock_to?:number}>;log:State['log'];
  field:{actors:IntelligenceFieldActor[];orders:IntelligenceFieldOrder[];reports:IntelligenceFieldReport[];deliveries:IntelligenceFieldDelivery[];artifacts:IntelligenceArtifact[];materials:IntelligenceRecordMaterial[];messages:Array<{actor:string;report_ref:import('../intelligence-contracts').IntelligenceRef<'field_report'>;status:'sent'|'unsent';sent:number|null;reason:null|'no_authorized_channel'}>};
  plan:IntelligencePlan|null;
  processing:{energy:number;energy_reserved:number;items:IntelligenceWorkItem[];assessments:IntelligenceAssessment[];preparations:IntelligencePreparationResult[];supply_commitments:IntelligenceSupplyCommitment[];deliveries:IntelligenceProductDelivery[];reservations:Array<{ref:IntelligenceRef<'reservation'>;owner:'INTEL';action_ref:IntelligenceRef<'work_item'>;resource_ref:IntelligenceRef<'processing_energy'>;quantity:number;from:number;to:number;status:'held'|'consumed'|'released';consumed:number}>};
  reports:IntelligenceReport[];deliveries:IntelligenceDelivery[];
  source:{work:{status:'pending'|'running'|'completed'|'cutoff'|'blocked';done_ms:number;generation:number};resources:{energy:number;durability:number;packs:number;energy_reserved:number;packs_reserved:number};wear_charged:boolean;settled:boolean;published_report_ref:string|null};
};
export function initial_intelligence_state(definition:IntelligenceDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null=null,rng_origin=run_id):IntelligenceState{
  const p=definition.profile.parameters;
  return {schema:9,scenario_kind:'play_intelligence',contract:'0.5.1',definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,ended:false,source_run,generation,origin_generation:generation,phase:'committed',rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:rng_origin,used:false},inputs:[],log:[],field:{actors:initial_field_actors(definition),orders:[],reports:[],deliveries:[],artifacts:[],materials:[],messages:[]},plan:null,processing:{energy:p.processing_energy,energy_reserved:0,items:[],assessments:[],preparations:[],supply_commitments:[],deliveries:[],reservations:[]},reports:[],deliveries:[],source:{work:{status:'pending',done_ms:0,generation},resources:{energy:p.source_energy,durability:p.source_durability,packs:p.source_packs,energy_reserved:0,packs_reserved:0},wear_charged:false,settled:false,published_report_ref:null}};
}
