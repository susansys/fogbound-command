import {record,fields,valid_id} from './protocol';import {GameError} from './contracts';import type {ReturnAndDeliver} from './outcome-contracts';
import {valid_envelope} from './protocol';import {parse_intelligence_plan,parse_intelligence_source_request,parse_intelligence_preparation,parse_intelligence_activity} from './intelligence-protocol';import type {OutcomeEnvelope} from './outcome-contracts';
export function parse_outcome_envelope(value:unknown):OutcomeEnvelope{
 if(!record(value)||!record(value.intent))throw new GameError('INVALID_REQUEST');
 switch(value.intent.kind){
  case 'return_and_deliver':return parse_return_and_deliver(value);
  case 'save_plan':return parse_intelligence_plan(value);
  case 'request_source_validation':return parse_intelligence_source_request(value);
  case 'request_preparation':return parse_intelligence_preparation(value);
  case 'issue_activity':return parse_intelligence_activity(value);
  default:if(valid_envelope(value,910000,true)&&['save','pause','continue','advance','rate'].includes(value.intent.kind))return structuredClone(value);throw new GameError('INVALID_REQUEST');
 }
}
export function parse_return_and_deliver(value:unknown):ReturnAndDeliver{
 const bad=()=>{throw new GameError('INVALID_REQUEST');};
 if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1||!record(value.intent))return bad();const i=value.intent;
 if(!fields(i,['kind','actor_ref','return_route_ref','receiver_ref','authority_ref','intent_ref','basis_delivery_refs','allowed_followups','cleanup_scope','effective_window',...(Object.hasOwn(i,'reason')?['reason']:[])])||i.kind!=='return_and_deliver')return bad();
 if(Object.hasOwn(i,'reason')&&(typeof i.reason!=='string'||!i.reason.trim()||i.reason.length>600))return bad();
 for(const[name,kind]of [['actor_ref','actor'],['return_route_ref','return_route'],['receiver_ref','receiver'],['authority_ref','authority'],['intent_ref','return_intent']]){const r=i[name];if(!record(r)||!fields(r,['run_id','kind','id','version'])||r.run_id!==value.run_id||r.kind!==kind||!valid_id(r.id)||r.version!==1)return bad();}
 if(!Array.isArray(i.basis_delivery_refs)||i.basis_delivery_refs.length>32||i.basis_delivery_refs.some(r=>!record(r)||!fields(r,['run_id','kind','id','version'])||r.run_id!==value.run_id||!valid_id(r.id)||!valid_id(r.kind)||r.version!==1)||JSON.stringify(i.allowed_followups)!==JSON.stringify(['return','handover_batch','verify_manifest','notify_HQ'])||JSON.stringify(i.cleanup_scope)!==JSON.stringify(['return','personnel_reception','custody'])||!record(i.effective_window)||!fields(i.effective_window,['from','to'])||!Number.isSafeInteger(i.effective_window.from)||!Number.isSafeInteger(i.effective_window.to)||Number(i.effective_window.from)<0||Number(i.effective_window.to)<=Number(i.effective_window.from))return bad();
 return structuredClone(value) as ReturnAndDeliver;
}
