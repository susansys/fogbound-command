import {GameError} from './contracts';
import {record,fields,valid_id} from './protocol';
import type {IntelligenceRef} from './intelligence-contracts';
export type IntelligenceSourceRequest={run_id:string;operation_id:string;expected_revision:number;intent:{kind:'request_source_validation';basis_delivery_refs:IntelligenceRef<'report_delivery'>[]}};
export function parse_intelligence_source_request(input:unknown):IntelligenceSourceRequest{
  if(!record(input)||!fields(input,['run_id','operation_id','expected_revision','intent'])||!valid_id(input.run_id)||!valid_id(input.operation_id)||!Number.isSafeInteger(input.expected_revision)||Number(input.expected_revision)<1||!record(input.intent)||!fields(input.intent,['kind','basis_delivery_refs'])||input.intent.kind!=='request_source_validation'||!Array.isArray(input.intent.basis_delivery_refs)||!input.intent.basis_delivery_refs.length)throw new GameError('INVALID_REQUEST');
  const refs=input.intent.basis_delivery_refs;
  for(const ref of refs)if(!record(ref)||!fields(ref,['run_id','kind','id','version'])||ref.run_id!==input.run_id||ref.kind!=='report_delivery'||!valid_id(ref.id)||ref.version!==1)throw new GameError('INVALID_REQUEST');
  if(new Set(refs.map(ref=>ref.id)).size!==refs.length)throw new GameError('INVALID_REQUEST');
  return structuredClone(input) as IntelligenceSourceRequest;
}
