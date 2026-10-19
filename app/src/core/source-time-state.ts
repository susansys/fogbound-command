import type {OutcomeState} from './outcome-state';
import {initial_outcome_state} from './outcome-state';
import type {Mode} from '../contracts';
import type {SourceDelivery} from '../source-time-contracts';
import type {SourceTimeDefinition} from './source-time-definition';
import {state_hash} from './snapshot';
export type SourceTimeState=Pick<OutcomeState,'run_id'|'revision'|'sim_time'|'mode'|'rate'|'paused'|'ended'|'finished'|'source_run'|'generation'|'origin_generation'|'phase'|'rng'|'log'|'inputs'|'integrity'>&{schema:11;scenario_kind:'play_source_time';contract:'0.5.1';definition_hash:string;hashes:Record<string,string>;task:OutcomeState;source_events:SourceDelivery[]};
export async function compose_source_time_state(task:OutcomeState,definition:SourceTimeDefinition):Promise<SourceTimeState>{
 task=structuredClone(task);task.integrity=await state_hash(task);
 const {run_id,revision,sim_time,mode,rate,paused,ended,finished,source_run,generation,origin_generation,phase,rng,log,inputs}=task;
 const ref=<K extends string>(kind:K,id:string)=>({run_id,kind,id,version:1 as const});
 const source_events=definition.catalogs.messages.filter(message=>message.received<=sim_time).map(message=>({ref:ref('source_delivery',message.id),report_ref:ref('source_report',message.report),message_ref:ref('source_message','MSG-'+message.id),sender:message.sender,recipient:message.recipient,sent:message.sent,received:message.received,knowledge_seq:definition.catalogs.messages.indexOf(message)+1}));
 return {schema:11,scenario_kind:'play_source_time',contract:'0.5.1',definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),run_id,revision,sim_time,mode,rate,paused,ended,finished,source_run,generation,origin_generation,phase,rng,log,inputs,task,source_events};
}
export async function initial_source_time_state(definition:SourceTimeDefinition,run:string,mode:Mode,generation:number,source_run:string|null=null,rng_origin=run){return compose_source_time_state(initial_outcome_state(definition.task_definition,run,mode,generation,source_run,rng_origin),definition);}
