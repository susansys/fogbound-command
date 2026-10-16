import type {MissionState} from './mission-state';
import type {MissionDefinition} from './mission-definition';
import {evaluate_mission_gate} from './mission-gates';
import {evaluate_mission_authority} from './mission-authority';
import {public_route_gap} from '../route-validation';
import {fraction_to_number} from './play-timing';
import type {MissionReport} from '../mission-contracts';
import {merge_mission_position} from './mission-evidence';
export function local_movement_conflict(state:MissionState,until:number):boolean{
  return state.executions.some(e=>e.status==='moving')||state.local.reservations.some(r=>r.capability_ref==='R:move'&&r.from<until&&state.sim_time<r.to);
}
export function next_local_link_time(state:MissionState,at:number,duration:number):number{
  const windows=[...state.local.reservations.filter(r=>r.capability_ref==='R:link').map(r=>({from:r.from,to:r.to})),...state.transmissions.map(t=>({from:t.at,to:t.until}))].sort((a,b)=>a.from-b.from||a.to-b.to);
  let candidate=at;for(const window of windows)if(window.from<candidate+duration&&candidate<window.to)candidate=window.to;return candidate;
}
export function observe_mission_position(state:MissionState,definition:MissionDefinition,id:string):MissionReport['position_scope']{
  const base=definition.catalogs.map.scopes.find(s=>s.kind==='point')!,x=fraction_to_number(state.world.position.x),y=fraction_to_number(state.world.position.y),position:[number,number]=[Math.round(x*100)/100,Math.round(y*100)/100];
  const scope={...base,id:id+'-position',kind:'point' as const,typed_geometry:{position},uncertainty:{kind:'known' as const,value:x===position[0]&&y===position[1]?0:.01,unit:'fictional_metre' as const,evidence:id},evidence_refs:[id]};
  state.local.revision++;state.local.observations.push({id,at:state.sim_time,scope:structuredClone(scope),source_ref:'terminal_observation'});
  state.local.position_knowledge={status:'known_scope',scope:structuredClone(scope),observed:{kind:'known',value:state.sim_time,evidence:id},reported:{kind:'unknown'},source_event_time:{kind:'unknown'},received:null,provenance:{kind:'local_observation',observation_ref:id},evidence_refs:[id]};
  return scope;
}
export function deliver_local_position(state:MissionState,definition:MissionDefinition,record:NonNullable<MissionDefinition['catalogs']['position_reports']>[number]):void{
  state.local.position_deliveries.push(record.id);state.local.revision++;const scope=definition.catalogs.map.scopes.find(s=>s.id===record.scope_ref)!;
  if(scope.kind==='unresolved')return;
  state.local.position_knowledge=merge_mission_position(state.local.position_knowledge,{scope:structuredClone(scope),observed:structuredClone(record.observed),reported:{kind:'known',value:record.reported_at,evidence:record.id},source_event_time:structuredClone(record.source_event_time),received:record.delivery_at,provenance:{kind:'delivered',report_ref:record.id,delivery_ref:record.id+'-to-R'},evidence_refs:[record.id]});
}
export function local_mission_check(state:MissionState,order:MissionState['orders'][number],definition:MissionDefinition){
  const {draft,phase,route,grant}=order.frozen_payload,p=definition.profile.parameters;
  const authority=evaluate_mission_authority(draft,phase,{at:state.sim_time,grant,map:definition.catalogs.map});
  const capability=definition.capabilities.find(c=>c.id==='R:move')!;
  const confirmations=state.reports.filter(r=>r.run_id===state.run_id&&r.actor==='R'&&r.kind==='arrived'&&r.phase_ref.id===phase.id&&r.phase_ref.version===phase.version);
  const gate=evaluate_mission_gate(phase.id+'-entry',phase.entry_gate,{evaluated_by:'R',revision:state.local.revision,at:state.sim_time,rule_version:definition.rules.version,
    capability:{ready:definition.catalogs.actor.qualification_refs.includes('R:move'),evidence_refs:capability.evidence_refs},
    route:{permitted:authority.status==='met'&&public_route_gap(definition.catalogs.map,route.path)==='',evidence_refs:[grant.id]},
    confirmation:{confirmed:confirmations.length>0,evidence_refs:confirmations.map(r=>r.id)},
    position:{knowledge:state.local.position_knowledge,max_age_ms:p.position_max_age_ms,valid_until_time_ms:p.evidence_valid_until},map:definition.catalogs.map});
  return {gate,authority};
}
