import type {MissionDraft,ConditionExpr} from '../src/mission-contracts';
import definition from '../src/core/mission-definition.json';
import geometryDefinition from '../src/core/play-definition.json';
import {load_mission_definition,type MissionDefinition} from '../src/core/mission-definition';
import {hash} from '../src/core/scenario';
export async function mission_variant(change:(value:MissionDefinition)=>void):Promise<MissionDefinition>{
  const value=await load_mission_definition(definition);change(value);
  const map=value.catalogs.map,identity={map_id:map.map_id,map_version:map.map_version,crs_id:map.crs_id};
  const scopes=map.scopes.map(({geometry_version,...scope})=>scope),rules=Object.fromEntries(Object.entries(geometryDefinition.rules).filter(([key])=>key!=='disabled_capabilities'));
  map.geometry_version=await hash({identity,extent:map.extent,unit:map.unit,scopes,rules});for(const scope of map.scopes)scope.geometry_version=map.geometry_version;
  for(const entry of value.profile.registry)entry.value=value.profile.parameters[entry.id as keyof typeof value.profile.parameters];
  for(const key of ['profile','capabilities','rules','catalogs'] as const)value.hashes[key]=await hash(value[key]);
  const {definition_hash,...payload}=value;value.definition_hash=await hash(payload);return value;
}
export function mission_draft(run_id:string):MissionDraft{
  const ref=<K extends string>(kind:K,id:string,version=1)=>({run_id,kind,id,version});
  const yes:ConditionExpr={kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true};
  return {run_id,plan_id:'plan-M1',mission_ref:ref('mission','M1'),
    intent:{id:'intent-M1',version:1,purpose:'核对两处联络点',desired_end_state:'总部收到两阶段合法抵达凭证',key_tasks:['沿登记走廊移动'],priorities:['先A后B'],constraint_refs:['registered-corridors'],acceptable_risk:'registered_low',delegation_ref:ref('authority','B22-STATIC-GRANT')},
    objective:{id:'objective-M1',purpose:'抵达B并等待合法确认',success_expr:{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'B'},failure_expr:{kind:'not',child:yes},deadline_time_ms:900000,verification_requirements:['matching_arrival_report_and_delivery'],priority:1,dependencies:[]},
    phases:[{id:'P1',version:1,kind:'move',dependencies:[],entry_gate:yes,exit_gate:{kind:'compare',field_ref:'phase.confirmed',operator:'eq',typed_value:true},earliest_start_time_ms:1000,latest_finish_time_ms:31000,activity:{kind:'move',actor:'R',route_ref:ref('route','route-P1')}},{id:'P2',version:1,kind:'move',dependencies:[ref('phase','P1')],entry_gate:yes,exit_gate:{kind:'compare',field_ref:'phase.confirmed',operator:'eq',typed_value:true},earliest_start_time_ms:33000,latest_finish_time_ms:64000,activity:{kind:'move',actor:'R',route_ref:ref('route','route-P2')}}],
    routes:[{id:'route-P1',version:1,path:[[50,150],[150,150]]},{id:'route-P2',version:1,path:[[150,150],[250,150]]}],actor_assignments:['R'],support_windows:[],assumptions:[],evidence_refs:['B22-INITIAL-POSITION'],decision_points:[],note:'仅移动；自动维修／尽快执行只是记录'};
}
