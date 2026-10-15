import {GameError} from '../contracts';
import type {PositionKnowledge,PlayReport,PlayDelivery} from '../play-contracts';
import type {SpatialScope} from '../spatial';
import {canonical} from './snapshot';

type Candidate=Extract<PositionKnowledge,{status:'conflicting'}>['candidates'][number];
function scope_key(scope:Exclude<SpatialScope,{kind:'unresolved'}>):string{
  const {kind,map_id,map_version,crs_id,geometry_version,precision,typed_geometry,uncertainty}=scope;
  const error=uncertainty.kind==='known'?{kind:uncertainty.kind,value:uncertainty.value,unit:uncertainty.unit}:uncertainty;
  return JSON.stringify(canonical({kind,map_id,map_version,crs_id,geometry_version,precision,typed_geometry,uncertainty:error}));
}
function merge_refs(a:string[],b:string[]):string[]{
  const refs=[...new Set([...a,...b])];if(refs.length>32)throw new GameError('ENGINE_UNCONFIRMED');return refs;
}
export function receive_position(current:PositionKnowledge,report:PlayReport,delivery:PlayDelivery):PositionKnowledge{
  if(!report.position_scope||report.observed.kind==='unknown')return current;
  const observed=report.observed;
  if(current.observed.kind==='known'&&observed.value<current.observed.value)return current;
  const incoming:Candidate={scope:structuredClone(report.position_scope),observed:structuredClone(observed),reported:structuredClone(report.reported),source_event_time:structuredClone(report.source_event_time),received:delivery.received.value,provenance:{kind:'delivered',report_ref:report.id,delivery_ref:delivery.id},evidence_refs:[report.id]};
  if(current.observed.kind==='known'&&observed.value===current.observed.value){
    if(current.status==='conflicting'){
      const same=current.candidates.find(candidate=>scope_key(candidate.scope)===scope_key(incoming.scope));
      if(same)return {...current,candidates:current.candidates.map(candidate=>candidate===same?{...candidate,evidence_refs:merge_refs(candidate.evidence_refs,incoming.evidence_refs)}:candidate)};
      if(current.candidates.length>=32)throw new GameError('ENGINE_UNCONFIRMED');
      return {...current,candidates:[...current.candidates,incoming]};
    }
    if(current.status==='known_scope'){
      if(scope_key(current.scope)===scope_key(incoming.scope))return {...current,evidence_refs:merge_refs(current.evidence_refs,incoming.evidence_refs)};
      const {status,...previous}=current;
      return {status:'conflicting',observed:structuredClone(current.observed),candidates:[previous,incoming]};
    }
  }
  return {status:'known_scope',...incoming};
}
