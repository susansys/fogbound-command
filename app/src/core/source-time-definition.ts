import registered from './source-time-definition.json';
import {GameError} from '../contracts';
import {record,fields,valid_id} from '../protocol';
import {hash} from './scenario';
import {load_outcome_definition,type OutcomeDefinition} from './outcome-definition';
export type SourceTimeDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'task_definition'|'catalogs'>&{schema:11;scenario_kind:'play_source_time';task_definition:OutcomeDefinition;catalogs:Omit<typeof registered.catalogs,'time_bases'>&{time_bases:Array<{id:string;report:string;kind:'event'|'observation'|'source_reported';value:number;description:string}>}};
export const source_time_definition=registered as SourceTimeDefinition;
export function is_source_time_definition(value:{schema:number}):value is SourceTimeDefinition{return value.schema===11;}
export function source_time_definition_for_package(digest:unknown,owned:readonly SourceTimeDefinition[]=[]):SourceTimeDefinition{
 const found=[source_time_definition,...owned].find(value=>value.definition_hash===digest);if(!found)throw new GameError('INVALID_SAVE');return structuredClone(found);
}
export async function load_source_time_definition(input:unknown,owned:readonly SourceTimeDefinition[]=[]):Promise<SourceTimeDefinition>{
 if(!record(input))throw new GameError('INVALID_DEFINITION');let selected:SourceTimeDefinition;try{selected=source_time_definition_for_package(input.definition_hash,owned);}catch{throw new GameError('INVALID_DEFINITION');}
 if(JSON.stringify(selected)!==JSON.stringify(input)||selected.schema!==11||selected.scenario_kind!=='play_source_time'||selected.id!=='B31-SOURCE-TIME-01'||selected.version!==1||selected.contract!=='0.5.1')throw new GameError('INVALID_DEFINITION');
 const {definition_hash,...body}=selected;if(await hash(body)!==definition_hash||await hash(selected.profile)!==selected.hashes.profile||await hash(selected.catalogs)!==selected.hashes.catalogs||await hash(selected.rules)!==selected.hashes.rules||selected.hashes.task!==selected.task_definition.definition_hash)throw new GameError('INVALID_DEFINITION');
 const bases=selected.catalogs.time_bases,used=new Set<string>();if(!Array.isArray(bases)||new Set(bases.map(b=>b.id)).size!==bases.length)throw new GameError('INVALID_DEFINITION');
 for(const report of selected.catalogs.reports){
  const delivery=selected.catalogs.messages.find(message=>message.report===report.id);if(!delivery)throw new GameError('INVALID_DEFINITION');
  for(const [field,kind]of [['event_time','event'],['observed_time','observation'],['source_reported_time','source_reported']] as const){
   const time=report[field];if(!record(time))throw new GameError('INVALID_DEFINITION');if(time.kind==='unknown'){if(!fields(time,['kind']))throw new GameError('INVALID_DEFINITION');continue;}
   const basis=bases.find(basis=>basis.id===time.basis_ref);if(time.kind!=='known'||!fields(time,['kind','value','basis_ref'])||!Number.isSafeInteger(time.value)||Number(time.value)<0||Number(time.value)>delivery.received||!basis||!fields(basis,['id','report','kind','value','description'])||!valid_id(basis.id)||basis.report!==report.id||basis.kind!==kind||basis.value!==time.value||typeof basis.description!=='string'||basis.description.length>2000)throw new GameError('INVALID_DEFINITION');used.add(basis.id);
  }
 }
 if(used.size!==bases.length)throw new GameError('INVALID_DEFINITION');
 await load_outcome_definition(selected.task_definition);return selected;
}
