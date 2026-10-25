import {GameError} from '../contracts';
import {record,fields,valid_id} from '../protocol';
import {canonical,json_data,state_hash} from './snapshot';
import {load_knowledge_collection_definition} from './knowledge-collection-definition';
import {initial_knowledge_collection_state,type KnowledgeCollectionState} from './knowledge-collection-state';
import {valid_knowledge_collection_envelope} from '../knowledge-collection-protocol';
import {apply_knowledge_collection_control} from './knowledge-collection-engine';
export async function validate_knowledge_collection_state(value:unknown):Promise<KnowledgeCollectionState>{
  try{
    if(!record(value)||!json_data(value)||!valid_id(value.run_id)||!['command','research'].includes(String(value.mode))||!Number.isSafeInteger(value.generation)||Number(value.generation)<1||!record(value.rng)||!valid_id(value.rng.origin)||value.source_run!==null&&!valid_id(value.source_run))throw new Error('Invalid collection state');
    const definition=await load_knowledge_collection_definition(value.definition);
    if(!record(value.initial_conditions)||!fields(value.initial_conditions,['surface','gate_profile'])||value.initial_conditions.surface!=='default'&&value.initial_conditions.surface!=='empty'||typeof value.initial_conditions.gate_profile!=='string'||!Object.hasOwn(definition.local_gate_profiles,value.initial_conditions.gate_profile)||value.source_run===null&&value.rng.origin!==value.run_id)throw new Error('Invalid collection initial conditions');
    let expected=initial_knowledge_collection_state(definition,value.run_id,value.mode as 'command'|'research',Number(value.generation),value.source_run as string|null,value.rng.origin,value.initial_conditions.surface as 'default'|'empty',value.initial_conditions.gate_profile as import('./knowledge-collection-definition').KnowledgeCollectionGateProfile);
    if(!Array.isArray(value.inputs))throw new Error('Invalid collection inputs');
    for(const item of value.inputs){
      if(!record(item)||!valid_knowledge_collection_envelope(item.envelope))throw new Error('Invalid collection input');
      expected=await apply_knowledge_collection_control(expected,item.envelope,item.clock_to as number|undefined);
    }
    expected.integrity=await state_hash(expected);
    if(JSON.stringify(canonical(value))!==JSON.stringify(canonical(expected)))throw new Error('Collection snapshot mismatch');
    return expected;
  }catch{throw new GameError('INVALID_SAVE');}
}
