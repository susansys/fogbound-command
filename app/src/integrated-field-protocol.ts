import {record,fields,valid_id,valid_envelope} from './protocol';
import {integratedPlanningPolicy} from './integrated-field-contracts';
import type {IntegratedFieldEnvelope} from './integrated-field-contracts';
import {GameError} from './contracts';
const model=(value:unknown)=>record(value)&&fields(value,['id','version'])&&value.id==='INTEGRATED-FIELD-MODEL-3'&&value.version===1;
const ref=(value:unknown)=>record(value)&&fields(value,['run_id','id','version'])&&valid_id(value.run_id)&&valid_id(value.id)&&value.version===1;
export const integrated_planning_ref=(value:unknown,kind:'working_assessment'|'field_plan')=>record(value)&&fields(value,['run_id','kind','id','version'])&&valid_id(value.run_id)&&value.kind===kind&&valid_id(value.id)&&Number.isSafeInteger(value.version)&&Number(value.version)>=1&&Number(value.version)<=32;
const dense=(value:unknown[]):boolean=>Object.keys(value).length===value.length&&Array.from(value.keys()).every(index=>Object.hasOwn(value,index));
export function parse_integrated_truth_request(value:unknown,confirmation=false):import('./integrated-field-contracts').IntegratedTruthRequest|import('./integrated-field-contracts').IntegratedTruthAcknowledgement{
 if(!record(value)||!fields(value,['run_id','run_digest','finished_seq','expected_meta_revision','operation_id',...(confirmation?['payload_digest']:[])])||!valid_id(value.run_id)||!valid_id(value.operation_id)||typeof value.run_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.run_digest)||!Number.isSafeInteger(value.finished_seq)||Number(value.finished_seq)<1||!Number.isSafeInteger(value.expected_meta_revision)||Number(value.expected_meta_revision)<1||confirmation&&(typeof value.payload_digest!=='string'||!/^[a-f0-9]{64}$/.test(value.payload_digest)))throw new GameError('INVALID_INPUT');
 return structuredClone(value) as unknown as import('./integrated-field-contracts').IntegratedTruthRequest|import('./integrated-field-contracts').IntegratedTruthAcknowledgement;
}
const refs=(value:unknown,kinds:string[])=>Array.isArray(value)&&value.length<=8&&dense(value)&&value.every(value=>record(value)&&fields(value,['run_id','kind','id','version'])&&kinds.includes(String(value.kind))&&valid_id(value.run_id)&&valid_id(value.id)&&value.version===1)&&new Set(value.map(value=>JSON.stringify([value.run_id,value.kind,value.id,value.version]))).size===value.length;
export function valid_integrated_action_payload(intent:unknown):boolean{
 if(!record(intent))return false;
 if(intent.kind==='integrated_prepare')return fields(intent,['kind','plan_ref','model_ref'])&&ref(intent.plan_ref)&&model(intent.model_ref);
 if(intent.kind==='integrated_move')return fields(intent,['kind','actor','target','model_ref'])&&(intent.actor==='R'||intent.actor==='W')&&['H','A','B'].includes(String(intent.target))&&model(intent.model_ref);
 if(intent.kind!=='integrated_activity')return false;const worker=intent.actor==='W';
 return fields(intent,['kind','actor','action','target','model_ref','basis_refs',...(worker?['plan_ref']:[])])&&model(intent.model_ref)&&Array.isArray(intent.basis_refs)&&intent.basis_refs.length<=8&&dense(intent.basis_refs)&&intent.basis_refs.every(ref)&&(intent.actor==='R'&&(intent.action==='read'&&['A','B'].includes(String(intent.target))||intent.action==='observe'&&intent.target==='A')||worker&&['inspect','repair'].includes(String(intent.action))&&intent.target==='B'&&ref(intent.plan_ref));
}
export function valid_integrated_field_envelope(value:unknown):value is IntegratedFieldEnvelope{
 if(valid_envelope(value,910000,true))return ['advance','tick','pause','continue','rate','mode','save','restore'].includes(value.intent.kind);
 if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1||!record(value.intent))return false;
 const intent=value.intent;
 if(intent.kind==='integrated_assess'){
  if(!fields(intent,['kind','model_ref','base_ref','draft'])||!model(intent.model_ref)||!(intent.base_ref===null||integrated_planning_ref(intent.base_ref,'working_assessment'))||!record(intent.draft))return false;const draft=intent.draft;
  if(!fields(draft,['problem_id','basis_refs','assumption_refs',...(Object.hasOwn(draft,'preferred')?['preferred']:[]),...(Object.hasOwn(draft,'reason')?['reason']:[])])||!Object.hasOwn(integratedPlanningPolicy.problems,String(draft.problem_id))||!refs(draft.basis_refs,['report','delivery'])||!refs(draft.assumption_refs,['parameter'])||Object.hasOwn(draft,'reason')&&(typeof draft.reason!=='string'||draft.reason.length>1000))return false;
  const problem=integratedPlanningPolicy.problems[draft.problem_id as keyof typeof integratedPlanningPolicy.problems];return !Object.hasOwn(draft,'preferred')||draft.preferred==='undecided'||problem.explanations.some(value=>value===draft.preferred);
 }
 if(intent.kind==='integrated_save_plan')return fields(intent,['kind','model_ref','base_ref','assessment_ref','action',...(Object.hasOwn(intent,'note')?['note']:[])])&&model(intent.model_ref)&&(intent.base_ref===null||integrated_planning_ref(intent.base_ref,'field_plan'))&&integrated_planning_ref(intent.assessment_ref,'working_assessment')&&valid_integrated_action_payload(intent.action)&&(!Object.hasOwn(intent,'note')||typeof intent.note==='string'&&intent.note.length<=1000);
 if(['integrated_move','integrated_activity','integrated_prepare'].includes(String(intent.kind))){if(Object.hasOwn(intent,'saved_plan_ref')){const {saved_plan_ref,...action}=intent;return integrated_planning_ref(saved_plan_ref,'field_plan')&&valid_integrated_action_payload(action);}return valid_integrated_action_payload(intent);}
 if(intent.kind==='integrated_abort')return fields(intent,['kind','model_ref',...(Object.hasOwn(intent,'reason')?['reason']:[])])&&model(intent.model_ref)&&(!Object.hasOwn(intent,'reason')||typeof intent.reason==='string'&&intent.reason.trim().length>0&&intent.reason.length<=600);
 return false;
}
