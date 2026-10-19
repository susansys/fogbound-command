import {GameError} from './contracts';
import {record,fields,valid_id} from './protocol';
import {dense_array} from './spatial';
import type {SaveWorkingAssessment} from './conflicting-action-contracts';
import type {ConflictingActionEnvelope} from './conflicting-action-contracts';
import {parse_outcome_envelope} from './outcome-protocol';

const natural=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=1;
function ref(value:unknown,kind:string){return record(value)&&fields(value,['run_id','kind','id','version'])&&valid_id(value.run_id)&&value.kind===kind&&valid_id(value.id)&&natural(value.version);}
export function parse_working_assessment(value:unknown):SaveWorkingAssessment{
 const invalid=():never=>{throw new GameError('INVALID_REQUEST');};
 if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!natural(value.expected_revision)||!record(value.intent))return invalid();
 const intent=value.intent;
 if(!fields(intent,['kind','base_ref','draft'])||intent.kind!=='save_working_assessment'||!(intent.base_ref===null||ref(intent.base_ref,'working_assessment'))||!record(intent.draft))return invalid();
 const draft=intent.draft;
 if(!fields(draft,['target_scope','explanations','basis_refs',...(Object.hasOwn(draft,'preferred')?['preferred']:[]),...(Object.hasOwn(draft,'reason')?['reason']:[])])||draft.target_scope!=='B'||!dense_array(draft.explanations)||JSON.stringify(draft.explanations)!==JSON.stringify(['operable','faulted'])||Object.hasOwn(draft,'preferred')&&!['operable','faulted','undecided'].includes(String(draft.preferred))||Object.hasOwn(draft,'reason')&&(typeof draft.reason!=='string'||draft.reason.length>1000)||!dense_array(draft.basis_refs)||draft.basis_refs.length>8||!draft.basis_refs.every(item=>ref(item,'facility_report')))return invalid();
 const keys=draft.basis_refs.map(item=>{const r=item as Record<string,unknown>;return JSON.stringify([r.run_id,r.kind,r.id,r.version]);});
 if(new Set(keys).size!==keys.length)return invalid();
 return structuredClone(value) as SaveWorkingAssessment;
}
export function parse_conflicting_action_envelope(value:unknown):ConflictingActionEnvelope{
 return record(value)&&record(value.intent)&&value.intent.kind==='save_working_assessment'?parse_working_assessment(value):parse_outcome_envelope(value);
}
