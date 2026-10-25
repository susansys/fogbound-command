import raw from './knowledge-collection-definition.json';
import {GameError} from '../contracts';
import {fields,record} from '../protocol';
import {hash} from './scenario';
import {canonical,json_data} from './snapshot';
import type {KnowledgeCollectionCaseRef} from '../knowledge-collection-contracts';
export type KnowledgeCollectionGateProfile=keyof typeof raw.local_gate_profiles;
export type KnowledgeCollectionSourceProfile='normal'|'missing_pair_WS'|'insufficient_scope_WS';
export type KnowledgeCollectionDefinition=Omit<typeof raw,'schema'|'contract'|'scenario_kind'|'version'|'facility'|'case_ref'>&{
  schema:14;contract:'0.5.1';scenario_kind:'play_knowledge_collection';version:1;case_ref:KnowledgeCollectionCaseRef;definition_hash:string;hashes:Record<string,string>;
  facility:{condition:'operable';version:1};
};
export function is_knowledge_collection_definition(value:{schema:number}):value is KnowledgeCollectionDefinition{return value.schema===14;}
export async function knowledge_collection_definition(case_ref:KnowledgeCollectionCaseRef='KA-NORMAL-01',source_profile:KnowledgeCollectionSourceProfile='normal'):Promise<KnowledgeCollectionDefinition>{
  if(typeof case_ref!=='string'||!Object.hasOwn(raw.case_registry,case_ref))throw new GameError('INVALID_DEFINITION');
  if(typeof source_profile!=='string'||!raw.source_profiles.includes(source_profile)||case_ref!=='KA-SOURCE3-01'&&source_profile!=='normal')throw new GameError('INVALID_DEFINITION');
  const body={...structuredClone(raw),case_ref,source_profile};
  if(source_profile==='missing_pair_WS')body.archive_materials.pairs=body.archive_materials.pairs.filter(pair=>pair.id!=='pair-WS');
  if(source_profile==='insufficient_scope_WS')body.archive_materials.pairs.find(pair=>pair.id==='pair-WS')!.scope.version=2;
  const hashes:Record<string,string>={geometry:await hash(canonical(body.geometry)),initial_positions:await hash(canonical(body.initial_positions)),public_rules:await hash(canonical(body.public_rules)),collection:await hash(canonical(body.collection)),inspection:await hash(canonical(body.inspection)),facility:await hash(canonical(body.facility)),actors:await hash(canonical(body.actors)),control_receipt:await hash(canonical(body.control_receipt)),diagnostic_sampling_surfaces:await hash(canonical(body.diagnostic_sampling_surfaces)),local_gate_profiles:await hash(canonical(body.local_gate_profiles)),case_registry:await hash(canonical(body.case_registry)),archive_policy:await hash(canonical(body.archive_policy)),archive_materials:await hash(canonical(body.archive_materials))};
  hashes.record_identity=await hash(canonical({id:body.id,version:body.version,contract:body.contract,case_ref:body.case_ref,geometry:body.geometry,public_rules:body.public_rules}));
  return {...body,hashes,definition_hash:await hash(canonical({...body,hashes}))} as KnowledgeCollectionDefinition;
}
export async function load_knowledge_collection_definition(input:unknown):Promise<KnowledgeCollectionDefinition>{
  if(!json_data(input))throw new GameError('INVALID_DEFINITION');
  const caseRef=record(input)&&typeof input.case_ref==='string'?input.case_ref:'KA-NORMAL-01';
  if(!Object.hasOwn(raw.case_registry,caseRef))throw new GameError('INVALID_DEFINITION');
  if(record(input)&&input.source_profile!==undefined&&(typeof input.source_profile!=='string'||!raw.source_profiles.includes(input.source_profile)))throw new GameError('INVALID_DEFINITION');
  const sourceProfile=record(input)&&typeof input.source_profile==='string'?input.source_profile:'normal';
  const expected=await knowledge_collection_definition(caseRef as KnowledgeCollectionCaseRef,sourceProfile as KnowledgeCollectionSourceProfile);
  const selector=record(input)&&fields(input,['schema','contract','package_ref',...(input.case_ref===undefined?[]:['case_ref']),...(input.source_profile===undefined?[]:['source_profile'])])&&(input.case_ref===undefined||input.case_ref===expected.case_ref)&&input.schema===14&&input.contract==='0.5.1'&&record(input.package_ref)&&fields(input.package_ref,['id','version'])&&input.package_ref.id===expected.id&&input.package_ref.version===1;
  if(!selector&&JSON.stringify(canonical(input))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_DEFINITION');
  return expected;
}
