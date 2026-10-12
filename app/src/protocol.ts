import type { Request } from './transport';
export function record(value:unknown):value is Record<string,unknown> { return typeof value==='object' && value!==null && !Array.isArray(value); }
export function valid_id(value:unknown):value is string { return typeof value==='string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value); }
export function fields(value:Record<string,unknown>,expected:string[]):boolean { return Object.keys(value).sort().join(',') === expected.sort().join(','); }
export function valid_request(value:unknown):value is Request&{request_id:string} {
  if(!record(value)||!valid_id(value.request_id))return false;
  if(value.kind==='list')return fields(value,['kind','request_id']);
  if(value.kind==='create')return fields(value,['kind','mode','operation_id','request_id']) && (value.mode==='command'||value.mode==='research') && valid_id(value.operation_id);
  if(value.kind==='view')return fields(value,['kind','run_id','request_id']) && valid_id(value.run_id);
  return false;
}
export function correlation(value:unknown):string { return record(value)&&valid_id(value.request_id)?value.request_id:'invalid-request'; }
