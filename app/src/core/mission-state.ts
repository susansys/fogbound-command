import type {Mode} from '../contracts';
import type {MissionResources,SavedMissionPlan,KnownMission,SavePlanEnvelope} from '../mission-contracts';
import type {PositionKnowledge} from '../play-contracts';
import type {State} from './state';
import type {MissionDefinition} from './mission-definition';
export type MissionState={
  schema:8;scenario_kind:'play_mission';contract:'0.5.1';integrity?:string;definition_hash:string;hashes:Record<string,string>;
  run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;ended:boolean;status:'draft';
  source_run:string|null;rng:State['rng'];generation:number;origin_generation:number;phase:'committed';inputs:Array<{envelope:SavePlanEnvelope|import('../contracts').Envelope;at:number;revision:number;clock_to?:number}>;
  world:{position:{xn:number;yn:number;d:number};resources:MissionResources};known:{position_knowledge:PositionKnowledge;resources:MissionResources};
  mission:KnownMission|null;plans:SavedMissionPlan[];log:State['log'];
};
export function initial_mission_state(definition:MissionDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null=null,rng_origin=run_id):MissionState{
  const p=definition.profile.parameters,initial=definition.catalogs.initial_evidence;
  const origin=definition.catalogs.map.scopes.find(x=>x.id===initial.scope_ref);
  if(origin?.kind!=='point')throw Error('Registered mission origin must be a point');
  const resources={movement_energy:p.movement_energy,movement_energy_reserved:0,equipment_energy:p.equipment_energy,equipment_wear:p.equipment_wear,hq_energy:p.hq_energy,hq_wear:p.hq_wear,confirmed_at:0};
  return {schema:8,scenario_kind:'play_mission',contract:'0.5.1',definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,ended:false,status:'draft',source_run,rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:rng_origin,used:false},generation,origin_generation:generation,phase:'committed',inputs:[],mission:null,plans:[],world:{position:{xn:origin.typed_geometry.position[0],yn:origin.typed_geometry.position[1],d:1},resources:structuredClone(resources)},known:{position_knowledge:{status:'known_scope',scope:structuredClone(origin),observed:structuredClone(initial.observed) as PositionKnowledge['observed'],reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'registered_initial',initial_evidence_ref:initial.id},evidence_refs:[initial.id]},resources},log:[{id:'b22-initial',at:0,kind:'initial_evidence',text:'初始位置依据已登记；任务尚未保存或下达。',evidence:initial.id}]};
}
