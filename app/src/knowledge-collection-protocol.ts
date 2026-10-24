import {record,fields,valid_id} from './protocol';
import type {KnowledgeCollectionEnvelope} from './knowledge-collection-contracts';
export function valid_collection_ref(value:unknown,run:string,kind:string):boolean{
  return record(value)&&fields(value,['run_id','kind','id','version'])&&value.run_id===run&&value.kind===kind&&valid_id(value.id)&&value.version===1;
}
export function valid_knowledge_collection_envelope(value:unknown):value is KnowledgeCollectionEnvelope{
  if(!record(value)||!fields(value,['run_id','operation_id','expected_revision','intent'])||!valid_id(value.run_id)||!valid_id(value.operation_id)||!Number.isSafeInteger(value.expected_revision)||Number(value.expected_revision)<1||!record(value.intent))return false;
  const intent=value.intent;
  if(intent.kind==='advance')return fields(intent,['kind','to'])&&Number.isSafeInteger(intent.to)&&Number(intent.to)>=0&&Number(intent.to)<=1222000;
  if(intent.kind==='cancel_collection')return fields(intent,['kind','request_ref','authority_ref'])&&valid_collection_ref(intent.request_ref,value.run_id,'collection_request')&&valid_collection_ref(intent.authority_ref,value.run_id,'authority');
  if(intent.kind!=='request_collection'||!fields(intent,['kind','actor','question_ref','target_ref','scope_ref','method_ref','authority_ref','basis_refs','collection_window','needed_by'])||!['R','W'].includes(String(intent.actor)))return false;
  for(const [key,kind]of [['question_ref','question'],['target_ref','facility'],['scope_ref','scope'],['method_ref','method'],['authority_ref','authority']])if(!valid_collection_ref(intent[key],value.run_id,kind))return false;
  if(!Array.isArray(intent.basis_refs)||intent.basis_refs.length!==1||Object.keys(intent.basis_refs).length!==1||!valid_collection_ref(intent.basis_refs[0],value.run_id,'briefing'))return false;
  const window=intent.collection_window;
  return record(window)&&fields(window,['from','to'])&&Number.isSafeInteger(window.from)&&Number.isSafeInteger(window.to)&&Number(window.from)>=0&&Number(window.to)>Number(window.from)&&Number(window.to)<=900000&&Number.isSafeInteger(intent.needed_by)&&Number(intent.needed_by)>0&&Number(intent.needed_by)<=900000;
}
