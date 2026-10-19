import type {Mode} from '../contracts';
import type {ConflictingActionEnvelope} from '../conflicting-action-contracts';
import type {SourceDelivery} from '../source-time-contracts';
import type {FacilityCondition,WorkingAssessment} from '../conflicting-action-contracts';
import type {OutcomeState} from './outcome-state';
import {initial_outcome_state} from './outcome-state';
import {outcome_definition_for_package} from './outcome-definition';
import {source_time_definition} from './source-time-definition';
import {compose_source_time_state} from './source-time-state';
import type {ConflictingActionDefinition} from './conflicting-action-definition';
export type ConflictingFacilityState={initial:FacilityCondition;current:FacilityCondition;version:number;applied_repairs:string[]};

export type ConflictingActionState=Pick<OutcomeState,'run_id'|'revision'|'sim_time'|'mode'|'rate'|'paused'|'ended'|'finished'|'source_run'|'generation'|'origin_generation'|'phase'|'rng'|'log'|'integrity'>&{
 schema:12;scenario_kind:'play_conflicting_action';contract:'0.5.1';definition_hash:string;hashes:Record<string,string>;task:OutcomeState;source_events:SourceDelivery[];
 facility:ConflictingFacilityState;assessments:WorkingAssessment[];
 inputs:Array<{envelope:ConflictingActionEnvelope;at:number;revision:number;clock_to?:number}>;
};
export async function compose_conflicting_state(task:OutcomeState,definition:ConflictingActionDefinition,facility:ConflictingActionState['facility'],assessments:WorkingAssessment[],inputs:ConflictingActionState['inputs'],revision=task.revision):Promise<ConflictingActionState>{
 const frame=await compose_source_time_state(task,source_time_definition);
 const {run_id,sim_time,mode,rate,paused,ended,finished,source_run,generation,origin_generation,phase,rng,log}=frame;
 return {schema:12,scenario_kind:'play_conflicting_action',contract:'0.5.1',definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),run_id,revision,sim_time,mode,rate,paused,ended,finished,source_run,generation,origin_generation,phase,rng,log,task:frame.task,source_events:frame.source_events,facility:structuredClone(facility),assessments:structuredClone(assessments),inputs:structuredClone(inputs)};
}
export async function initial_conflicting_state(definition:ConflictingActionDefinition,run:string,mode:Mode,generation:number,source_run:string|null=null,rng_origin=run,initial:FacilityCondition='faulted'){
 const task=initial_outcome_state(outcome_definition_for_package(definition.task_definition_hash),run,mode,generation,source_run,rng_origin);
 return compose_conflicting_state(task,definition,{initial,current:initial,version:1,applied_repairs:[]},[],[]);
}
