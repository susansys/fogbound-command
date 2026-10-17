import type {OutcomeState} from './outcome-state';
import type {OutcomeDefinition} from './outcome-definition';
import type {OutcomeEvaluation} from '../outcome-contracts';

export function outcome_public_obligations(definition:OutcomeDefinition):string[]{
  return definition.catalogs.no_public_obligations?[]:definition.catalogs.actors.flatMap(a => Array.from({length:a.people}, (_,i) => a.id+'-person-'+(i+1)));
}

// Credit is based on existing verified completion and actual HQ delivery, never
// on an artifact merely present in the private field world.
export function evaluate_outcome(state:OutcomeState, at:number, definition:OutcomeDefinition, fallback:OutcomeEvaluation['result']):OutcomeEvaluation {
  const cutoff = state.termination?.scoring_cutoff ?? Math.min(at, definition.profile.parameters.deadline);
  const known = state.verification_deliveries.filter(d => d.received <= at).map(d => state.verification_reports.find(r => r.ref.id === d.report_ref.id)!);
  const qualified_artifacts = [...new Set(known.filter(r => r.observed.value <= cutoff).flatMap(r => r.artifacts.filter(a => a.status === 'verified').map(a => a.artifact_ref.id)))].sort();
  const confirmed_people = [...new Set(known.flatMap(r => r.personnel.filter(p => p.status === 'verified').map(p => p.person_id)))].sort();
  const required = outcome_public_obligations(definition);
  const acquisitions=state.prefix.field.deliveries.filter(d=>d.received<=at).map(d=>state.prefix.field.reports.find(r=>r.ref.id===d.report_ref.id)!).filter(r=>r.artifact!==null);
  const receptions=state.reception_deliveries.filter(d=>d.target==='HQ'&&d.received<=at).map(d=>state.reception_reports.find(r=>r.ref.id===d.report_ref.id)!).filter(r=>r.phase==='completed');
  const returns=state.return_deliveries.filter(d=>d.target==='HQ'&&d.received<=at).map(d=>state.return_reports.find(r=>r.ref.id===d.report_ref.id)!).filter(r=>r.phase==='completed');
  const artifactIds=[...new Set([...acquisitions.map(r=>r.artifact!.ref.id),...receptions.flatMap(r=>r.artifact_refs.map(a=>a.id)),...known.flatMap(r=>r.artifacts.map(a=>a.artifact_ref.id))])].sort();
  const artifact_status=artifactIds.map(id=>{
    const acquired_at=acquisitions.find(r=>r.artifact?.ref.id===id)?.artifact?.created_at??null;
    const delivered_at=receptions.find(r=>r.artifact_refs.some(a=>a.id===id))?.observed.value??null;
    const verification=state.verification_deliveries.filter(d=>d.received<=at).map(delivery=>({delivery,report:state.verification_reports.find(r=>r.ref.id===delivery.report_ref.id)!})).find(r=>r.report.artifacts.some(a=>a.artifact_ref.id===id&&a.status==='verified'));
    const verified_at=verification?.report.observed.value??null,confirmed_at=verification?.delivery.received??null;
    return {id,acquired_at,delivered_at,verified_at,confirmed_at,qualified:qualified_artifacts.includes(id),post_cutoff_effect:[acquired_at,delivered_at,verified_at].some(time=>time!==null&&time>cutoff)};
  });
  const personnel_status=required.map(id=>{
    const actor=id.startsWith('R-')?'R':'W',returned_at=returns.find(r=>r.actor===actor)?.observed.value??null;
    const received_at=receptions.find(r=>r.people_ids.includes(id))?.observed.value??null;
    const verification=state.verification_deliveries.filter(d=>d.received<=at).map(delivery=>({delivery,report:state.verification_reports.find(r=>r.ref.id===delivery.report_ref.id)!})).find(r=>r.report.personnel.some(p=>p.person_id===id&&p.status==='verified'));
    return {id,returned_at,received_at,verified_at:verification?.report.observed.value??null,confirmed_at:verification?.delivery.received??null};
  });
  const complete = qualified_artifacts.length === 2 && required.every(id => confirmed_people.includes(id));
  return {result: fallback === 'success' && complete ? 'success' : qualified_artifacts.length > 0 ? 'partial' : fallback,
    finished_at:at, scoring_cutoff:cutoff, qualified_artifacts, confirmed_people, missing_people:required.filter(id => !confirmed_people.includes(id)),artifact_status,personnel_status};
}

export function finish_outcome(state:OutcomeState, evaluation:OutcomeEvaluation):void {
  state.outcome = evaluation;
  state.finished = true;
  state.ended = true;
  state.paused = true;
  state.prefix.ended = true;
  state.prefix.paused = true;
}
