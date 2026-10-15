import {GameError} from '../contracts';
import type {MissionDraft,MissionPreview} from '../mission-contracts';
import {parse_mission_draft} from '../mission-protocol';
import {path_timing,ceil_fraction} from './play-timing';
import {public_route_gap} from '../route-validation';
import {hash} from './scenario';
import {canonical} from './snapshot';
import {mission_definition_for_package} from './mission-definition';
import type {MissionState} from './mission-state';
import {validate_mission_references} from './mission-validation';
export async function preview_mission(state:MissionState,editing_seq:number,input:unknown):Promise<MissionPreview>{
  const draft:MissionDraft=parse_mission_draft(input,state.run_id),definition=mission_definition_for_package(state.definition_hash),p=definition.profile.parameters;
  validate_mission_references(draft,definition);
  const basis={capability_ref:'R:move',speed:p.base_speed,unit:'fictional_metre/s' as const,load:definition.catalogs.actor.load,terrain_factor:p.terrain_factor,environment_factor:p.environment_factor,load_factor_per_unit:definition.rules.load_factor_per_unit,length_scale:1000000 as const,applied_causes:definition.catalogs.movement_causes.map(c=>({...c,consumer:'R:move' as const,slot:c.slot as 'terrain'|'environment'})),evidence_refs:[]};
  const phases=draft.phases.map(phase=>{
    const route=draft.routes.find(x=>x.id===phase.activity.route_ref.id);if(!route)throw new GameError('INVALID_REQUEST');
    const gap=public_route_gap(definition.catalogs.map,route.path),timing=path_timing(route.path,basis);
    const distance=Number(timing.length_units.reduce((sum,x)=>sum+BigInt(x),0n))/1000000;
    return {phase_id:phase.id,distance,estimated_move_ms:gap?null:ceil_fraction(timing.duration_ms),assumptions:phase.dependencies.length?['假设前阶段已确认']:[],gap};
  });
  return {kind:'mission_plan',run_id:state.run_id,revision:state.revision,editing_seq,draft_digest:await hash(canonical(draft)),phases};
}
