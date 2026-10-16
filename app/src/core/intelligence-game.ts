import type {Envelope} from '../contracts';
import {GameError} from '../contracts';
import {valid_envelope} from '../protocol';
import type {IntelligenceState} from './intelligence-state';
import {intelligence_definition_for_package} from './intelligence-definition';
import {advance_intelligence_reports} from './intelligence-reports';
import {advance_intelligence_source} from './intelligence-source';
export function apply_intelligence_control(state:IntelligenceState,envelope:Envelope,clock_to?:number,owned:readonly import('./intelligence-definition').IntelligenceDefinition[]=[]):IntelligenceState{
  const definition=intelligence_definition_for_package(state.definition_hash,owned),p=definition.profile.parameters,bound=p.deadline+p.receipt_grace;
  if(!valid_envelope(envelope,bound,true)||envelope.run_id!==state.run_id)throw new GameError('INVALID_REQUEST');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  const candidate=structuredClone(state),intent=envelope.intent;
  const advance=(to:number)=>{
    if(!Number.isSafeInteger(to)||to<state.sim_time||to>bound)throw new GameError('INVALID_INPUT');
    advance_intelligence_source(candidate,to,definition);advance_intelligence_reports(candidate,to,definition);candidate.sim_time=to;candidate.ended=to===bound;if(candidate.ended)candidate.paused=true;
  };
  if(clock_to!==undefined){if(state.mode!=='command'||state.paused)throw new GameError('CLOCK_PAUSED');advance(clock_to);}
  if(intent.kind==='tick'||intent.kind==='advance'){
    if(state.mode!==(intent.kind==='tick'?'command':'research'))throw new GameError('MODE_LOCKED');
    if(intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
    if(state.ended)throw new GameError('RUN_ENDED');if(intent.to<=state.sim_time)throw new GameError('TIME_NOT_ADVANCED');advance(intent.to);
  }else if(intent.kind==='restore'){
    if(intent.snapshot_revision!==state.revision)throw new GameError('STALE_REVISION');candidate.paused=true;
  }else if(intent.kind==='pause')candidate.paused=true;
  else if(intent.kind==='continue'){if(state.mode!=='command')throw new GameError('MODE_LOCKED');if(candidate.ended)throw new GameError('RUN_ENDED');candidate.paused=false;}
  else if(intent.kind==='rate')candidate.rate=intent.rate;
  else if(intent.kind==='mode')throw new GameError('MODE_LOCKED');
  else if(intent.kind!=='save')throw new GameError('INVALID_REQUEST');
  candidate.revision++;candidate.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:candidate.sim_time,revision:candidate.revision,...(clock_to===undefined?{}:{clock_to})});return candidate;
}
