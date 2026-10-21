import {record,fields,valid_id,valid_envelope} from './protocol';
import type {IntegratedFieldEnvelope} from './integrated-field-contracts';
const model=(value:unknown)=>record(value)&&fields(value,['id','version'])&&value.id==='INTEGRATED-FIELD-MODEL-3'&&value.version===1;
const ref=(value:unknown)=>record(value)&&fields(value,['run_id','id','version'])&&valid_id(value.run_id)&&valid_id(value.id)&&value.version===1;
export function valid_integrated_field_envelope(value:unknown):value is IntegratedFieldEnvelope{
 if(valid_envelope(value,910000,true))return ['advance','tick','pause','continue','rate','mode','save','restore'].includes(value.intent.kind);
 if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1||!record(value.intent))return false;
 const intent=value.intent;
 if(intent.kind==='integrated_abort')return fields(intent,['kind','model_ref',...(Object.hasOwn(intent,'reason')?['reason']:[])])&&model(intent.model_ref)&&(!Object.hasOwn(intent,'reason')||typeof intent.reason==='string'&&intent.reason.trim().length>0&&intent.reason.length<=600);
 if(intent.kind==='integrated_prepare')return fields(intent,['kind','plan_ref','model_ref'])&&ref(intent.plan_ref)&&model(intent.model_ref);
 if(intent.kind==='integrated_activity'){
  const worker=intent.actor==='W';
  if(!fields(intent,['kind','actor','action','target','model_ref','basis_refs',...(worker?['plan_ref']:[])])||!model(intent.model_ref)||!Array.isArray(intent.basis_refs)||intent.basis_refs.length>8||Object.keys(intent.basis_refs).length!==intent.basis_refs.length||!intent.basis_refs.every(ref))return false;
  return intent.actor==='R'&&((intent.action==='read'&&(intent.target==='A'||intent.target==='B'))||(intent.action==='observe'&&intent.target==='A'))||worker&&(intent.action==='inspect'||intent.action==='repair')&&intent.target==='B'&&ref(intent.plan_ref);
 }
 return fields(intent,['kind','actor','target','model_ref'])&&intent.kind==='integrated_move'&&(intent.actor==='R'||intent.actor==='W')&&(intent.target==='H'||intent.target==='A'||intent.target==='B')&&model(intent.model_ref);
}
