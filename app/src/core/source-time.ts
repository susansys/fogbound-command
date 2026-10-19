import {GameError} from '../contracts';
import {record} from '../protocol';
import {derive_source_relations,type SourceKnowledgeTime,type SourceNote,type SourceTimePlayerView,type SourceEvidence} from '../source-time-contracts';
import {source_time_definition_for_package,load_source_time_definition} from './source-time-definition';
import type {SourceTimeDefinition} from './source-time-definition';
import {compose_source_time_state,type SourceTimeState} from './source-time-state';
import {project_outcome_view} from './outcome-knowledge';
import {validate_outcome_state} from './outcome-snapshot';
import {canonical,state_hash} from './snapshot';
export function project_source_time_view(state:SourceTimeState,recipient='HQ',owned:readonly SourceTimeDefinition[]=[]):SourceTimePlayerView{
 const definition=source_time_definition_for_package(state.definition_hash,owned),ref=<K extends string>(kind:K,id:string)=>({run_id:state.run_id,kind,id,version:1 as const});
 const deliveries=state.source_events.filter(delivery=>delivery.recipient===recipient),received=new Set(deliveries.map(delivery=>delivery.report_ref.id));
 const time=(value:{kind:string;value?:number;basis_ref?:string}):SourceKnowledgeTime=>value.kind==='known'?{kind:'known',value:value.value!,basis_ref:ref('source_basis',value.basis_ref!)}:{kind:'unknown'};
 const reports:SourceNote[]=definition.catalogs.reports.filter(report=>received.has(report.id)).map(report=>({ref:ref('source_report',report.id),kind:'context_note',subject:report.subject,text:report.text,source:report.source,event_time:time(report.event_time),observed_time:time(report.observed_time),source_reported_time:time(report.source_reported_time)}));
 const bases=definition.catalogs.time_bases.filter(basis=>received.has(basis.report)).map(basis=>({ref:ref('source_basis',basis.id),report_ref:ref('source_report',basis.report),delivery_ref:deliveries.find(delivery=>delivery.report_ref.id===basis.report)!.ref,kind:basis.kind,value:basis.value,description:basis.description}));
 const evidence:SourceEvidence[]=definition.catalogs.evidence.filter(item=>received.has(item.id)).map(item=>{const delivery=deliveries.find(delivery=>delivery.report_ref.id===item.id)!,common={ref:ref('source_report',item.id),issuer:'ArchiveSource' as const,authority:'source_metadata' as const,basis:{ref:ref('source_evidence_basis',item.basis),description:item.kind==='lineage_retraction'?item.reason!:item.claim!},delivery_ref:delivery.ref,received:delivery.received,knowledge_seq:delivery.knowledge_seq};
  if(item.kind==='confirmed_forward_claim')return {...common,kind:'forward_of' as const,relation_ref:ref('source_relation',item.relation_id!),from_report_ref:ref('source_report',item.from!),to_report_ref:ref('source_report',item.to!)};
  if(item.kind==='explicit_independent_acquisition_evidence')return {...common,kind:'different_acquisition' as const,report_refs:[ref('source_report',item.covered_reports![0]),ref('source_report',item.covered_reports![1])],acquisitions:[{ref:ref('source_acquisition',item.visible_acquisition_records![0]),description:'随凭证递交的第一份采集记录'},{ref:ref('source_acquisition',item.visible_acquisition_records![1]),description:'随凭证递交的第二份采集记录'}]};
  return {...common,kind:'lineage_retraction' as const,target_relation_ref:ref('source_relation',item.target_relation!),target_evidence_ref:ref('source_report',item.target_basis!),reason:item.reason!};
 });
 return {...project_outcome_view(state.task),source_package:{id:'B31-SOURCE-TIME-01',version:1},source_reading:{reports,deliveries:structuredClone(deliveries),bases,evidence,...derive_source_relations(reports,evidence),similarity_hint:reports.length===3?{kind:'suspected',report_refs:reports.map(report=>report.ref),text:'三份原文措辞相同，可能关联；措辞本身不证明来源关系或独立总数。'}:null,independence:{kind:'unknown'}}};
}
export async function validate_source_time_state(value:Record<string,unknown>,owned:readonly SourceTimeDefinition[]=[]):Promise<SourceTimeState>{
 try{
  const definition=await load_source_time_definition(source_time_definition_for_package(value.definition_hash,owned),owned);if(!record(value.task)||value.task.definition_hash!==definition.task_definition.definition_hash)throw Error('task');const task=await validate_outcome_state(value.task),expected=await compose_source_time_state(task,definition);
  const {integrity,...body}=value;if(integrity!==await state_hash(value as unknown as SourceTimeState)||JSON.stringify(canonical(body))!==JSON.stringify(canonical(expected)))throw Error('source replay');return value as unknown as SourceTimeState;
 }catch{throw new GameError('INVALID_SAVE');}
}
