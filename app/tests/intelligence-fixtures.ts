import mapDefinition from '../src/core/play-definition.json';
import {hash} from '../src/core/scenario';
import type {IntelligenceDefinition} from '../src/core/intelligence-definition';
import registeredIntelligence from '../src/core/intelligence-definition.json';

// Authoring fixture from the frozen B23 tables; expected observations stay literal
// in tests rather than being calculated from this fixture.
export async function intelligence_definition(){
  const entries:Array<[string,number,string]>=[
    ['deadline',900000,'ms'],['receipt_grace',10000,'ms'],['link_ms',1000,'ms'],
    ['phase_budget',5,'phase'],['plan_version_budget',32,'version'],['field_attempt_budget',16,'attempt'],
    ['processing_capacity',1,'slot'],['processing_initial_busy_until',85000,'ms'],['processing_energy',20,'energy'],
    ['validation_work',2,'work'],['preparation_work',6,'work'],['ms_per_work',10000,'ms/work'],
    ['source_start',65000,'ms'],['source_work',2,'work'],['source_energy_cost',4,'energy'],['source_first_wear',3,'wear'],['source_pack_cost',1,'item'],
    ['source_energy',20,'energy'],['source_durability',100,'wear'],['source_packs',1,'item'],
    ['record_work',4,'work'],['repair_work',6,'work'],['setup_ms',5000,'ms'],
    ['record_energy_cost',4,'energy'],['record_first_wear',3,'wear'],['record_pack_cost',1,'item'],
    ['repair_energy_cost',6,'energy'],['repair_first_wear',5,'wear'],['repair_pack_cost',2,'item'],
    ['movement_energy',20,'energy'],['base_speed',4,'fictional_metre/s'],['load_capacity',20,'load'],['space_capacity',12,'space'],
    ['link_energy',16,'energy'],['equipment_durability',100,'wear'],['send_energy_cost',1,'energy'],['send_wear_cost',1,'wear'],['reports_per_activity',2,'message']
  ];
  const profile={id:'FIC-PLAY-01',version:1,authoring_parent:{id:'FIC-BASE-01',version:2},parameters:Object.fromEntries(entries.map(([id,value])=>[id,value])) as IntelligenceDefinition['profile']['parameters'],registry:entries.map(([id,value,unit])=>({id,value,unit,entry_version:1,source_type:'design_assumption',calibration_status:'uncalibrated',source_ref:'B23-INTELLIGENCE-DESIGN-1.0.0/contract'})),parent_ref:registeredIntelligence.profile.parent_ref,resolved_registry:structuredClone(registeredIntelligence.profile.resolved_registry),authoring_overrides:structuredClone(registeredIntelligence.profile.authoring_overrides),resolution:structuredClone(registeredIntelligence.profile.resolution)};
  const capabilities=[{id:'ArchiveSource:record',actor:'ArchiveSource',action:'record',qualification:'record_keeper',equipment:'REC',unit:'work',capacity:1}];
  const rules={version:'b23-intelligence-1',fixed_facility_accounting:'not_modelled',lineage:'received_explicit_evidence_only',load_factor_per_unit:0.02,source_recipe:'complete_2work_4energy_3wear_1pack',disabled_capabilities:['handover','full_play_outcome','executing_replacement']};
  const catalogs={map:structuredClone(mapDefinition.catalogs.map),actors:[{id:'R',role:'record_keeper',people:3,origin:'H',load:9,space:7,record_energy:20,link_energy:16,record_packs:2},{id:'W',role:'work_keeper',people:3,origin:'B',load:8,space:6,work_energy:24,repair_packs:2}],fixed_facilities:[{id:'HQ',location:'H',actors:['HQ','INTEL']},{id:'B',location:'B',actors:['W']},{id:'H',location:'H',actors:['W']},{id:'ArchiveSource',location:'Archive',actors:['ArchiveSource']}],engine_conditions:{actual_access:'green'},initial_known:{blue:'unverified',green:'unverified',B_repair:'required'},source:{actor:'ArchiveSource',role:'record_keeper',equipment:'REC',packs:1},forwardings:[{id:'D1',received:21000,proof:'F1'},{id:'D2',received:31000,proof:'F2'},{id:'D3',received:41000,proof:'F3'}]};
  const hashes={profile:await hash(profile),capabilities:await hash(capabilities),rules:await hash(rules),catalogs:await hash(catalogs),media:await hash([])};
  const body={schema:9 as const,contract:'0.5.1',id:'B23-INTELLIGENCE-01',version:1,scenario_kind:'play_intelligence' as const,profile,capabilities,rules,catalogs,hashes};
  return {...body,definition_hash:await hash(body)};
}

export async function intelligence_variant(change:(definition:Awaited<ReturnType<typeof intelligence_definition>>)=>void){
  const value=await intelligence_definition();change(value);
  const credential=value.profile.resolved_registry.find(r=>r.id==='PLAY S08 credential')!;
  if(typeof credential.value!=='object'||credential.value===null||Array.isArray(credential.value))throw Error('Registered credential value must be a record');
  Reflect.set(credential.value,'actual',value.catalogs.engine_conditions.actual_access);
  const records=value.profile.resolved_registry.find(r=>r.id==='PLAY S08 source_records')!.value;
  if(typeof records!=='object'||records===null||Array.isArray(records)||!('R1' in records)||typeof records.R1!=='object'||records.R1===null)throw Error('Registered R1 metadata absent');
  Reflect.set(records.R1,'received',value.catalogs.forwardings.map(f=>f.received));
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash,...body}=value;value.definition_hash=await hash(body);return value;
}
