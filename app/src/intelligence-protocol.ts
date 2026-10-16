import {GameError} from './contracts';
import {record,fields,valid_id} from './protocol';
import type {IntelligenceRef} from './intelligence-contracts';
import type {SaveIntelligencePlan,IntelligencePreparationRequest} from './intelligence-contracts';
export function parse_intelligence_preparation(input:unknown):IntelligencePreparationRequest{
  if(!record(input)||!fields(input,['run_id','operation_id','expected_revision','intent'])||!valid_id(input.run_id)||!valid_id(input.operation_id)||!Number.isSafeInteger(input.expected_revision)||Number(input.expected_revision)<1||!record(input.intent)||!fields(input.intent,['kind','plan_ref'])||input.intent.kind!=='request_preparation'||!record(input.intent.plan_ref))throw new GameError('INVALID_REQUEST');
  const ref=input.intent.plan_ref;
  if(!fields(ref,['run_id','kind','id','version'])||ref.run_id!==input.run_id||ref.kind!=='plan'||!valid_id(ref.id)||!Number.isSafeInteger(ref.version)||Number(ref.version)<1||Number(ref.version)>32)throw new GameError('INVALID_REQUEST');
  return structuredClone(input) as IntelligencePreparationRequest;
}
export function parse_intelligence_plan(input:unknown):SaveIntelligencePlan{
  if(!record(input)||!fields(input,['run_id','operation_id','expected_revision','intent'])||!valid_id(input.run_id)||!valid_id(input.operation_id)||!Number.isSafeInteger(input.expected_revision)||Number(input.expected_revision)<1||!record(input.intent)||!fields(input.intent,['kind','base_plan_ref','draft'])||input.intent.kind!=='save_plan'||!record(input.intent.draft)||!fields(input.intent.draft,['purpose','repair_packs'])||typeof input.intent.draft.purpose!=='string'||!input.intent.draft.purpose.trim()||[...input.intent.draft.purpose].length>2000||input.intent.draft.repair_packs!==2)throw new GameError('INVALID_REQUEST');
  const ref=input.intent.base_plan_ref;
  if(ref!==null&&(!record(ref)||!fields(ref,['run_id','kind','id','version'])||ref.run_id!==input.run_id||ref.kind!=='plan'||!valid_id(ref.id)||!Number.isSafeInteger(ref.version)||Number(ref.version)<1))throw new GameError('INVALID_REQUEST');
  return structuredClone(input) as SaveIntelligencePlan;
}
export type IntelligenceSourceRequest={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'request_source_validation';basis_delivery_refs:IntelligenceRef<'report_delivery'>[]}};
export function parse_intelligence_source_request(input:unknown):IntelligenceSourceRequest{
  if(!record(input)||!fields(input,['run_id','operation_id','expected_revision','intent'])||!valid_id(input.run_id)||!valid_id(input.operation_id)||!Number.isSafeInteger(input.expected_revision)||Number(input.expected_revision)<1||!record(input.intent)||!fields(input.intent,['kind','basis_delivery_refs'])||input.intent.kind!=='request_source_validation'||!Array.isArray(input.intent.basis_delivery_refs)||!input.intent.basis_delivery_refs.length)throw new GameError('INVALID_REQUEST');
  const refs=input.intent.basis_delivery_refs;
  for(const ref of refs)if(!record(ref)||!fields(ref,['run_id','kind','id','version'])||ref.run_id!==input.run_id||ref.kind!=='report_delivery'||!valid_id(ref.id)||ref.version!==1)throw new GameError('INVALID_REQUEST');
  if(new Set(refs.map(ref=>ref.id)).size!==refs.length)throw new GameError('INVALID_REQUEST');
  return structuredClone(input) as IntelligenceSourceRequest;
}
