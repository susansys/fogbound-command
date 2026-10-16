import registered from './intelligence-definition.json';
import {GameError} from '../contracts';
import {record,valid_id,fields} from '../protocol';
import {hash} from './scenario';
export type IntelligenceDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'catalogs'>&{schema:9;scenario_kind:'play_intelligence';catalogs:Omit<typeof registered.catalogs,'forwardings'>&{forwardings:Array<{id:string;received:number;proof:string|null;proof_received?:number;report_id?:string}>}};
export function is_intelligence_definition(value:{schema:number}):value is IntelligenceDefinition{return value.schema===9;}
export function intelligence_definition_for_package(digest:unknown,owned:readonly IntelligenceDefinition[]=[]):IntelligenceDefinition{
  const selected=[registered,...owned].find(d=>d.definition_hash===digest);
  if(!selected)throw new GameError('INVALID_SAVE');
  return structuredClone(selected) as IntelligenceDefinition;
}
export function intelligence_original_metadata(definition:IntelligenceDefinition):{observed:number;published:number}{
  const entry=definition.profile.resolved_registry.find(r=>r.id==='PLAY S08 source_records'),value=entry?.value;
  if(!record(value)||!record(value.R1)||typeof value.R1.observed!=='number'||typeof value.R1.published!=='number')throw new GameError('INVALID_DEFINITION');
  return {observed:value.R1.observed,published:value.R1.published};
}
export async function load_intelligence_definition(input:unknown,owned:readonly IntelligenceDefinition[]=[]):Promise<IntelligenceDefinition>{
  if(!record(input)||!record(input.profile)||!record(input.profile.parameters)||!Array.isArray(input.profile.registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
  if(!Array.isArray(input.profile.resolved_registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
  for(const required of registered.profile.resolved_registry){
    const entries=input.profile.resolved_registry.filter(e=>record(e)&&e.id===required.id),entry=entries[0];
    if(!entries.length||!record(entry)||!Object.hasOwn(entry,'type_unit')||!Object.hasOwn(entry,'value'))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    if(entry.type_unit!==required.type_unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.registry');
    if(entries.length!==1||entry.entry_version!==required.entry_version||entry.owner_system!==required.owner_system||entry.source_type!=='design_assumption'||entry.calibration_status!=='uncalibrated'||entry.source_ref!==required.source_ref)throw new GameError('INVALID_DEFINITION');
    const expected=structuredClone(required.value);
    if(required.id==='PLAY S08 credential'&&record(expected)&&record(input.catalogs)&&record(input.catalogs.engine_conditions))Reflect.set(expected,'actual',input.catalogs.engine_conditions.actual_access);
    if(required.id==='PLAY S08 source_records'&&record(expected)&&record(expected.R1)&&record(input.catalogs)&&Array.isArray(input.catalogs.forwardings)&&input.catalogs.forwardings.every(record))Reflect.set(expected.R1,'received',input.catalogs.forwardings.map(f=>f.received));
    if(JSON.stringify(entry.value)!==JSON.stringify(expected))throw new GameError('INVALID_DEFINITION');
  }
  if(input.profile.resolved_registry.length!==registered.profile.resolved_registry.length||input.profile.parent_ref!=='FIC-BASE-01/version2'||!record(input.profile.resolution)||input.profile.resolution.kind!=='complete_resolved'||input.profile.resolution.runtime_parent_loading!==false)throw new GameError('INVALID_DEFINITION');
  for(const required of registered.profile.registry){
    const entries=input.profile.registry.filter(x=>record(x)&&x.id===required.id);
    if(!Object.hasOwn(input.profile.parameters,required.id)||!entries.length||!record(entries[0])||!Object.hasOwn(entries[0],'unit'))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    if(entries[0].unit!==required.unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.registry');
    if(entries.length!==1||entries[0].value!==input.profile.parameters[required.id]||entries[0].value!==required.value||entries[0].entry_version!==1||entries[0].source_type!=='design_assumption'||entries[0].calibration_status!=='uncalibrated'||entries[0].source_ref!==required.source_ref)throw new GameError('INVALID_DEFINITION');
  }
  let selected:IntelligenceDefinition;try{selected=intelligence_definition_for_package(input.definition_hash,owned);}catch{throw new GameError('INVALID_DEFINITION');}
  if(JSON.stringify(input)!==JSON.stringify(selected)||selected.schema!==9||selected.id!==registered.id||selected.version!==1||selected.contract!=='0.5.1'||selected.scenario_kind!=='play_intelligence')throw new GameError('INVALID_DEFINITION');
  const {definition_hash,...body}=selected;
  if(await hash(body)!==definition_hash)throw new GameError('INVALID_DEFINITION');
  for(const key of ['profile','capabilities','rules','catalogs'] as const)if(await hash(selected[key])!==selected.hashes[key])throw new GameError('INVALID_DEFINITION');
  if(await hash([])!==selected.hashes.media||selected.profile.registry.length!==registered.profile.registry.length)throw new GameError('INVALID_DEFINITION');
  if(!record(selected.catalogs.engine_conditions)||!fields(selected.catalogs.engine_conditions,['actual_access'])||!['blue','green'].includes(selected.catalogs.engine_conditions.actual_access))throw new GameError('INVALID_DEFINITION');
  if(JSON.stringify(selected.catalogs.actors)!==JSON.stringify(registered.catalogs.actors))throw new GameError('INVALID_DEFINITION');
  if(!Array.isArray(selected.catalogs.forwardings)||selected.catalogs.forwardings.length!==3||new Set(selected.catalogs.forwardings.map(f=>f.id)).size!==3)throw new GameError('INVALID_DEFINITION');
  for(const f of selected.catalogs.forwardings){
    if(!record(f)||!fields(f,['id','received','proof',...(Object.hasOwn(f,'report_id')?['report_id']:[]),...(Object.hasOwn(f,'proof_received')?['proof_received']:[])])||!valid_id(f.id)||!Number.isSafeInteger(f.received)||f.received<21000||f.received>910000||!(f.proof===null||valid_id(f.proof))||f.report_id!==undefined&&!valid_id(f.report_id)||f.proof_received!==undefined&&(!Number.isSafeInteger(f.proof_received)||f.proof_received<f.received||f.proof_received>910000))throw new GameError('INVALID_DEFINITION');
  }
  return selected;
}
