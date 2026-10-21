import {GameError} from '../contracts';
import {record,fields,valid_id} from '../protocol';
import {canonical,json_data,state_hash} from './snapshot';
import {integrated_field_definition} from './integrated-field-definition';
import type {IntegratedFieldState} from './integrated-field-state';
import {initial_integrated_field_state} from './integrated-field-state';
import {apply_integrated_field_control} from './integrated-field-engine';
export async function validate_integrated_field_state(value:unknown):Promise<IntegratedFieldState>{
  if(!record(value)||!json_data(value)||!fields(value,['schema','contract','scenario_kind','run_id','revision','sim_time','mode','rate','paused','finished','ended','status','source_run','definition_hash','hashes','definition','rng','generation','origin_generation','phase','inputs','integrity','guidance_loss_at','hq_sender_free_at','actors','position_reports','pending_moves','work','environment']))throw new GameError('INVALID_SAVE');
  if(!record(value.environment)||!record(value.work)||(value.work.initial_spares!==0&&value.work.initial_spares!==1))throw new GameError('INVALID_SAVE');
  const state=value as unknown as IntegratedFieldState,definition=await integrated_field_definition();
  if(state.schema!==13||state.contract!=='0.5.1'||state.scenario_kind!=='play_integrated_field'||!valid_id(state.run_id)||!['command','research'].includes(state.mode)||state.phase!=='committed'||!Number.isSafeInteger(state.origin_generation)||state.origin_generation<1||state.source_run!==null&&!valid_id(state.source_run)||!Array.isArray(state.inputs)||!valid_id(state.rng?.origin)||JSON.stringify(canonical(state.definition))!==JSON.stringify(canonical(definition))||state.definition_hash!==definition.definition_hash||JSON.stringify(canonical(state.hashes))!==JSON.stringify(canonical(definition.hashes))||typeof state.integrity!=='string'||await state_hash(state)!==state.integrity)throw new GameError('INVALID_SAVE');
  let replay=initial_integrated_field_state(definition,state.run_id,state.mode,state.origin_generation,state.source_run,state.rng.origin,state.guidance_loss_at,state.work.initial_spares,state.environment.profile,{protection_loss:state.work.protection_loss,repeat_terminal_delivery:state.work.repeat_terminal_delivery});
  for(const input of state.inputs){
    if(!record(input)||!fields(input,['envelope','at','revision',...(input.clock_to===undefined?[]:['clock_to'])]))throw new GameError('INVALID_SAVE');
    replay=apply_integrated_field_control(replay,input.envelope,input.clock_to);
  }
  const {integrity,...body}=state,{integrity:replayIntegrity,...expected}=replay;
  if(JSON.stringify(canonical(body))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_SAVE');
  return state;
}
