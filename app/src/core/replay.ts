import type {State} from './state';
import {advance_move,register_move,register_record} from './movement';
import {GameError} from '../contracts';
export function replay_state(initial:State,inputs:State['inputs'],to:number):State{
  const state=structuredClone(initial);
  for(const input of inputs){
    if(input.at>to)break;
    const intent=input.envelope.intent;
    const originalTime=state.sim_time,originalPaused=state.paused;
    if(state.schema===5){
      if(input.clock_to!==undefined&&(state.mode!=='command'||originalPaused||input.clock_to<originalTime))throw new GameError('INVALID_SAVE');
      if(input.clock_to!==undefined&&!['pause','continue','rate','save'].includes(intent.kind))throw new GameError('INVALID_SAVE');
      if(intent.kind==='tick'&&(state.mode!=='command'||originalPaused)||intent.kind==='advance'&&state.mode!=='research')throw new GameError('INVALID_SAVE');
      if((intent.kind==='tick'||intent.kind==='advance')&&(state.ended||intent.to<=originalTime))throw new GameError('INVALID_SAVE');
      if(intent.kind==='continue'&&(state.mode!=='command'||state.ended))throw new GameError('INVALID_SAVE');
      if(intent.kind==='restore'&&intent.snapshot_revision!==input.envelope.expected_revision)throw new GameError('INVALID_SAVE');
      if(intent.kind==='issue'&&(state.order||originalTime<state.public_rules.authority.from||originalTime>=state.public_rules.authority.to))throw new GameError('INVALID_SAVE');
      if(intent.kind==='issue'&&(!('kind' in intent.plan)||intent.plan.run_id!==state.run_id||intent.plan.revision!==input.envelope.expected_revision||!intent.plan.allowed||intent.plan.gap!==''||intent.plan.definition_hash!==state.definition_hash||intent.plan.report_id!==state.known.report.id||intent.plan.delivery_id!==state.known.delivery.id))throw new GameError('INVALID_SAVE');
    }
    if(input.clock_to!==undefined){advance_move(state,Math.min(input.clock_to,to));if(input.clock_to>to)break;}
    if(state.schema===5&&input.at!==state.sim_time)throw new GameError('INVALID_SAVE');
    if(intent.kind==='advance'||intent.kind==='tick'){
      advance_move(state,Math.min(intent.to,to));if(intent.to>to)break;
    }else if(intent.kind==='issue'){
      if('kind' in intent.plan)register_record(state,intent);
      else register_move(state,intent);
    }else if(intent.kind==='pause'||intent.kind==='restore')state.paused=true;
    else if(intent.kind==='continue')state.paused=false;
    else if(intent.kind==='rate')state.rate=intent.rate;
    else if(intent.kind!=='save')throw new GameError('INVALID_SAVE');
    state.revision=input.revision;state.inputs.push(structuredClone(input));
  }
  if(state.sim_time<to)advance_move(state,to);
  return state;
}
