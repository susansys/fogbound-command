import registered from './conflicting-action-definition.json';
import {GameError} from '../contracts';
import {hash} from './scenario';
import {record} from '../protocol';
import source from './source-time-definition.json';
import task from './outcome-definition.json';
import type {FacilityCondition} from '../conflicting-action-contracts';
import type {IntelligenceDefinition} from './intelligence-definition';
import type {OutcomeDefinition} from './outcome-definition';

export type ConflictingActionDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'catalogs'>&{schema:12;scenario_kind:'play_conflicting_action';catalogs:Omit<typeof registered.catalogs,'reports'>&{reports:Array<Omit<typeof registered.catalogs.reports[number],'claim'>&{claim:FacilityCondition}>}};
const original=JSON.stringify(registered),identity=registered.definition_hash;
export const conflicting_action_definition=JSON.parse(original) as ConflictingActionDefinition;
export const is_conflicting_field_hash=(digest:unknown)=>digest===registered.field_definition_hash;
export const is_conflicting_task_hash=(digest:unknown)=>digest===registered.task_definition_hash;
export const conflicting_inspection_parameters=()=>structuredClone(registered.profile.parameters);
// These two closed internal definitions belong only to the schema12 package.
// They never register a caller-authored variant or reuse an older task identity.
export function conflicting_field_definition():IntelligenceDefinition{
 const field=structuredClone(task.prefix_definition);
 field.id='B32-CONFLICTING-FIELD-01';field.version=1;field.profile.id='FIC-B32-FIELD-01';
 Object.assign(field.rules,{version:'b32-conflicting-field-1',inspection_profile_ref:registered.profile.id,inspection_profile_hash:registered.hashes.profile});
 field.capabilities.push({id:'W:inspect',actor:'W',action:'inspect',qualification:'work_keeper',equipment:'WORK',unit:'work',capacity:1});
 field.catalogs.activities.splice(3,0,{id:'W-inspect',actor:'W',action:'inspect',from:'B',to:'B',capability:'W:inspect',prerequisite:null,conditions:[],label:'W检查B'});
 field.catalogs.activities.find(a=>a.id==='B-record')!.conditions=['verified_access','facility_evidence'];
 field.catalogs.initial_known.B_repair='unknown';
 field.hashes=structuredClone(registered.field_hashes);field.definition_hash=registered.field_definition_hash;
 return field as IntelligenceDefinition;
}
export function conflicting_task_definition():OutcomeDefinition{
 const value=structuredClone(task) as OutcomeDefinition;value.id='B32-CONFLICTING-TASK-01';value.version=1;value.profile.id='FIC-B32-TASK-01';
 const field=conflicting_field_definition();value.prefix_definition=field;
 Object.assign(value.rules,{version:'b32-conflicting-task-1',inspection_profile_ref:registered.profile.id,inspection_profile_hash:registered.hashes.profile});
 value.capabilities.push({id:'W:inspect',actor:'W',action:'inspect',qualification:'work_keeper',equipment:'WORK',unit:'work',capacity:1});
 value.catalogs.activities=structuredClone(field.catalogs.activities);
 value.catalogs.initial_known=structuredClone(field.catalogs.initial_known);
 value.hashes=structuredClone(registered.task_hashes);value.definition_hash=registered.task_definition_hash;
 return value as OutcomeDefinition;
}
export async function validate_conflicting_internal(input:unknown,selected:IntelligenceDefinition|OutcomeDefinition):Promise<void>{
 if(JSON.stringify(input)!==JSON.stringify(selected))throw new GameError('INVALID_DEFINITION');
 const {definition_hash,...body}=selected;
 if(await hash(body)!==definition_hash||await hash([])!==selected.hashes.media)throw new GameError('INVALID_DEFINITION');
 for(const key of ['profile','capabilities','rules','catalogs'] as const)if(await hash(selected[key])!==selected.hashes[key])throw new GameError('INVALID_DEFINITION');
}
export function is_conflicting_action_definition(value:{schema:number}):value is ConflictingActionDefinition{return value.schema===12;}
export function conflicting_definition_for_package(digest:unknown):ConflictingActionDefinition{
 if(digest!==identity)throw new GameError('INVALID_SAVE');
 return JSON.parse(original) as ConflictingActionDefinition;
}
export async function load_conflicting_action_definition(input:unknown):Promise<ConflictingActionDefinition>{
 if(!record(input)||JSON.stringify(input)!==original)throw new GameError('INVALID_DEFINITION');
 const selected=conflicting_definition_for_package(input.definition_hash),{definition_hash,...body}=selected;
 if(await hash(body)!==definition_hash||selected.task_definition_hash!==selected.hashes.task||selected.field_definition_hash!==selected.hashes.field||selected.source_definition_hash!==source.definition_hash||selected.hashes.source!==source.definition_hash)throw new GameError('INVALID_DEFINITION');
 await validate_conflicting_internal(conflicting_field_definition(),conflicting_field_definition());
 await validate_conflicting_internal(conflicting_task_definition(),conflicting_task_definition());
 for(const key of ['profile','catalogs','rules'] as const)if(await hash(selected[key])!==selected.hashes[key])throw new GameError('INVALID_DEFINITION');
 return selected;
}
