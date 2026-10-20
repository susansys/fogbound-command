import {record,fields,valid_id,valid_envelope} from './protocol';
import type {IntegratedFieldEnvelope} from './integrated-field-contracts';
export function valid_integrated_field_envelope(value:unknown):value is IntegratedFieldEnvelope{
 if(valid_envelope(value,910000,true))return ['advance','tick','pause','continue','rate','mode','save','restore'].includes(value.intent.kind);
 if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1||!record(value.intent))return false;
 const intent=value.intent;
 return fields(intent,['kind','actor','target','model_ref'])&&intent.kind==='integrated_move'&&(intent.actor==='R'||intent.actor==='W')&&(intent.target==='H'||intent.target==='A'||intent.target==='B')&&record(intent.model_ref)&&fields(intent.model_ref,['id','version'])&&intent.model_ref.id==='INTEGRATED-FIELD-MODEL-3'&&intent.model_ref.version===1;
}
