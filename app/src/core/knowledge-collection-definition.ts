import raw from './knowledge-collection-definition.json';
import {GameError} from '../contracts';
import {fields,record} from '../protocol';
import {hash} from './scenario';
import {canonical,json_data} from './snapshot';
export type KnowledgeCollectionGateProfile=keyof typeof raw.local_gate_profiles;
export type KnowledgeCollectionDefinition=Omit<typeof raw,'schema'|'contract'|'scenario_kind'|'version'|'facility'>&{
  schema:14;contract:'0.5.1';scenario_kind:'play_knowledge_collection';version:1;definition_hash:string;hashes:Record<string,string>;
  facility:{condition:'operable';version:1};
};
export function is_knowledge_collection_definition(value:{schema:number}):value is KnowledgeCollectionDefinition{return value.schema===14;}
export async function knowledge_collection_definition():Promise<KnowledgeCollectionDefinition>{
  const body=structuredClone(raw),hashes={geometry:await hash(canonical(body.geometry)),initial_positions:await hash(canonical(body.initial_positions)),public_rules:await hash(canonical(body.public_rules)),collection:await hash(canonical(body.collection)),inspection:await hash(canonical(body.inspection)),facility:await hash(canonical(body.facility)),actors:await hash(canonical(body.actors)),control_receipt:await hash(canonical(body.control_receipt)),diagnostic_sampling_surfaces:await hash(canonical(body.diagnostic_sampling_surfaces)),local_gate_profiles:await hash(canonical(body.local_gate_profiles))};
  return {...body,hashes,definition_hash:await hash(canonical({...body,hashes}))} as KnowledgeCollectionDefinition;
}
export async function load_knowledge_collection_definition(input:unknown):Promise<KnowledgeCollectionDefinition>{
  if(!json_data(input))throw new GameError('INVALID_DEFINITION');
  const expected=await knowledge_collection_definition();
  const selector=record(input)&&fields(input,['schema','contract','package_ref'])&&input.schema===14&&input.contract==='0.5.1'&&record(input.package_ref)&&fields(input.package_ref,['id','version'])&&input.package_ref.id===expected.id&&input.package_ref.version===1;
  if(!selector&&JSON.stringify(canonical(input))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_DEFINITION');
  return expected;
}
