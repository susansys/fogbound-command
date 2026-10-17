import definition from "./engineering.json";
import recordDefinition from "./record-engineering.json";
import prestartDefinition from './prestart-engineering.json';
import playDefinition from './play-definition.json';
import {load_mission_definition,type MissionDefinition} from './mission-definition';
import {load_intelligence_definition,type IntelligenceDefinition} from './intelligence-definition';
import {GameError} from '../contracts';
import {record,fields,valid_id} from '../protocol';
import {validate_public_map,dense_array} from '../spatial';
import type {PublicMap} from '../spatial';
import type {KnownTime} from '../contracts';
import type {PositionCatalogEntry} from '../play-contracts';
export const engineeringDefinition = definition;
export const recordEngineeringDefinition = recordDefinition;
export const prestartEngineeringDefinition=prestartDefinition;
export const playCorridorDefinition=playDefinition;
export type PlayDefinition=Omit<typeof playDefinition,'schema'|'scenario_kind'|'catalogs'>&{schema:7;scenario_kind:'play_corridor';catalogs:Omit<typeof playDefinition.catalogs,'map'|'initial_evidence'|'engine_conditions'|'position_reports'>&{map:PublicMap;position_reports:PositionCatalogEntry[];engine_conditions:{closed_at_x:number|null;report_delivery_delay_ms:number};initial_evidence:{id:string;scope_ref:string;observed:KnownTime;source_event_time:KnownTime;origin:'registered_initial_evidence'}}};
export function is_play_definition(value:Definition|PlayDefinition|MissionDefinition|IntelligenceDefinition):value is PlayDefinition{return value.schema===7;}
export function play_definition_for_package(definitionHash:unknown,registered:readonly PlayDefinition[]=[]):PlayDefinition{
  const selected=[playDefinition,...registered].find(x=>x.definition_hash===definitionHash);
  if(!selected)throw new GameError('INVALID_SAVE');
  return structuredClone(selected) as PlayDefinition;
}
const definitions=[definition,recordDefinition,prestartDefinition];
export type Definition = typeof definition | typeof recordDefinition | typeof prestartDefinition;
export function prestart_parameters(state:{schema:unknown;definition_hash:unknown}):typeof prestartDefinition.profile.parameters{
  if(state.schema!==6||state.definition_hash!==prestartDefinition.definition_hash)throw new GameError('INVALID_SAVE');
  return prestartDefinition.profile.parameters;
}
export function prestart_case(state:{schema:unknown;definition_hash:unknown},case_ref:string):{hq_unavailable:number[][];old_acceptance_delay_ms?:number;rejection_delay_ms?:number;all_reports_delay_ms?:number}{
  prestart_parameters(state);
  if(typeof case_ref!=='string'||!Object.hasOwn(prestartDefinition.catalogs.prestart_cases,case_ref))throw new GameError('INVALID_INPUT');
  return prestartDefinition.catalogs.prestart_cases[case_ref as keyof typeof prestartDefinition.catalogs.prestart_cases];
}
export function definition_for_package(schema:unknown,definitionHash:unknown):Definition {
  const found=definitions.find(candidate=>candidate.schema===schema&&candidate.definition_hash===definitionHash);
  if(!found)throw new GameError('INVALID_SAVE');
  return found;
}
export function record_definition_for_package(schema:unknown,definitionHash:unknown):typeof recordDefinition {
  if(schema!==recordDefinition.schema||definitionHash!==recordDefinition.definition_hash)throw new GameError('INVALID_SAVE');
  return recordDefinition;
}
export async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function known_time(value:unknown):boolean{
  if(!record(value))return false;
  if(value.kind==='unknown')return fields(value,['kind']);
  return value.kind==='known'&&fields(value,['kind','value','evidence'])&&typeof value.value==='number'&&Number.isSafeInteger(value.value)&&value.value>=0&&valid_id(value.evidence);
}
export async function load_definition(input: unknown,registered:readonly PlayDefinition[]=[],missions:readonly MissionDefinition[]=[],intelligence:readonly IntelligenceDefinition[]=[]): Promise<Definition|PlayDefinition|MissionDefinition|IntelligenceDefinition> {
  if(record(input)&&input.schema===9)return load_intelligence_definition(input,intelligence);
  if(record(input)&&input.schema===8){
    if(!record(input.profile)||!record(input.profile.parameters))throw new GameError('CONFIG_PARAMETER_MISSING','profile.parameters');
    if(!Array.isArray(input.profile.registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    return load_mission_definition(input,missions);
  }
  if(record(input)&&input.schema===7){
    if(!record(input.profile)||!record(input.profile.parameters))throw new GameError('CONFIG_PARAMETER_MISSING','profile.parameters');
    if(!record(input.catalogs)||!record(input.catalogs.map))throw new GameError('CONFIG_PARAMETER_MISSING','catalogs.map');
  }
  if(record(input)&&input.schema===7&&record(input.catalogs)){
    const map=input.catalogs.map;validate_public_map(map);
    if(!record(input.rules))throw new GameError('CONFIG_PARAMETER_MISSING','rules');
    const publicRules:Record<string,unknown>={};
    for(const key of Object.keys(playDefinition.rules).filter(key=>key!=='disabled_capabilities')){
      if(!Object.hasOwn(input.rules,key))throw new GameError('CONFIG_PARAMETER_MISSING','rules.'+key);
      publicRules[key]=input.rules[key];
    }
    const identity={map_id:map.map_id,map_version:map.map_version,crs_id:map.crs_id};
    const scopes=map.scopes.map(({geometry_version,...scope})=>scope);
    if(await hash({identity,extent:map.extent,unit:map.unit,scopes,rules:publicRules})!==map.geometry_version)throw new GameError('INVALID_REQUEST','catalogs.map.geometry_version');
    const initial=input.catalogs.initial_evidence;
    if(!record(initial)||!fields(initial,['id','scope_ref','observed','source_event_time','origin'])||!valid_id(initial.id)||!valid_id(initial.scope_ref)||initial.origin!=='registered_initial_evidence'||!known_time(initial.observed)||!known_time(initial.source_event_time)||!map.scopes.some(scope=>scope.id===initial.scope_ref))throw new GameError('INVALID_REQUEST','catalogs.initial_evidence');
  }
  if(record(input)&&input.schema===7&&record(input.profile)&&record(input.profile.parameters)){
    const parameters=input.profile.parameters,registry=input.profile.registry;
    if(!Array.isArray(registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    for(const required of playDefinition.profile.registry){
      const entries=registry.filter(entry=>record(entry)&&entry.id===required.id);
      if(!Object.hasOwn(parameters,required.id)||entries.length===0||!record(entries[0])||entries[0].unit===undefined)throw new GameError('CONFIG_PARAMETER_MISSING','profile.parameters.'+required.id);
      if(entries[0].unit!==required.unit)throw new GameError('CONFIG_UNIT_MISMATCH',`profile.registry[${registry.indexOf(entries[0])}].unit`);
      const value=parameters[required.id];
      if(entries.length!==1||typeof value!=='number'||!Number.isFinite(value)||value!==entries[0].value)throw new GameError('INVALID_DEFINITION');
      if(['base_speed','terrain_factor','environment_factor'].includes(required.id)){
        if(value<=0)throw new GameError('INVALID_REQUEST','profile.parameters.'+required.id);
      }else if(!Number.isSafeInteger(value)||value<0||value>required.value)throw new GameError('INVALID_REQUEST','profile.parameters.'+required.id);
      if(['deadline','receipt_grace','link_ms','load_capacity','space_capacity','report_budget','report_energy_cost','report_wear_cost'].includes(required.id)&&value!==required.value)throw new GameError('INVALID_REQUEST','profile.parameters.'+required.id);
    }
    const rules=input.rules;
    if(!record(rules))throw new GameError('CONFIG_PARAMETER_MISSING','rules');
    for(const [key,value] of Object.entries(playDefinition.rules))if(JSON.stringify(rules[key])!==JSON.stringify(value))throw new GameError('INVALID_REQUEST','rules.'+key);
    const capabilities=input.capabilities,actor=record(input.catalogs)?input.catalogs.actor:null;
    if(!dense_array(capabilities)||capabilities.length!==1||!record(capabilities[0]))throw new GameError('CONFIG_PARAMETER_MISSING','capabilities');
    const capability=capabilities[0];
    if(capability.unit!=='fictional_metre/s')throw new GameError(capability.unit===undefined?'CONFIG_PARAMETER_MISSING':'CONFIG_UNIT_MISMATCH','capabilities[0].unit');
    if(!valid_id(capability.id)||capability.actor!=='R'||capability.action!=='move'||typeof capability.speed!=='number'||!Number.isFinite(capability.speed)||capability.speed<=0||capability.speed!==parameters.base_speed||!dense_array(capability.evidence_refs)||!capability.evidence_refs.length||capability.evidence_refs.length>32||!capability.evidence_refs.every(valid_id))throw new GameError('INVALID_REQUEST','capabilities[0]');
    if(!record(actor)||actor.id!=='R'||!dense_array(actor.qualification_refs)||!actor.qualification_refs.includes(capability.id)||actor.qualification_refs.some(ref=>ref!==capability.id))throw new GameError('INVALID_REQUEST','catalogs.actor.qualification_refs');
    const equipment=record(input.catalogs)?input.catalogs.equipment:null,items=record(input.catalogs)?input.catalogs.items:null;
    const nonnegative=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
    const terminal=record(input.catalogs)?input.catalogs.hq_terminal:null;
    if(!record(terminal)||!fields(terminal,['id','energy','wear','energy_per_send','wear_per_send'])||terminal.id!=='HQ-TERM'||terminal.energy!==parameters.hq_energy||terminal.wear!==parameters.hq_wear||terminal.energy_per_send!==1||terminal.wear_per_send!==1)throw new GameError('INVALID_REQUEST','catalogs.hq_terminal');
    if(!dense_array(equipment)||!equipment.every(item=>record(item)&&valid_id(item.id)&&nonnegative(item.load)&&nonnegative(item.space))||!dense_array(items)||!items.every(item=>record(item)&&valid_id(item.id)&&nonnegative(item.load)&&nonnegative(item.space)&&nonnegative(item.count)))throw new GameError('INVALID_REQUEST','catalogs.actor');
    for(const field of ['load','space']){
      const total=equipment.reduce<number>((sum,item)=>sum+Number((item as Record<string,unknown>)[field]),0)+items.reduce<number>((sum,item)=>sum+Number((item as Record<string,unknown>)[field])*Number((item as Record<string,unknown>).count),0);
      if(!nonnegative(actor[field])||actor[field]!==total||typeof parameters[field+'_capacity']!=='number'||total>Number(parameters[field+'_capacity']))throw new GameError('INVALID_REQUEST','catalogs.actor.'+field);
    }
    const causes=record(input.catalogs)?input.catalogs.movement_causes:null;
    if(!dense_array(causes)||causes.length<1||causes.length>32)throw new GameError('INVALID_REQUEST','catalogs.movement_causes');
    const seen=new Map<string,number>(),slotFactors={terrain:1,environment:1};
    for(const cause of causes){
      if(!record(cause)||!fields(cause,['cause_id','rule_ref','consumer','slot','factor','evidence_ref'])||!valid_id(cause.cause_id)||!valid_id(cause.rule_ref)||!valid_id(cause.evidence_ref)||cause.consumer!=='R:move'||!['terrain','environment'].includes(String(cause.slot))||typeof cause.factor!=='number'||!Number.isFinite(cause.factor)||cause.factor<=0)throw new GameError('INVALID_REQUEST','catalogs.movement_causes');
      const key=JSON.stringify([cause.cause_id,cause.rule_ref,cause.consumer]);
      if(seen.has(key)&&seen.get(key)!==cause.factor)throw new GameError('INVALID_REQUEST','catalogs.movement_causes');
      seen.set(key,cause.factor);slotFactors[cause.slot as 'terrain'|'environment']*=cause.factor;
    }
    if(slotFactors.terrain!==parameters.terrain_factor||slotFactors.environment!==parameters.environment_factor)throw new GameError('INVALID_REQUEST','catalogs.movement_causes');
    const conditions=record(input.catalogs)?input.catalogs.engine_conditions:null;
    if(!record(conditions)||!fields(conditions,['closed_at_x','report_delivery_delay_ms'])||!(conditions.closed_at_x===null||typeof conditions.closed_at_x==='number'&&Number.isFinite(conditions.closed_at_x)&&conditions.closed_at_x>=0&&conditions.closed_at_x<=400)||!nonnegative(conditions.report_delivery_delay_ms)||conditions.report_delivery_delay_ms>910000)throw new GameError('INVALID_DEFINITION');
    const reports=record(input.catalogs)?input.catalogs.position_reports:null,map=record(input.catalogs)?input.catalogs.map:null;
    if(!dense_array(reports)||reports.length>32||!record(map)||!Array.isArray(map.scopes))throw new GameError('INVALID_DEFINITION');
    const reportIds=new Set<string>();
    for(const report of reports){
      if(!record(report)||!fields(report,['id','scope_ref','observed','reported_at','delivery_at','source_event_time'])||!valid_id(report.id)||reportIds.has(report.id)||!(report.scope_ref===null||typeof report.scope_ref==='string'&&map.scopes.some(scope=>record(scope)&&scope.id===report.scope_ref&&scope.kind!=='unresolved'))||!known_time(report.observed)||!known_time(report.source_event_time)||!nonnegative(report.reported_at)||report.reported_at>910000||!nonnegative(report.delivery_at)||report.delivery_at<report.reported_at+Number(parameters.link_ms)||report.delivery_at>1820000)throw new GameError('INVALID_DEFINITION');
      if(record(report.observed)&&report.observed.kind==='known'&&Number(report.observed.value)>report.reported_at||record(report.source_event_time)&&report.source_event_time.kind==='known'&&Number(report.source_event_time.value)>report.reported_at)throw new GameError('INVALID_DEFINITION');
      reportIds.add(report.id);
    }
  }
  const selected = [...definitions,playDefinition,...registered].find(candidate => JSON.stringify(input) === JSON.stringify(candidate));
  if (!selected)
    throw new GameError("INVALID_DEFINITION");
  const { definition_hash, ...payload } = selected;
  if ((await hash(payload)) !== definition_hash)
    throw new GameError("INVALID_DEFINITION");
  for (const key of ['profile','capabilities','rules','catalogs'] as const) {
    if (await hash(selected[key]) !== selected.hashes[key]) throw new GameError('INVALID_DEFINITION');
  }
  if (await hash([]) !== selected.hashes.media) throw new GameError('INVALID_DEFINITION');
  return selected.schema===7?structuredClone(selected) as PlayDefinition:structuredClone(selected) as Definition;
}
export function describe_capabilities() {
  return [...definition.capabilities];
}
