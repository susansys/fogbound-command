import {GameError} from '../contracts';
import {record,valid_id} from '../protocol';
import {canonical,state_hash} from './snapshot';
import {load_mission_definition,mission_definition_for_package} from './mission-definition';
import {initial_mission_state,type MissionState} from './mission-state';
import {apply_save_plan,apply_mission_control} from './mission-game';
import {parse_save_plan} from '../mission-protocol';
import {valid_envelope} from '../protocol';
export async function validate_mission_state(input:Record<string,unknown>):Promise<MissionState>{
  if(input.schema!==8||input.scenario_kind!=='play_mission'||input.contract!=='0.5.1'||!valid_id(input.run_id)||!['command','research'].includes(String(input.mode))||!Number.isSafeInteger(input.origin_generation)||Number(input.origin_generation)<1||!record(input.rng)||!valid_id(input.rng.origin)||!(input.source_run===null||valid_id(input.source_run))||!Array.isArray(input.inputs))throw new GameError('INVALID_SAVE');
  const definition=await load_mission_definition(mission_definition_for_package(input.definition_hash));
  let expected=initial_mission_state(definition,input.run_id,input.mode as 'command'|'research',Number(input.origin_generation),input.source_run as string|null,input.rng.origin);
  if(expected.source_run===null&&expected.rng.origin!==expected.run_id)throw new GameError('INVALID_SAVE');
  const value=input as unknown as MissionState;
  const operations=new Set<string>();
  for(const entry of input.inputs){
    if(!record(entry)||!record(entry.envelope))throw new GameError('INVALID_SAVE');
    let envelope:import('../contracts').Envelope|import('../mission-contracts').SavePlanEnvelope;
    if(record(entry.envelope.intent)&&entry.envelope.intent.kind==='save_plan')envelope=parse_save_plan(entry.envelope);
    else{if(!valid_envelope(entry.envelope,910000,true))throw new GameError('INVALID_SAVE');envelope=entry.envelope;}
    if(operations.has(envelope.operation_id))throw new GameError('INVALID_SAVE');operations.add(envelope.operation_id);
    expected=envelope.intent.kind==='save_plan'?await apply_save_plan(expected,parse_save_plan(envelope)):apply_mission_control(expected,envelope as import('../contracts').Envelope,entry.clock_to as number|undefined);
    if(JSON.stringify(canonical(expected.inputs.at(-1)))!==JSON.stringify(canonical(entry)))throw new GameError('INVALID_SAVE');
  }
  const {integrity,...body}=value;
  if(integrity!==await state_hash(value)||JSON.stringify(canonical(body))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_SAVE');
  return value;
}
