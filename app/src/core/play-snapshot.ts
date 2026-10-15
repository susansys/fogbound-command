import {GameError} from '../contracts';
import {valid_envelope,valid_id,record,fields} from '../protocol';
import type {PlayState} from './play-state';
import {initial_play_state} from './play-state';
import {apply_play_control,validate_play_task} from './play-game';
import {play_definition_for_package,load_definition,hash,type PlayDefinition} from './scenario';
import {canonical} from './snapshot';

export async function validate_play_state(input:Record<string,unknown>,registered:readonly PlayDefinition[]=[]):Promise<PlayState>{
  function fail():never{throw new GameError('INVALID_SAVE');}
  if(input.schema!==7||input.scenario_kind!=='play_corridor'||input.contract!=='0.5.1'||input.phase!=='committed'||!valid_id(input.run_id)||!['command','research'].includes(String(input.mode))||!Number.isSafeInteger(input.origin_generation)||Number(input.origin_generation)<1||!record(input.rng)||!valid_id(input.rng.origin)||!(input.source_run===null||valid_id(input.source_run))||!Array.isArray(input.inputs)||typeof input.integrity!=='string')fail();
  const definition=play_definition_for_package(input.definition_hash,registered);await load_definition(definition,registered);
  const {integrity,...body}=input;if(await hash(canonical(body))!==integrity)fail();
  let expected=initial_play_state(definition,input.run_id,input.mode as 'command'|'research',Number(input.origin_generation),input.source_run as string|null,input.rng.origin);
  if(expected.source_run===null&&expected.rng.origin!==expected.run_id)fail();
  const operations=new Set<string>();
  for(const entry of input.inputs){
    if(!record(entry)||!fields(entry,['envelope','at','revision',...(entry.clock_to===undefined?[]:['clock_to'])])||!valid_envelope(entry.envelope,definition.profile.parameters.deadline+definition.profile.parameters.receipt_grace,true)||entry.envelope.run_id!==expected.run_id||entry.envelope.expected_revision!==expected.revision||entry.revision!==expected.revision+1||operations.has(entry.envelope.operation_id)||entry.clock_to!==undefined&&typeof entry.clock_to!=='number')fail();
    operations.add(entry.envelope.operation_id);
    await validate_play_task(expected,entry.envelope,registered);
    expected=apply_play_control(expected,entry.envelope,entry.clock_to as number|undefined,registered);
    if(JSON.stringify(canonical(expected.inputs[expected.inputs.length-1]))!==JSON.stringify(canonical(entry)))fail();
  }
  if(JSON.stringify(canonical(expected))!==JSON.stringify(canonical(body)))fail();
  return input as unknown as PlayState;
}
