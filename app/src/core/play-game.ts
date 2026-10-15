import {GameError,type Envelope} from '../contracts';
import type {PlayState} from './play-state';
import {play_definition_for_package,type PlayDefinition} from './scenario';
import {project_play_view} from './play-knowledge';
import {preview_corridor} from './play-preview';
import {canonical} from './snapshot';
import {advance_play_movement} from './play-movement';

export async function validate_play_task(state:PlayState,envelope:Envelope,registered:readonly PlayDefinition[]=[]):Promise<void>{
  if(envelope.intent.kind!=='issue')return;
  const plan=envelope.intent.plan;
  if(!('kind' in plan)||plan.kind!=='corridor_move')throw new GameError('INVALID_INPUT');
  const {actor,map_id,map_version,crs_id,geometry_version,path}=plan;
  const expected=await preview_corridor(project_play_view(state,registered),plan.editing_seq,{actor,map_id,map_version,crs_id,geometry_version,path});
  if(JSON.stringify(canonical(expected))!==JSON.stringify(canonical(plan)))throw new GameError('STALE_PLAN');
  if(!expected.allowed)throw new GameError('AUTHORITY_EXPIRED');
}

export function apply_play_control(state:PlayState,envelope:Envelope,clock_to?:number,registered:readonly PlayDefinition[]=[]):PlayState{
  const candidate=structuredClone(state),intent=envelope.intent,definition=play_definition_for_package(state.definition_hash,registered),p=definition.profile.parameters;
  const advance=(to:number)=>{
    if(!Number.isSafeInteger(to)||to<state.sim_time||to>p.deadline+p.receipt_grace)throw new GameError('INVALID_INPUT');
    advance_play_movement(candidate,to,definition);
    const confirmed=['arrived','blocked','cutoff_confirmed'].includes(candidate.status);
    if(to>=p.deadline&&!confirmed)candidate.status='window_ended_unconfirmed';
    if(to>=p.deadline+p.receipt_grace){if(!confirmed)candidate.status='window_sealed_unconfirmed';candidate.ended=true;candidate.paused=true;}
  };
  if(clock_to!==undefined){
    if(state.mode!=='command'||state.paused||!['pause','continue','rate','save'].includes(intent.kind))throw new GameError('INVALID_INPUT');
    advance(clock_to);
  }
  if(intent.kind==='issue'){
    if(!('kind' in intent.plan)||intent.plan.kind!=='corridor_move')throw new GameError('INVALID_INPUT');
    if(candidate.requests.some(request=>request.command_id===intent.command_id))throw new GameError('INVALID_INPUT');
    candidate.generation++;
    candidate.requests.push({command_id:intent.command_id,issued:state.sim_time,plan:structuredClone(intent.plan),generation:candidate.generation,status:'registered',sent_at:null,accepted_at:null,...(intent.reason===undefined?{}:{reason:intent.reason})});
    candidate.queue.push({id:`${intent.command_id}:send_command`,kind:'send_command',command_id:intent.command_id,at:state.sim_time,phase:5,generation:candidate.generation});
    candidate.status='queued';candidate.log.push({id:`${intent.command_id}:issued`,at:state.sim_time,kind:'issued',text:'移动任务已签发登记，尚未发送。',evidence:intent.command_id,sender:'总部指挥席'});
  }else if(intent.kind==='save'){/* The atomic committed state is the save point. */}
  else if(intent.kind==='pause')candidate.paused=true;
  else if(intent.kind==='restore'){
    if(intent.snapshot_revision!==state.revision)throw new GameError('STALE_REVISION');
    candidate.paused=true;
  }else if(intent.kind==='continue'){
    if(state.mode!=='command')throw new GameError('MODE_LOCKED');
    if(candidate.ended)throw new GameError('RUN_ENDED');
    candidate.paused=false;
  }else if(intent.kind==='rate')candidate.rate=intent.rate;
  else if(intent.kind==='mode')throw new GameError('MODE_LOCKED');
  else if(intent.kind==='advance'||intent.kind==='tick'){
    if(state.mode!==(intent.kind==='advance'?'research':'command'))throw new GameError('MODE_LOCKED');
    if(intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
    if(state.ended)throw new GameError('RUN_ENDED');
    if(intent.to<state.sim_time)throw new GameError('TIME_REVERSED');
    if(intent.to===state.sim_time)throw new GameError('TIME_NOT_ADVANCED');
    advance(intent.to);
  }else throw new GameError('INVALID_INPUT');
  candidate.revision=state.revision+1;
  candidate.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:candidate.sim_time,revision:candidate.revision,...(clock_to===undefined?{}:{clock_to})});
  return candidate;
}

export function replay_play_state(initial:PlayState,inputs:PlayState['inputs'],to:number,registered:readonly PlayDefinition[]=[]):PlayState{
  let state=structuredClone(initial);
  for(const input of inputs){
    if(input.at>to)break;
    const intent=input.envelope.intent;
    if(input.clock_to!==undefined&&input.clock_to>to)break;
    if((intent.kind==='advance'||intent.kind==='tick')&&intent.to>to)break;
    state=apply_play_control(state,input.envelope,input.clock_to,registered);
  }
  if(state.sim_time<to){
    const next=apply_play_control({...state,mode:'research'},{run_id:state.run_id,operation_id:'historical-time',expected_revision:state.revision,intent:{kind:'advance',to}},undefined,registered);
    // Keep all due-event effects, but no synthetic administrative commit/input.
    state={...next,revision:state.revision,inputs:state.inputs,mode:state.mode};delete state.integrity;
  }
  return state;
}
