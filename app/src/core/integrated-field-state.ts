import {initial_integrated_planning,type IntegratedPlanningState} from './integrated-field-plans';
import {initial_integrated_dag,type IntegratedDagState} from './integrated-field-dag';
import {GameError,type Mode} from '../contracts';
import type {IntegratedFieldEnvelope as Envelope} from '../integrated-field-contracts';
import type {IntegratedFieldDefinition} from './integrated-field-definition';
import {initial_integrated_work,type IntegratedWorkState} from './integrated-field-work';
import {initial_integrated_environment,type IntegratedEnvironmentState,type IntegratedEnvironmentProfile} from './integrated-field-environment';
export type IntegratedFieldState={
  schema:13;contract:'0.5.1';scenario_kind:'play_integrated_field';
  run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;
  paused:boolean;finished:boolean;ended:boolean;status:'ready'|'deadline';source_run:string|null;
  definition_hash:string;hashes:Record<string,string>;definition:IntegratedFieldDefinition;
  rng:{algorithm:'xorshift32-v1';version:1;seed:1;state:1;origin:string;used:false};
  generation:number;origin_generation:number;phase:'committed';integrity?:string;
  guidance_loss_at:number|null;hq_sender_free_at:number;
  actors:Record<'R'|'W',IntegratedFieldActor>;
  pending_moves:Array<{actor:'R'|'W';target:'H'|'A'|'B';start_at:number;operation_id:string}>;
  position_reports:Array<{actor:'R'|'W';point_um:[number,number];observed_at:number;received_at:number;evidence:string}>;
  work:IntegratedWorkState;
  planning:IntegratedPlanningState;
  dag:IntegratedDagState;
  sensitivity:import('../integrated-field-contracts').IntegratedSensitivity;
  wet_all_time:boolean;
  environment:IntegratedEnvironmentState;
  inputs:Array<{envelope:Envelope;at:number;revision:number;clock_to?:number}>;
};
export type IntegratedFieldMotion={status:'queued'|'moving'|'completed'|'blocked';target:'H'|'A'|'B';start_at:number;ended_at:number|null;legs:Array<[number,number]>;leg_index:number;leg_origin_um:[number,number];leg_progress_um:number;operation_id:string};
export type IntegratedFieldActor={position_um:[number,number];motion:IntegratedFieldMotion|null;sender_free_at:number;known:{point:[number,number];observed_at:number;received_at:number;evidence:string}|null};
export type IntegratedInitialInputs={guidance_loss_at?:number|null;initial_spares?:0|1;environment_profile?:IntegratedEnvironmentProfile;report_fixture?:import('./integrated-field-work').IntegratedReportFixture;sensitivity?:import('../integrated-field-contracts').IntegratedSensitivity;wet_all_time?:boolean};
export function initial_integrated_field_state(definition:IntegratedFieldDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null,rng_origin:string,inputs:IntegratedInitialInputs={}):IntegratedFieldState{
  const {guidance_loss_at=null,initial_spares=1,environment_profile='nominal',report_fixture={},sensitivity='nominal'}=inputs;
  if(!Object.hasOwn(definition.sensitivity_policy,sensitivity))throw new GameError('INVALID_DEFINITION');
  const wet_all_time=inputs.wet_all_time??definition.sensitivity_policy[sensitivity].AB_wet_all_time;if(typeof wet_all_time!=='boolean')throw new GameError('INVALID_DEFINITION');
  if(guidance_loss_at!==null&&(!Number.isSafeInteger(guidance_loss_at)||guidance_loss_at<0||guidance_loss_at>900000))throw new GameError('INVALID_DEFINITION');
  const actor=(id:'R'|'W',point:[number,number]):IntegratedFieldActor=>({position_um:[point[0]*1000000,point[1]*1000000],motion:null,sender_free_at:0,known:{point:structuredClone(point),observed_at:0,received_at:0,evidence:'opening-'+id}});
  return {schema:13,contract:'0.5.1',scenario_kind:'play_integrated_field',run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,ended:false,status:'ready',source_run,
    definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),definition:structuredClone(definition),guidance_loss_at,hq_sender_free_at:0,actors:{R:actor('R',definition.geometry.points.H),W:actor('W',definition.geometry.points.B)},position_reports:[],pending_moves:[],work:initial_integrated_work(definition,initial_spares,report_fixture),
    planning:initial_integrated_planning(),dag:initial_integrated_dag(),sensitivity,wet_all_time,environment:initial_integrated_environment(definition,environment_profile),rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:rng_origin,used:false},generation,origin_generation:generation,phase:'committed',inputs:[]};
}
