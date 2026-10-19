import {GameError} from '../contracts';
import {record} from '../protocol';
import type {SourceKnowledgeTime,SourceNote,SourceTimePlayerView} from '../source-time-contracts';
import {source_time_definition_for_package,load_source_time_definition} from './source-time-definition';
import {compose_source_time_state,type SourceTimeState} from './source-time-state';
import {project_outcome_view} from './outcome-knowledge';
import {validate_outcome_state} from './outcome-snapshot';
import {canonical,state_hash} from './snapshot';
export function project_source_time_view(state:SourceTimeState,recipient='HQ'):SourceTimePlayerView{
 const definition=source_time_definition_for_package(state.definition_hash),ref=<K extends string>(kind:K,id:string)=>({run_id:state.run_id,kind,id,version:1 as const});
 const deliveries=state.source_events.filter(delivery=>delivery.recipient===recipient),received=new Set(deliveries.map(delivery=>delivery.report_ref.id));
 const time=(value:{kind:string;value?:number;basis_ref?:string}):SourceKnowledgeTime=>value.kind==='known'?{kind:'known',value:value.value!,basis_ref:ref('source_basis',value.basis_ref!)}:{kind:'unknown'};
 const reports:SourceNote[]=definition.catalogs.reports.filter(report=>received.has(report.id)).map(report=>({ref:ref('source_report',report.id),kind:'context_note',subject:report.subject,text:report.text,source:report.source,event_time:time(report.event_time),observed_time:time(report.observed_time),source_reported_time:time(report.source_reported_time)}));
 const bases=definition.catalogs.time_bases.filter(basis=>received.has(basis.report)).map(basis=>({ref:ref('source_basis',basis.id),report_ref:ref('source_report',basis.report),delivery_ref:deliveries.find(delivery=>delivery.report_ref.id===basis.report)!.ref,kind:basis.kind,value:basis.value,description:basis.description}));
 return {...project_outcome_view(state.task),source_package:{id:'B31-SOURCE-TIME-01',version:1},source_reading:{reports,deliveries:structuredClone(deliveries),bases,similarity_hint:reports.length===3?{kind:'suspected',report_refs:reports.map(report=>report.ref),text:'三份原文措辞相同，可能关联；来源关系与独立总数尚未知。'}:null,groups:[],independence:{kind:'unknown'}}};
}
export async function validate_source_time_state(value:Record<string,unknown>):Promise<SourceTimeState>{
 try{
  const definition=await load_source_time_definition(source_time_definition_for_package(value.definition_hash));if(!record(value.task)||value.task.definition_hash!==definition.task_definition.definition_hash)throw Error('task');const task=await validate_outcome_state(value.task),expected=await compose_source_time_state(task,definition);
  const {integrity,...body}=value;if(integrity!==await state_hash(value as unknown as SourceTimeState)||JSON.stringify(canonical(body))!==JSON.stringify(canonical(expected)))throw Error('source replay');return value as unknown as SourceTimeState;
 }catch{throw new GameError('INVALID_SAVE');}
}
