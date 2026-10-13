import {is_record_plan} from '../contracts';
import type {State} from './state';
import {advance_move,register_move,register_record} from './movement';
import {GameError} from '../contracts';
import {register_prestart} from './prestart-move';
export function replay_state(initial:State,inputs:State['inputs'],to:number):State{
  return replay_inputs(initial,inputs,to);
}
export function replay_committed_state(initial:State,inputs:State['inputs']):State{
  return replay_inputs(initial,inputs,null);
}
function replay_inputs(initial:State,inputs:State['inputs'],to:number|null):State{
  const state=structuredClone(initial);
  for(const input of inputs){
    if(to!==null&&input.at>to)break;
    const intent=input.envelope.intent;
    const originalTime=state.sim_time,originalPaused=state.paused;
    if(state.schema===6){
      if(input.clock_to!==undefined&&(state.mode!=='command'||originalPaused||input.clock_to<originalTime||input.clock_to>610000||!['pause','continue','rate','save'].includes(intent.kind)))throw new GameError('INVALID_SAVE');
      if(intent.kind==='tick'&&(state.mode!=='command'||originalPaused)||intent.kind==='advance'&&state.mode!=='research')throw new GameError('INVALID_SAVE');
      if((intent.kind==='tick'||intent.kind==='advance')&&(state.ended||intent.to<=originalTime))throw new GameError('INVALID_SAVE');
      if(intent.kind==='continue'&&(state.mode!=='command'||state.ended))throw new GameError('INVALID_SAVE');
      if(intent.kind==='restore'&&intent.snapshot_revision!==input.envelope.expected_revision)throw new GameError('INVALID_SAVE');
      if(intent.kind==='issue'&&(originalTime<state.public_rules.authority.from||originalTime>=state.public_rules.authority.to))throw new GameError('INVALID_SAVE');
    }
    if(state.schema===5){
      if(input.clock_to!==undefined&&(state.mode!=='command'||originalPaused||input.clock_to<originalTime||input.clock_to>610000))throw new GameError('INVALID_SAVE');
      if(input.clock_to!==undefined&&!['pause','continue','rate','save'].includes(intent.kind))throw new GameError('INVALID_SAVE');
      if(intent.kind==='tick'&&(state.mode!=='command'||originalPaused)||intent.kind==='advance'&&state.mode!=='research')throw new GameError('INVALID_SAVE');
      if((intent.kind==='tick'||intent.kind==='advance')&&(state.ended||intent.to<=originalTime))throw new GameError('INVALID_SAVE');
      if(intent.kind==='continue'&&(state.mode!=='command'||state.ended))throw new GameError('INVALID_SAVE');
      if(intent.kind==='restore'&&intent.snapshot_revision!==input.envelope.expected_revision)throw new GameError('INVALID_SAVE');
      if(intent.kind==='issue'&&(state.order||originalTime<state.public_rules.authority.from||originalTime>=state.public_rules.authority.to))throw new GameError('INVALID_SAVE');
      if(intent.kind==='issue'&&(!(is_record_plan(intent.plan))||intent.plan.run_id!==state.run_id||intent.plan.revision!==input.envelope.expected_revision||!intent.plan.allowed||intent.plan.gap!==''||intent.plan.definition_hash!==state.definition_hash||intent.plan.report_id!==state.known.report.id||intent.plan.delivery_id!==state.known.delivery.id))throw new GameError('INVALID_SAVE');
    }
    if(input.clock_to!==undefined){if(input.clock_to>state.sim_time&&!state.ended)advance_move(state,to===null?input.clock_to:Math.min(input.clock_to,to));if(to!==null&&input.clock_to>to)break;}
    if(state.schema>=5&&input.at!==state.sim_time)throw new GameError('INVALID_SAVE');
    if(intent.kind==='advance'||intent.kind==='tick'){
      advance_move(state,to===null?intent.to:Math.min(intent.to,to));if(to!==null&&intent.to>to)break;
    }else if(intent.kind==='issue'){
      if(state.schema===6)register_prestart(state,intent);
      else if(is_record_plan(intent.plan))register_record(state,intent);
      else register_move(state,intent);
    }else if(intent.kind==='pause'||intent.kind==='restore')state.paused=true;
    else if(intent.kind==='continue')state.paused=false;
    else if(intent.kind==='rate')state.rate=intent.rate;
    else if(intent.kind!=='save')throw new GameError('INVALID_SAVE');
    state.revision=input.revision;state.inputs.push(structuredClone(input));
  }
  if(to!==null&&state.sim_time<to)advance_move(state,to);
  return state;
}
