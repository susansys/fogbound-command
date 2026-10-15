import {GameError} from '../contracts';
import type {MissionState} from './mission-state';
import type {MissionDefinition} from './mission-definition';
import type {PositionKnowledge} from '../play-contracts';
import {canonical} from './snapshot';
import type {MissionLocalPositionKnowledge,MissionLocalPositionCandidate} from '../mission-contracts';

type Candidate=MissionLocalPositionCandidate;
const scope_identity=(scope:Candidate['scope'])=>{
  const {id,evidence_refs,uncertainty,...geometry}=scope;
  const error=uncertainty.kind==='known'?{kind:uncertainty.kind,value:uncertainty.value,unit:uncertainty.unit}:uncertainty;
  return JSON.stringify(canonical({...geometry,uncertainty:error}));
};
export function merge_mission_position(current:PositionKnowledge,incoming:Extract<PositionKnowledge,{status:'conflicting'}>['candidates'][number]):PositionKnowledge;
export function merge_mission_position(current:MissionLocalPositionKnowledge,incoming:Candidate):MissionLocalPositionKnowledge;
export function merge_mission_position(current:MissionLocalPositionKnowledge,incoming:Candidate):MissionLocalPositionKnowledge{
  if(incoming.observed.kind==='unknown')return current;
  if(current.observed.kind==='known'&&incoming.observed.value<current.observed.value)return current;
  if(current.observed.kind==='known'&&incoming.observed.value===current.observed.value){
    const merge=(c:Candidate)=>({...c,evidence_refs:[...new Set([...c.evidence_refs,...incoming.evidence_refs])]});
    if(current.status==='conflicting'){
      const existing=current.candidates.find(c=>scope_identity(c.scope)===scope_identity(incoming.scope));
      return {...current,candidates:existing?current.candidates.map(c=>c===existing?merge(c):c):[...current.candidates,incoming]};
    }
    if(current.status==='known_scope'){
      if(scope_identity(current.scope)===scope_identity(incoming.scope))return {...current,evidence_refs:merge(current).evidence_refs};
      const {status,...previous}=current;
      return {status:'conflicting',observed:structuredClone(current.observed),candidates:[previous,incoming]};
    }
  }
  return {status:'known_scope',...incoming};
}
export function deliver_mission_position_records(state:MissionState,definition:MissionDefinition):void{
  const records=[...(definition.catalogs.position_reports??[])].sort((a,b)=>a.delivery_at-b.delivery_at||a.id.localeCompare(b.id));
  for(const record of records){
    if(record.reported_at<=state.sim_time&&!state.position_reports.some(r=>r.id===record.id))state.position_reports.push({...structuredClone(record),run_id:state.run_id});
    if(record.delivery_at>state.sim_time||record.origin!=='R'||record.target!=='HQ'||state.position_deliveries.some(d=>d.report_ref===record.id))continue;
    const delivery={id:'position-delivery-'+record.id,run_id:state.run_id,report_ref:record.id,received:record.delivery_at};
    state.position_deliveries.push(delivery);
    const scope=definition.catalogs.map.scopes.find(s=>s.id===record.scope_ref)!;
    if(scope.kind==='unresolved')continue;
    state.known.position_knowledge=merge_mission_position(state.known.position_knowledge,{scope:structuredClone(scope),observed:structuredClone(record.observed),reported:{kind:'known',value:record.reported_at,evidence:record.id},source_event_time:structuredClone(record.source_event_time),received:delivery.received,provenance:{kind:'delivered',report_ref:record.id,delivery_ref:delivery.id},evidence_refs:[record.id]});
  }
}

export function validate_mission_evidence(refs:string[],state:MissionState,definition:MissionDefinition):void{
  const legal=new Set([
    definition.catalogs.initial_evidence.id,definition.catalogs.authority.id,
    ...definition.capabilities.filter(c=>c.actor==='R').flatMap(c=>c.evidence_refs),
    ...definition.catalogs.map.scopes.flatMap(scope=>scope.evidence_refs),
    ...definition.catalogs.movement_causes.map(c=>c.evidence_ref),
    ...state.known.phase_confirmations.flatMap(c=>[c.report_ref,c.delivery_ref]),
    ...state.deliveries.filter(d=>d.received<=state.sim_time&&state.reports.some(r=>r.id===d.report_ref&&r.run_id===state.run_id&&r.actor==='R'&&r.target==='HQ')).flatMap(d=>[d.report_ref,d.id]),
    ...state.position_deliveries.filter(d=>d.run_id===state.run_id&&d.received<=state.sim_time).flatMap(d=>[d.report_ref,d.id])
  ]);
  if(refs.some(ref=>!legal.has(ref)))throw new GameError('EVIDENCE_REQUIRED');
}
