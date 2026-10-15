import type {SavePlanEnvelope} from '../mission-contracts';
import type {MissionState} from './mission-state';
import {preview_mission} from './mission-preview';
import {GameError} from '../contracts';
import {parse_save_plan} from '../mission-protocol';
import {canonical} from './snapshot';
import {valid_envelope} from '../protocol';
import type {Envelope} from '../contracts';
import {mission_definition_for_package} from './mission-definition';
import type {MissionDefinition} from './mission-definition';
import {deliver_mission_position_records} from './mission-evidence';
export async function apply_save_plan(state:MissionState,envelope:SavePlanEnvelope,owned:readonly MissionDefinition[]=[]):Promise<MissionState>{
  envelope=parse_save_plan(envelope);
  if(envelope.run_id!==state.run_id||envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  if(envelope.intent.expected_object_revision!==(state.mission?.object_revision??0))throw new GameError('OBJECT_VERSION_CONFLICT');
  if(JSON.stringify(canonical(envelope.intent.base_plan_ref))!==JSON.stringify(canonical(state.mission?.current_plan_ref??null)))throw new GameError('OBJECT_VERSION_CONFLICT');
  if(state.plans.length>=mission_definition_for_package(state.definition_hash,owned).profile.parameters.plan_version_budget)throw new GameError('INVALID_REQUEST','mission_draft.plan_versions');
  const preview=await preview_mission(state,0,envelope.intent.draft,owned),candidate=structuredClone(state);
  const version=candidate.plans.length+1,plan_id=envelope.intent.draft.plan_id;
  candidate.plans.push({plan_id,version,draft:structuredClone(envelope.intent.draft),preview});
  candidate.mission={id:'M1',object_revision:(candidate.mission?.object_revision??0)+1,status:'draft',current_plan_ref:{run_id:state.run_id,kind:'plan',id:plan_id,version},support_refs:[]};
  candidate.revision++;
  candidate.inputs.push({envelope:structuredClone(envelope),at:state.sim_time,revision:candidate.revision});
  return candidate;
}
export function apply_mission_control(state:MissionState,envelope:Envelope,clock_to?:number,owned:readonly MissionDefinition[]=[]):MissionState{
  if(!valid_envelope(envelope,910000,true)||envelope.run_id!==state.run_id)throw new GameError('INVALID_REQUEST');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  const candidate=structuredClone(state),intent=envelope.intent;
  const move_clock=(to:number)=>{
    if(!Number.isSafeInteger(to)||to<state.sim_time||to>910000)throw new GameError('INVALID_INPUT');
    candidate.sim_time=to;candidate.ended=to===910000;
    deliver_mission_position_records(candidate,mission_definition_for_package(state.definition_hash,owned));
  };
  if(clock_to!==undefined){if(state.mode!=='command'||state.paused)throw new GameError('CLOCK_PAUSED');move_clock(clock_to);}
  if(intent.kind==='tick'||intent.kind==='advance'){
    if(state.mode!==(intent.kind==='tick'?'command':'research'))throw new GameError('MODE_LOCKED');
    if(intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
    if(intent.to<=state.sim_time)throw new GameError('TIME_NOT_ADVANCED');
    if(state.ended)throw new GameError('RUN_ENDED');move_clock(intent.to);
  }else if(intent.kind==='restore'){
    if(intent.snapshot_revision!==state.revision)throw new GameError('STALE_REVISION');candidate.paused=true;
  }else if(intent.kind==='pause')candidate.paused=true;
  else if(intent.kind==='continue'){
    if(state.mode!=='command')throw new GameError('MODE_LOCKED');if(state.ended)throw new GameError('RUN_ENDED');candidate.paused=false;
  }else if(intent.kind==='rate')candidate.rate=intent.rate;
  else if(intent.kind==='mode')throw new GameError('MODE_LOCKED');
  else if(intent.kind!=='save')throw new GameError('INVALID_REQUEST');
  candidate.revision++;
  candidate.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:candidate.sim_time,revision:candidate.revision,...(clock_to===undefined?{}:{clock_to})});
  return candidate;
}
