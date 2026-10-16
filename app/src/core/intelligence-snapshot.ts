import {GameError} from '../contracts';
import {valid_id} from '../protocol';
import {state_hash,canonical} from './snapshot';
import {intelligence_definition_for_package,load_intelligence_definition} from './intelligence-definition';
import {initial_intelligence_state,type IntelligenceState} from './intelligence-state';
import {apply_intelligence_control} from './intelligence-game';
import {record,valid_envelope} from '../protocol';
export async function validate_intelligence_state(input:Record<string,unknown>,owned:readonly import('./intelligence-definition').IntelligenceDefinition[]=[]):Promise<IntelligenceState>{
  if(!valid_id(input.run_id)||!['command','research'].includes(String(input.mode))||!Number.isSafeInteger(input.origin_generation)||Number(input.origin_generation)<1||!(input.source_run===null||valid_id(input.source_run))||!record(input.rng)||!valid_id(input.rng.origin)||input.source_run===null&&input.rng.origin!==input.run_id)throw new GameError('INVALID_SAVE');
  const definition=await load_intelligence_definition(intelligence_definition_for_package(input.definition_hash,owned),owned);
  const value=input as unknown as IntelligenceState;let expected=initial_intelligence_state(definition,value.run_id,value.mode,value.origin_generation,value.source_run,value.rng?.origin);
  if(!Array.isArray(input.inputs))throw new GameError('INVALID_SAVE');const operations=new Set<string>();
  for(const entry of input.inputs){
    if(!record(entry)||!valid_envelope(entry.envelope,definition.profile.parameters.deadline+definition.profile.parameters.receipt_grace,true)||operations.has(entry.envelope.operation_id))throw new GameError('INVALID_SAVE');
    operations.add(entry.envelope.operation_id);expected=apply_intelligence_control(expected,entry.envelope,entry.clock_to as number|undefined,owned);
    if(JSON.stringify(canonical(expected.inputs.at(-1)))!==JSON.stringify(canonical(entry)))throw new GameError('INVALID_SAVE');
  }
  const {integrity,...body}=value;
  if(integrity!==await state_hash(value)||JSON.stringify(canonical(body))!==JSON.stringify(canonical(expected)))throw new GameError('INVALID_SAVE');
  return value;
}
