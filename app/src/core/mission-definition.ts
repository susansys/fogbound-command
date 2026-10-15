import registered from './mission-definition.json';
import {GameError} from '../contracts';
import {hash} from './scenario';
import {validate_public_map,type PublicMap} from '../spatial';
import {mission_input_limits} from '../mission-protocol';
import {record} from '../protocol';
export type MissionDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'catalogs'>&{
  schema:8;scenario_kind:'play_mission';catalogs:Omit<typeof registered.catalogs,'map'>&{map:PublicMap};
};
export function is_mission_definition(value:{schema:number}):value is MissionDefinition{return value.schema===8;}
export function mission_definition_for_package(digest:unknown):MissionDefinition{
  if(digest!==registered.definition_hash)throw new GameError('INVALID_SAVE');
  return structuredClone(registered) as MissionDefinition;
}
export async function load_mission_definition(input:unknown):Promise<MissionDefinition>{
  if(!record(input)||!record(input.profile)||!record(input.profile.parameters)||!Array.isArray(input.profile.registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
  for(const required of registered.profile.registry){
    const entries=input.profile.registry.filter(x=>record(x)&&x.id===required.id);
    if(!Object.hasOwn(input.profile.parameters,required.id)||entries.length===0||!record(entries[0])||!Object.hasOwn(entries[0],'unit'))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    if(entries[0].unit!==required.unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.registry');
  }
  if(JSON.stringify(input)!==JSON.stringify(registered))throw new GameError('INVALID_DEFINITION');
  const value=mission_definition_for_package(registered.definition_hash);
  const {definition_hash,...payload}=value;
  if(await hash(payload)!==definition_hash)throw new GameError('INVALID_DEFINITION');
  for(const key of ['profile','capabilities','rules','catalogs'] as const){
    if(await hash(value[key])!==value.hashes[key])throw new GameError('INVALID_DEFINITION');
  }
  if(await hash([])!==value.hashes.media)throw new GameError('INVALID_DEFINITION');
  validate_public_map(value.catalogs.map);
  for(const [key,limit] of Object.entries(mission_input_limits))if(value.profile.parameters[key as keyof typeof value.profile.parameters]!==limit)throw new GameError('INVALID_DEFINITION');
  return value;
}
