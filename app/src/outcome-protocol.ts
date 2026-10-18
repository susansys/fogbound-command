import {record,fields,valid_id} from './protocol';import {GameError} from './contracts';import type {ReturnAndDeliver} from './outcome-contracts';
import {valid_envelope} from './protocol';import {parse_intelligence_plan,parse_intelligence_source_request,parse_intelligence_preparation,parse_intelligence_activity} from './intelligence-protocol';import type {OutcomeEnvelope} from './outcome-contracts';
export function parse_outcome_participant_query(value:unknown):import('./outcome-contracts').OutcomeParticipantQuery{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq'])||!valid_id(value.run_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1)throw new GameError('INVALID_REQUEST');
 return structuredClone(value) as import('./outcome-contracts').OutcomeParticipantQuery;
}
export function parse_outcome_debrief_query(value:unknown):import('./outcome-contracts').OutcomeDebriefQuery{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','as_of_revision','actor','layer','topic'])||!valid_id(value.run_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1||!Number.isSafeInteger(value.as_of_revision)||Number(value.as_of_revision)<1||!['HQ','R','W','INTEL','H','ArchiveSource'].includes(String(value.actor))||typeof value.actor!=='string'||typeof value.layer!=='string'||!['known_then','engine_event','declared_reason','retrospective_inference'].includes(value.layer)||typeof value.topic!=='string'||!value.topic.length||value.topic.length>80)throw new GameError('INVALID_REQUEST');
 return structuredClone(value) as import('./outcome-contracts').OutcomeDebriefQuery;
}
export function parse_outcome_evidence_request(value:unknown):import('./outcome-contracts').OutcomeEvidenceRequest{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','as_of_revision','actor','layer','topic','ref']))throw new GameError('INVALID_REQUEST');
 const {ref,...query}=value;parse_outcome_debrief_query(query);
 parse_outcome_evidence_ref(ref);
 return structuredClone(value) as import('./outcome-contracts').OutcomeEvidenceRequest;
}
export function parse_outcome_evidence_ref(ref:unknown):import('./outcome-contracts').DebriefEvidenceRef{
 const time=(v:unknown)=>record(v)&&(fields(v,['kind'])&&v.kind==='unknown'||fields(v,['kind','value','evidence'])&&v.kind==='known'&&Number.isSafeInteger(v.value)&&Number(v.value)>=0&&valid_id(v.evidence));
 if(!record(ref)||!fields(ref,['run_id','kind','id','version','layer','actor_scope','recorded_at','received_at','source_digest'])||!valid_id(ref.run_id)||!valid_id(ref.id)||!Number.isSafeInteger(ref.version)||Number(ref.version)<1||typeof ref.kind!=='string'||!['report','local_observation','delivery','event','decision','ledger','receipt'].includes(ref.kind)||typeof ref.layer!=='string'||!['known_then','engine_event','declared_reason','retrospective_inference'].includes(ref.layer)||typeof ref.actor_scope!=='string'||!['HQ','R','W','INTEL','H','ArchiveSource'].includes(ref.actor_scope)||!time(ref.recorded_at)||!time(ref.received_at)||typeof ref.source_digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.source_digest))throw new GameError('INVALID_REQUEST');
 return structuredClone(ref) as import('./outcome-contracts').DebriefEvidenceRef;
}
export function parse_outcome_truth_request(value:unknown,acknowledge=false):import('./outcome-contracts').OutcomeTruthRequest|import('./outcome-contracts').OutcomeTruthAcknowledgement{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','expected_meta_revision','operation_id',...(acknowledge?['payload_digest']:[])])||!valid_id(value.run_id)||!valid_id(value.operation_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1||!Number.isSafeInteger(value.expected_meta_revision)||Number(value.expected_meta_revision)<1||acknowledge&&(typeof value.payload_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.payload_digest)))throw new GameError('INVALID_REQUEST');
 return structuredClone(value) as import('./outcome-contracts').OutcomeTruthRequest|import('./outcome-contracts').OutcomeTruthAcknowledgement;
}
export function parse_outcome_envelope(value:unknown):OutcomeEnvelope{
 if(!record(value)||!record(value.intent))throw new GameError('INVALID_REQUEST');
 switch(value.intent.kind){
  case 'abort_outcome':return parse_abort_outcome(value);
  case 'return_and_deliver':return parse_return_and_deliver(value);
  case 'save_plan':case 'request_source_validation':case 'request_preparation':case 'issue_activity':{
   if(Object.hasOwn(value.intent,'reason')&&(typeof value.intent.reason!=='string'||!value.intent.reason.trim()||value.intent.reason.length>600))throw new GameError('INVALID_REQUEST');
   const {reason,...intent}=value.intent;void reason;const prefix={...value,intent};
   if(intent.kind==='save_plan')parse_intelligence_plan(prefix);else if(intent.kind==='request_source_validation')parse_intelligence_source_request(prefix);else if(intent.kind==='request_preparation')parse_intelligence_preparation(prefix);else parse_intelligence_activity(prefix);
   return structuredClone(value) as OutcomeEnvelope;
  }
  default:if(valid_envelope(value,910000,true)&&['save','pause','continue','advance','rate'].includes(value.intent.kind))return structuredClone(value);throw new GameError('INVALID_REQUEST');
 }
}
export function parse_abort_outcome(value:unknown):import('./outcome-contracts').AbortOutcome{
 if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1||!record(value.intent)||!fields(value.intent,['kind',...(Object.hasOwn(value.intent,'reason')?['reason']:[])])||value.intent.kind!=='abort_outcome'||Object.hasOwn(value.intent,'reason')&&(typeof value.intent.reason!=='string'||!value.intent.reason.trim()||value.intent.reason.length>600))throw new GameError('INVALID_REQUEST');
 return structuredClone(value) as import('./outcome-contracts').AbortOutcome;
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

export function parse_outcome_decision_query(value:unknown):import('./outcome-contracts').OutcomeDecisionEvaluationRequest{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','decision_ref'])||!valid_id(value.run_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1||!record(value.decision_ref))throw new GameError('INVALID_REQUEST');
 const ref=value.decision_ref;if(!fields(ref,['run_id','kind','id','version'])||ref.run_id!==value.run_id||typeof ref.kind!=='string'||!['decision_record','rejected_decision'].includes(ref.kind)||!valid_id(ref.id)||ref.version!==1)throw new GameError('INVALID_REQUEST');
 return structuredClone(value) as import('./outcome-contracts').OutcomeDecisionEvaluationRequest;
}

export function parse_outcome_debrief_transition(value:unknown):import('./outcome-contracts').OutcomeDebriefTransition{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','expected_lifecycle_revision','operation_id','status'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1||!Number.isSafeInteger(value.expected_lifecycle_revision)||Number(value.expected_lifecycle_revision)<1||typeof value.status!=='string'||!['viewing','archived'].includes(value.status))throw new GameError('INVALID_REQUEST');
 return structuredClone(value) as import('./outcome-contracts').OutcomeDebriefTransition;
}

export function parse_outcome_inference_request(value:unknown):import('./outcome-contracts').OutcomeInferenceRequest{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','operation_id','expected_version','target','basis_refs','text'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1||!Number.isSafeInteger(value.expected_version)||Number(value.expected_version)<0||typeof value.text!=='string'||!value.text.trim()||value.text.length>600||!Array.isArray(value.basis_refs)||value.basis_refs.length>32)throw new GameError('INVALID_REQUEST');
 for(const source of [value.target,...value.basis_refs]){if(!record(source)||!fields(source,['ref','as_of_revision'])||!Number.isSafeInteger(source.as_of_revision)||Number(source.as_of_revision)<1||Number(source.as_of_revision)>Number(value.finished_seq))throw new GameError('INVALID_REQUEST');const ref=parse_outcome_evidence_ref(source.ref);if(ref.run_id!==value.run_id||ref.layer==='retrospective_inference')throw new GameError('INVALID_REQUEST');}
 return structuredClone(value) as import('./outcome-contracts').OutcomeInferenceRequest;
}
