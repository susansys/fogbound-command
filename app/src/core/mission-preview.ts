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
import type {MissionDefinition} from './mission-definition';
import {evaluate_mission_authority} from './mission-authority';
import {evaluate_mission_gate} from './mission-gates';
import {validate_mission_evidence} from './mission-evidence';
type MissionCatalogs=MissionDefinition['catalogs'];
export type MissionPublicDefinition=Pick<MissionDefinition,'profile'|'capabilities'|'rules'>&{catalogs:Pick<MissionCatalogs,'map'|'authority'|'movement_causes'>&{initial_evidence:Pick<MissionCatalogs['initial_evidence'],'id'>;actor:Pick<MissionCatalogs['actor'],'load'|'load_capacity'|'space'|'space_capacity'|'qualification_refs'>}};
export async function preview_mission(state:MissionState,editing_seq:number,input:unknown,owned:readonly MissionDefinition[]=[]):Promise<MissionPreview>{
  const draft:MissionDraft=parse_mission_draft(input,state.run_id),definition=mission_definition_for_package(state.definition_hash,owned);
  validate_mission_references(draft,definition);
  validate_mission_evidence(draft.evidence_refs,state,definition);
  return {kind:'mission_plan',run_id:state.run_id,revision:state.revision,editing_seq,draft_digest:await hash(canonical(draft)),phases:mission_phase_previews(state,draft,definition)};
}
export function mission_phase_previews(state:Pick<MissionState,'revision'|'sim_time'|'known'>,draft:MissionDraft,definition:MissionPublicDefinition):MissionPreview['phases']{
  const p=definition.profile.parameters;
  const basis={capability_ref:'R:move',speed:p.base_speed,unit:'fictional_metre/s' as const,load:definition.catalogs.actor.load,terrain_factor:p.terrain_factor,environment_factor:p.environment_factor,load_factor_per_unit:definition.rules.load_factor_per_unit,length_scale:1000000 as const,applied_causes:definition.catalogs.movement_causes.map(c=>({...c,consumer:'R:move' as const,slot:c.slot as 'terrain'|'environment'})),evidence_refs:[]};
  const phases=draft.phases.map(phase=>{
    const route=draft.routes.find(x=>x.id===phase.activity.route_ref.id);if(!route)throw new GameError('INVALID_REQUEST');
    const gap=public_route_gap(definition.catalogs.map,route.path),timing=path_timing(route.path,basis);
    const distance=Number(timing.length_units.reduce((sum,x)=>sum+BigInt(x),0n))/1000000;
    const authorization=evaluate_mission_authority(draft,phase,{at:state.sim_time,grant:definition.catalogs.authority,map:definition.catalogs.map});
    const capability=definition.capabilities.find(c=>c.id==='R:move')!;
    const confirmations=state.known.phase_confirmations.filter(c=>c.phase_id===phase.id&&c.phase_version===phase.version);
    const gate=evaluate_mission_gate(phase.id+'-entry',phase.entry_gate,{evaluated_by:'HQ',revision:state.revision,at:state.sim_time,rule_version:definition.rules.version,route:{permitted:gap===''&&authorization.status==='met',evidence_refs:[...new Set(definition.catalogs.map.scopes.filter(s=>s.kind==='corridor'||s.kind==='area').flatMap(s=>s.evidence_refs))]},confirmation:{confirmed:confirmations.length>0,evidence_refs:confirmations.flatMap(c=>[c.report_ref,c.delivery_ref])},capability:{ready:definition.catalogs.actor.qualification_refs.includes('R:move'),evidence_refs:capability.evidence_refs},position:{knowledge:state.known.position_knowledge,max_age_ms:p.position_max_age_ms,valid_until_time_ms:p.evidence_valid_until},map:definition.catalogs.map});
    if(gate.evidence_refs.length>p.evidence_budget)throw new GameError('EVIDENCE_REQUIRED');
    return {phase_id:phase.id,distance,estimated_move_ms:gap?null:ceil_fraction(timing.duration_ms),assumptions:phase.dependencies.length?['假设前阶段已确认']:[],gap,authorization,gate};
  });
  return phases;
}
