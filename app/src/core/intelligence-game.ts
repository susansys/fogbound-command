import type {ConflictingFacilityState} from './conflicting-action-state';
import {planned_intelligence_loadout} from './intelligence-accounting';
import {issue_intelligence_activity,advance_field_work} from './intelligence-execution';
import type {IntelligenceActivityRequest} from '../intelligence-contracts';
import type {Envelope} from '../contracts';
import type {SaveIntelligencePlan,IntelligencePreparationRequest} from '../intelligence-contracts';
import {parse_intelligence_plan,parse_intelligence_source_request,parse_intelligence_preparation,parse_intelligence_activity,type IntelligenceSourceRequest} from '../intelligence-protocol';
import {advance_processing_work,request_source_work,request_preparation_work} from './intelligence-work';
import {GameError} from '../contracts';
import {valid_envelope} from '../protocol';
import type {IntelligenceState} from './intelligence-state';
import {intelligence_definition_for_package} from './intelligence-definition';
import {advance_intelligence_reports} from './intelligence-reports';
import {advance_intelligence_source} from './intelligence-source';
export function apply_intelligence_control(state:IntelligenceState,envelope:Envelope|SaveIntelligencePlan|IntelligenceSourceRequest|IntelligencePreparationRequest|IntelligenceActivityRequest,clock_to?:number,owned:readonly import('./intelligence-definition').IntelligenceDefinition[]=[],facility?:ConflictingFacilityState):IntelligenceState{
  const definition=intelligence_definition_for_package(state.definition_hash,owned),p=definition.profile.parameters,bound=p.deadline+p.receipt_grace;
  if(envelope.intent.kind==='issue_activity')parse_intelligence_activity(envelope);
  else if(envelope.intent.kind==='save_plan')parse_intelligence_plan(envelope);
  else if(envelope.intent.kind==='request_source_validation')parse_intelligence_source_request(envelope);
  else if(envelope.intent.kind==='request_preparation')parse_intelligence_preparation(envelope);
  else if(!valid_envelope(envelope,bound,true))throw new GameError('INVALID_REQUEST');
  if(envelope.run_id!==state.run_id)throw new GameError('INVALID_REQUEST');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  const candidate=structuredClone(state),intent=envelope.intent;
  const advance=(to:number)=>{
    if(!Number.isSafeInteger(to)||to<state.sim_time||to>bound)throw new GameError('INVALID_INPUT');
    advance_intelligence_source(candidate,to,definition);advance_intelligence_reports(candidate,to,definition);advance_processing_work(candidate,to,definition);advance_field_work(candidate,to,definition,{facility});candidate.sim_time=to;candidate.ended=to===bound;if(candidate.ended)candidate.paused=true;
  };
  if(clock_to!==undefined){if(state.mode!=='command'||state.paused)throw new GameError('CLOCK_PAUSED');advance(clock_to);}
  if(intent.kind==='tick'||intent.kind==='advance'){
    if(state.mode!==(intent.kind==='tick'?'command':'research'))throw new GameError('MODE_LOCKED');
    if(intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
    if(state.ended)throw new GameError('RUN_ENDED');if(intent.to<=state.sim_time)throw new GameError('TIME_NOT_ADVANCED');advance(intent.to);
  }else if(intent.kind==='issue_activity'){
    issue_intelligence_activity(candidate,envelope as IntelligenceActivityRequest,definition);
  }else if(intent.kind==='request_source_validation'){
    request_source_work(candidate,envelope as IntelligenceSourceRequest,definition);
  }else if(intent.kind==='request_preparation'){
    request_preparation_work(candidate,envelope as IntelligencePreparationRequest,definition);
  }else if(intent.kind==='save_plan'){
    if(state.ended)throw new GameError('RUN_ENDED');
    const base=intent.base_plan_ref,previous=state.plan?.ref;
    if(base?.run_id!==previous?.run_id||base?.kind!==previous?.kind||base?.id!==previous?.id||base?.version!==previous?.version)throw new GameError('STALE_PLAN');
    const version=(state.plan?.ref.version??0)+1;if(version>p.plan_version_budget)throw new GameError('CONSTRAINT_DENIED');
    candidate.plan={ref:{run_id:state.run_id,kind:'plan',id:'P1',version},purpose:intent.draft.purpose,repair_packs:intent.draft.repair_packs,...(intent.draft.loadout?{loadout:planned_intelligence_loadout(intent.draft.loadout,definition)}:{})};
  }else if(intent.kind==='restore'){
    if(intent.snapshot_revision!==state.revision)throw new GameError('STALE_REVISION');candidate.paused=true;
  }else if(intent.kind==='pause')candidate.paused=true;
  else if(intent.kind==='continue'){if(state.mode!=='command')throw new GameError('MODE_LOCKED');if(candidate.ended)throw new GameError('RUN_ENDED');candidate.paused=false;}
  else if(intent.kind==='rate')candidate.rate=intent.rate;
  else if(intent.kind==='mode')throw new GameError('MODE_LOCKED');
  else if(intent.kind!=='save')throw new GameError('INVALID_REQUEST');
  candidate.revision++;candidate.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:candidate.sim_time,revision:candidate.revision,...(clock_to===undefined?{}:{clock_to})});return candidate;
}
