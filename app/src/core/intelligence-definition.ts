import registered from './intelligence-definition.json';
import {is_conflicting_field_hash,conflicting_field_definition,validate_conflicting_internal} from './conflicting-action-definition';
import {GameError} from '../contracts';
import {record,valid_id,fields} from '../protocol';
import {hash} from './scenario';
export type IntelligenceLocalCondition={actor:string;qualifications:string[]|null;equipment:string[]|null;record_energy:number|null;record_packs:number|null;position_scope:string|null;facility_authorized:boolean|null;source_ref:string};
export type IntelligenceDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'catalogs'>&{schema:9;scenario_kind:'play_intelligence';catalogs:Omit<typeof registered.catalogs,'forwardings'|'local_conditions'>&{local_conditions:IntelligenceLocalCondition[];forwardings:Array<{id:string;received:number;proof:string|null;proof_received?:number;report_id?:string}>}};
export function is_intelligence_definition(value:{schema:number}):value is IntelligenceDefinition{return value.schema===9;}
export function intelligence_definition_for_package(digest:unknown,owned:readonly IntelligenceDefinition[]=[]):IntelligenceDefinition{
  if(is_conflicting_field_hash(digest))return conflicting_field_definition();
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
  if(record(input)&&is_conflicting_field_hash(input.definition_hash)){const selected=conflicting_field_definition();await validate_conflicting_internal(input,selected);return selected;}
  if(!record(input)||!record(input.profile)||!record(input.profile.parameters)||!Array.isArray(input.profile.registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
  if(!Array.isArray(input.profile.resolved_registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
  // E14 owns explicit low-energy definitions passed through the existing
  // synthetic registry seam. The normal registered definition stays immutable;
  // neither the Worker nor the UI can register variants.
  const ownedFixture=owned.some(d=>d.definition_hash===input.definition_hash),e14Source='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E14';
  const lowProcessing=ownedFixture&&input.profile.parameters.processing_energy===1,lowSource=ownedFixture&&input.profile.parameters.source_energy===1;
  const receiptDelay=ownedFixture&&typeof input.profile.parameters.link_ms==='number'&&[10000,10001].includes(input.profile.parameters.link_ms),e43Source='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E43';
  for(const required of registered.profile.resolved_registry){
    const entries=input.profile.resolved_registry.filter(e=>record(e)&&e.id===required.id),entry=entries[0];
    if(!entries.length||!record(entry)||!Object.hasOwn(entry,'type_unit')||!Object.hasOwn(entry,'value'))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    if(entry.type_unit!==required.type_unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.registry');
    const lowEnergy=lowProcessing&&required.id==='PLAY S15 work.energy'||lowSource&&required.id==='PLAY S08 source_actor';
    const delayedLink=receiptDelay&&required.id==='S10 link.text';
    if(entries.length!==1||entry.entry_version!==required.entry_version||entry.owner_system!==required.owner_system||entry.source_type!=='design_assumption'||entry.calibration_status!=='uncalibrated'||entry.source_ref!==(lowEnergy?e14Source:delayedLink?e43Source:required.source_ref))throw new GameError('INVALID_DEFINITION');
    const expected=structuredClone(required.value);
    if(lowProcessing&&required.id==='PLAY S15 work.energy'&&record(expected))Reflect.set(expected,'initial',1);
    if(lowSource&&required.id==='PLAY S08 source_actor'&&record(expected))Reflect.set(expected,'energy',1);
    if(delayedLink&&record(expected))Reflect.set(expected,'normal_ms',input.profile.parameters.link_ms);
    if(required.id==='PLAY S08 credential'&&record(expected)&&record(input.catalogs)&&record(input.catalogs.engine_conditions))Reflect.set(expected,'actual',input.catalogs.engine_conditions.actual_access);
    if(required.id==='PLAY S08 source_records'&&record(expected)&&record(expected.R1)&&record(input.catalogs)&&Array.isArray(input.catalogs.forwardings)&&input.catalogs.forwardings.every(record))Reflect.set(expected.R1,'received',input.catalogs.forwardings.map(f=>f.received));
    if(JSON.stringify(entry.value)!==JSON.stringify(expected))throw new GameError('INVALID_DEFINITION');
  }
  if(input.profile.resolved_registry.length!==registered.profile.resolved_registry.length||input.profile.parent_ref!=='FIC-BASE-01/version2'||!record(input.profile.resolution)||input.profile.resolution.kind!=='complete_resolved'||input.profile.resolution.runtime_parent_loading!==false)throw new GameError('INVALID_DEFINITION');
  for(const required of registered.profile.registry){
    const entries=input.profile.registry.filter(x=>record(x)&&x.id===required.id);
    if(!Object.hasOwn(input.profile.parameters,required.id)||!entries.length||!record(entries[0])||!Object.hasOwn(entries[0],'unit'))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    if(entries[0].unit!==required.unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.registry');
    const lowEnergy=lowProcessing&&required.id==='processing_energy'||lowSource&&required.id==='source_energy';
    const delayedLink=receiptDelay&&required.id==='link_ms';
    if(entries.length!==1||entries[0].value!==input.profile.parameters[required.id]||entries[0].value!==(lowEnergy?1:delayedLink?input.profile.parameters.link_ms:required.value)||entries[0].entry_version!==1||entries[0].source_type!=='design_assumption'||entries[0].calibration_status!=='uncalibrated'||entries[0].source_ref!==(lowEnergy?e14Source:delayedLink?e43Source:required.source_ref))throw new GameError('INVALID_DEFINITION');
  }
  let selected:IntelligenceDefinition;try{selected=intelligence_definition_for_package(input.definition_hash,owned);}catch{throw new GameError('INVALID_DEFINITION');}
  if(JSON.stringify(input)!==JSON.stringify(selected)||selected.schema!==9||selected.id!==registered.id||selected.version!==1||selected.contract!=='0.5.1'||selected.scenario_kind!=='play_intelligence')throw new GameError('INVALID_DEFINITION');
  const {definition_hash,...body}=selected;
  if(await hash(body)!==definition_hash)throw new GameError('INVALID_DEFINITION');
  for(const key of ['profile','capabilities','rules','catalogs'] as const)if(await hash(selected[key])!==selected.hashes[key])throw new GameError('INVALID_DEFINITION');
  if(await hash([])!==selected.hashes.media||selected.profile.registry.length!==registered.profile.registry.length)throw new GameError('INVALID_DEFINITION');
  if(!record(selected.catalogs.engine_conditions)||!fields(selected.catalogs.engine_conditions,['actual_access'])||!['blue','green'].includes(selected.catalogs.engine_conditions.actual_access))throw new GameError('INVALID_DEFINITION');
  if(JSON.stringify(selected.catalogs.actors)!==JSON.stringify(registered.catalogs.actors))throw new GameError('INVALID_DEFINITION');
  const controlledMove=ownedFixture&&selected.catalogs.activities.length===registered.catalogs.activities.length+1&&JSON.stringify(selected.catalogs.activities.at(-1))===JSON.stringify({id:'E30-W-move',actor:'W',action:'move',from:'B',to:'H',capability:'W:move-fixture',prerequisite:null,conditions:[],label:'W受控移动探针'});
  if(JSON.stringify(selected.catalogs.activities.slice(0,registered.catalogs.activities.length))!==JSON.stringify(registered.catalogs.activities)||selected.catalogs.activities.length!==registered.catalogs.activities.length+(controlledMove?1:0))throw new GameError('INVALID_DEFINITION');
  const expectedCapabilities=[...registered.capabilities,...(controlledMove?[{id:'W:move-fixture',actor:'W',action:'move',qualification:'none',equipment:'movement',unit:'fictional_metre',capacity:1}]:[])];
  if(JSON.stringify(selected.capabilities)!==JSON.stringify(expectedCapabilities)||JSON.stringify(selected.rules)!==JSON.stringify(registered.rules))throw new GameError('INVALID_DEFINITION');
  for(const key of ['map','authorities','equipment','supply_units','fixed_facilities','initial_known','source'] as const)if(JSON.stringify(selected.catalogs[key])!==JSON.stringify(registered.catalogs[key]))throw new GameError('INVALID_DEFINITION');
  if(!Array.isArray(selected.catalogs.local_conditions)||selected.catalogs.local_conditions.length>2||new Set(selected.catalogs.local_conditions.map(c=>c.actor)).size!==selected.catalogs.local_conditions.length)throw new GameError('INVALID_DEFINITION');
  for(const c of selected.catalogs.local_conditions){
    const shape=ownedFixture&&fields(c,['actor','qualifications','equipment','record_energy','record_packs','position_scope','facility_authorized','source_ref'])&&['R','W'].includes(c.actor);
    const qualification=c.source_ref==='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E24'&&c.position_scope===null&&c.facility_authorized===null&&c.record_energy===null&&c.record_packs===null&&(c.qualifications===null||Array.isArray(c.qualifications)&&c.qualifications.length===0)&&(c.equipment===null||Array.isArray(c.equipment)&&(c.equipment.length===1&&['REC','WORK'].includes(c.equipment[0])||c.actor==='R'&&JSON.stringify(c.equipment)===JSON.stringify(['WORK','LINK'])));
    const energy=c.source_ref==='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E25'&&c.position_scope===null&&c.facility_authorized===null&&c.actor==='R'&&c.qualifications===null&&c.equipment===null&&c.record_energy===3&&c.record_packs===1;
    const facility=c.source_ref==='B23-INTELLIGENCE-DESIGN-1.0.0/acceptance.md:E30'&&c.actor==='W'&&c.qualifications===null&&c.equipment===null&&c.record_energy===null&&c.record_packs===null&&(c.position_scope===null&&c.facility_authorized===false||c.position_scope==='A'&&c.facility_authorized===null);
    if(!shape||!qualification&&!energy&&!facility)throw new GameError('INVALID_DEFINITION');
  }
  if(!Array.isArray(selected.catalogs.forwardings)||selected.catalogs.forwardings.length!==3||new Set(selected.catalogs.forwardings.map(f=>f.id)).size!==3)throw new GameError('INVALID_DEFINITION');
  for(const f of selected.catalogs.forwardings){
    if(!record(f)||!fields(f,['id','received','proof',...(Object.hasOwn(f,'report_id')?['report_id']:[]),...(Object.hasOwn(f,'proof_received')?['proof_received']:[])])||!valid_id(f.id)||!Number.isSafeInteger(f.received)||f.received<21000||f.received>910000||!(f.proof===null||valid_id(f.proof))||f.report_id!==undefined&&!valid_id(f.report_id)||f.proof_received!==undefined&&(!Number.isSafeInteger(f.proof_received)||f.proof_received<f.received||f.proof_received>910000))throw new GameError('INVALID_DEFINITION');
  }
  return selected;
}
