import registered from './mission-definition.json';
import {GameError} from '../contracts';
import {hash} from './scenario';
import {validate_public_map,type PublicMap} from '../spatial';
import {mission_input_limits} from '../mission-protocol';
import {record,fields,valid_id} from '../protocol';
import type {KnownTime} from '../contracts';
import {dense_array} from '../spatial';
export type MissionPositionRecord={id:string;origin:'R'|'Q';target:'HQ'|'R';scope_ref:string;observed:KnownTime;source_event_time:KnownTime;reported_at:number;delivery_at:number};
export type MissionDefinition=Omit<typeof registered,'schema'|'scenario_kind'|'catalogs'>&{
  schema:8;scenario_kind:'play_mission';catalogs:Omit<typeof registered.catalogs,'map'|'initial_evidence'>&{map:PublicMap;position_reports?:MissionPositionRecord[];initial_evidence:Omit<typeof registered.catalogs.initial_evidence,'observed'|'source_event_time'>&{observed:KnownTime;source_event_time:KnownTime}};
};
function registered_time(value:unknown):value is KnownTime{
  return record(value)&&(value.kind==='unknown'&&fields(value,['kind'])||value.kind==='known'&&fields(value,['kind','value','evidence'])&&typeof value.value==='number'&&Number.isSafeInteger(value.value)&&value.value>=0&&valid_id(value.evidence));
}
export function is_mission_definition(value:{schema:number}):value is MissionDefinition{return value.schema===8;}
export function mission_definition_for_package(digest:unknown,owned:readonly MissionDefinition[]=[]):MissionDefinition{
  const selected=[registered,...owned].find(value=>value.definition_hash===digest);
  if(!selected)throw new GameError('INVALID_SAVE');
  return structuredClone(selected) as MissionDefinition;
}
export async function load_mission_definition(input:unknown,owned:readonly MissionDefinition[]=[]):Promise<MissionDefinition>{
  if(!record(input)||!record(input.profile)||!record(input.profile.parameters)||!Array.isArray(input.profile.registry))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
  for(const required of registered.profile.registry){
    const entries=input.profile.registry.filter(x=>record(x)&&x.id===required.id);
    if(!Object.hasOwn(input.profile.parameters,required.id)||entries.length===0||!record(entries[0])||!Object.hasOwn(entries[0],'unit')||!Object.hasOwn(entries[0],'source_ref'))throw new GameError('CONFIG_PARAMETER_MISSING','profile.registry');
    if(entries[0].unit!==required.unit)throw new GameError('CONFIG_UNIT_MISMATCH','profile.registry');
    const parameter=input.profile.parameters[required.id],fractional=['ratio','fictional_metre/s'].includes(required.unit);
    if(typeof parameter!=='number'||!Number.isFinite(parameter)||parameter<0||!fractional&&!Number.isSafeInteger(parameter)||fractional&&parameter<=0||typeof entries[0].source_ref!=='string'||!entries[0].source_ref.trim())throw new GameError('INVALID_DEFINITION');
    if(entries.length!==1||entries[0].value!==input.profile.parameters[required.id]||entries[0].entry_version!==1||entries[0].source_type!=='design_assumption'||entries[0].calibration_status!=='uncalibrated')throw new GameError('INVALID_DEFINITION');
  }
  let value:MissionDefinition;
  try{value=mission_definition_for_package(input.definition_hash,owned);}catch{throw new GameError('INVALID_DEFINITION');}
  if(JSON.stringify(input)!==JSON.stringify(value))throw new GameError('INVALID_DEFINITION');
  const {definition_hash,...payload}=value;
  if(await hash(payload)!==definition_hash)throw new GameError('INVALID_DEFINITION');
  for(const key of ['profile','capabilities','rules','catalogs'] as const){
    if(await hash(value[key])!==value.hashes[key])throw new GameError('INVALID_DEFINITION');
  }
  if(await hash([])!==value.hashes.media)throw new GameError('INVALID_DEFINITION');
  const p=value.profile.parameters;
  for(const spec of [{id:'R:move',action:'move',unit:'fictional_metre/s',capacity:p.move_capacity,group:'R:execution'},{id:'R:link',action:'send',unit:'message',capacity:p.link_capacity,group:'R:communication'}]){
    const matches=value.capabilities.filter(cap=>cap.id===spec.id);
    if(!matches.length)throw new GameError('CONFIG_PARAMETER_MISSING','capabilities');
    if(matches.length!==1)throw new GameError('INVALID_DEFINITION');
    const cap=matches[0];
    if(cap.unit!==spec.unit)throw new GameError('CONFIG_UNIT_MISMATCH','capabilities');
    const keys=['id','actor','action','unit','capacity','concurrency_group','evidence_refs',...(spec.id==='R:move'?['speed']:[])];
    if(!fields(cap,keys)||cap.actor!=='R'||cap.action!==spec.action||cap.capacity!==spec.capacity||spec.capacity!==1||cap.concurrency_group!==spec.group||!Array.isArray(cap.evidence_refs)||!cap.evidence_refs.length||cap.evidence_refs.length>32||!cap.evidence_refs.every(valid_id))throw new GameError('INVALID_DEFINITION');
    if(spec.id==='R:move'&&(typeof cap.speed!=='number'||!Number.isFinite(cap.speed)||cap.speed<=0||cap.speed!==p.base_speed))throw new GameError('INVALID_DEFINITION');
  }
  if(value.capabilities.length!==2)throw new GameError('INVALID_DEFINITION');
  validate_public_map(value.catalogs.map);
  const initial=value.catalogs.initial_evidence;
  if(!registered_time(initial.observed)||!registered_time(initial.source_event_time)||!valid_id(initial.id)||!value.catalogs.map.scopes.some(scope=>scope.id===initial.scope_ref)||initial.max_age_ms!==p.position_max_age_ms||initial.valid_until_time_ms!==p.evidence_valid_until)throw new GameError('INVALID_DEFINITION');
  if(initial.observed.kind==='known'&&initial.observed.value>0||initial.source_event_time.kind==='known'&&initial.source_event_time.value>0)throw new GameError('INVALID_DEFINITION');
  const reports=value.catalogs.position_reports;
  if(reports!==undefined){
    if(!dense_array(reports)||reports.length>32||new Set(reports.map(r=>r.id)).size!==reports.length)throw new GameError('INVALID_DEFINITION');
    for(const r of reports){
      if(!record(r)||!fields(r,['id','origin','target','scope_ref','observed','source_event_time','reported_at','delivery_at'])||!valid_id(r.id)||r.id===initial.id||!['R','Q'].includes(r.origin)||!['HQ','R'].includes(r.target)||!value.catalogs.map.scopes.some(s=>s.id===r.scope_ref)||!registered_time(r.observed)||!registered_time(r.source_event_time)||!Number.isSafeInteger(r.reported_at)||r.reported_at<0||!Number.isSafeInteger(r.delivery_at)||r.delivery_at<r.reported_at||r.delivery_at>p.deadline+p.receipt_grace||r.observed.kind==='known'&&r.observed.value>r.reported_at)throw new GameError('INVALID_DEFINITION');
    }
  }
  for(const [key,limit] of Object.entries(mission_input_limits))if(value.profile.parameters[key as keyof typeof value.profile.parameters]!==limit)throw new GameError('INVALID_DEFINITION');
  return value;
}
