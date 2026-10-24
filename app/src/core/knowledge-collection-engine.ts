import {GameError} from '../contracts';
import type {KnowledgeCollectionPlayerView,KnowledgeCollectionEnvelope} from '../knowledge-collection-contracts';
import type {KnowledgeCollectionState} from './knowledge-collection-state';
import {advance_collection_work,request_collection,cancel_collection,collection_ref,request_archive_read,request_source_forward,request_collection_return,request_collection_position,admit_bounded_collection_control} from './knowledge-collection-work';
import {is_collection_report,type CollectionPositionReport} from '../knowledge-collection-contracts';
import {record_collection_assessment} from './knowledge-collection-knowledge';
import {project_collection_sources} from './knowledge-collection-sources';
export async function apply_knowledge_collection_control(state:KnowledgeCollectionState,envelope:KnowledgeCollectionEnvelope,clock_to?:number):Promise<KnowledgeCollectionState>{
  if(envelope.run_id!==state.run_id)throw new GameError('INVALID_INPUT');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  if(clock_to!==undefined)throw new GameError('INVALID_INPUT');
  const next=structuredClone(state),at=state.sim_time;
  if(envelope.intent.kind==='advance'){
    if(state.mode!=='research')throw new GameError('MODE_LOCKED');
    if(envelope.intent.to<state.sim_time)throw new GameError('INVALID_INPUT');
    await advance_collection_work(next,envelope.intent.to);
  }else if(!admit_bounded_collection_control(next,envelope)){
    // The local refusal and original public pending identity are the only new facts.
  }else if(envelope.intent.kind==='request_collection')request_collection(next,envelope.intent);
  else if(envelope.intent.kind==='request_archive_read')request_archive_read(next,envelope.intent);
  else if(envelope.intent.kind==='forward_source_credential')request_source_forward(next,envelope.intent);
  else if(envelope.intent.kind==='return_to_headquarters')request_collection_return(next,envelope.intent);
  else if(envelope.intent.kind==='request_self_position'||envelope.intent.kind==='forward_position_report')request_collection_position(next,envelope.intent);
  else if(envelope.intent.kind==='restore'){
    if(envelope.intent.snapshot_revision!==state.revision)throw new GameError('INVALID_SAVE');
    next.paused=true;
  }else if(envelope.intent.kind==='save'){next.paused=state.paused;}
  else if(envelope.intent.kind==='cancel_collection')cancel_collection(next,envelope.intent);
  else await record_collection_assessment(next.knowledge,envelope.intent,project_knowledge_collection_view(next));
  next.revision++;delete next.integrity;
  next.inputs.push({envelope:structuredClone(envelope),at,revision:next.revision});
  return next;
}
export function project_knowledge_collection_view(state:KnowledgeCollectionState):KnowledgeCollectionPlayerView{
  const deliveries=structuredClone(state.deliveries),source_credentials=structuredClone(state.source_credentials);
  const reports=[...new Set(deliveries.map(delivery=>delivery.report_ref.id))].map(id=>structuredClone(state.reports.find(report=>report.ref.id===id)!));
  const positions=reports.filter((report):report is CollectionPositionReport=>report.method==='self-position-registration'||report.method==='collection-end-self-position').sort((a,b)=>b.observed_time.value-a.observed_time.value);
  return {scenario_kind:'play_knowledge_collection',case_ref:state.definition.case_ref,run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:state.finished,source_run:state.source_run,status:state.status,can_issue:true,next_action:'安排有限采集或设施核实',gap:'总部尚未收到本局采集报告',source_relationships:project_collection_sources(reports,deliveries,source_credentials,state.source_notices),source_credentials,source_notices:structuredClone(state.source_notices),control_admissions:structuredClone(state.control_admissions),
    actors:(['R','W'] as const).map(id=>({id,position:id==='R'&&positions.length?{point:structuredClone(positions[0].body.point),observed_at:positions[0].observed_time.value,received_at:deliveries.find(delivery=>delivery.report_ref.id===positions[0].ref.id)!.received_at,evidence:positions[0].ref.id}:{point:[state.definition.geometry.points.B[0],state.definition.geometry.points.B[1]],observed_at:0,received_at:0,evidence:'KA-BRIEF-INITIAL-'+id}})),public_rules:structuredClone(state.definition.public_rules),geometry:structuredClone(state.definition.geometry),replay_nodes:[{revision:1,at:0,meaningful:true,label:'初始简报'}],
    collection_requests:state.requests.map(task=>({ref:structuredClone(task.ref),actor:task.intent.actor,issued_at:task.issued_at,status:state.requirements.find(ir=>ir.request_id===task.ref.id)!.status==='open'?'tasking':state.requirements.find(ir=>ir.request_id===task.ref.id)!.status as Exclude<import('./knowledge-collection-state').CollectionRequirementState['status'],'open'>,local_receipt:task.cancel?.origin==='local_queue'&&task.cancel.result==='cancelled'?{kind:'cancelled_before_send',at:task.cancel.issued_at,remote_task_created:false}:null,acknowledgement:task.accepted_received_at!==null&&task.accepted_stage!==null&&task.accepted_sent_at!==null?{stage:task.accepted_stage,sent_at:task.accepted_sent_at,received_at:task.accepted_received_at,planned_start_at:task.planned_start_at}:null})),reports,deliveries,
    archive_requests:state.archive_requests.map(task=>({ref:structuredClone(task.ref),actor:'R',entry:task.intent.entry,issued_at:task.issued_at,status:task.terminal_received_at!==null?(task.outcome==='completed'?'completed':'failed'):task.accepted_received_at!==null?'reading':'tasking',acknowledgement:task.accepted_received_at!==null?{sent_at:task.accepted_sent_at!,received_at:task.accepted_received_at}:null,terminal_receipt:task.terminal_received_at!==null?{outcome:task.outcome!,sent_at:task.terminal_sent_at!,received_at:task.terminal_received_at}:null})),
    source_forward_requests:state.source_forwards.map(task=>({ref:structuredClone(task.ref),issued_at:task.issued_at,status:task.terminal_received_at===null?'tasking':task.outcome==='completed'?'completed':'failed',receipt:task.terminal_received_at!==null?{outcome:task.outcome!,sent_at:task.terminal_sent_at!,received_at:task.terminal_received_at}:null})),
    return_requests:state.returns.map(task=>({ref:structuredClone(task.ref),actor:task.intent.actor,issued_at:task.issued_at,acknowledgement:task.accepted_received_at!==null?{sent_at:task.accepted_sent_at!,received_at:task.accepted_received_at,outcome:task.outcome!}:null})),
    position_requests:state.position_requests.map(task=>({ref:structuredClone(task.ref),kind:task.intent.kind,issued_at:task.issued_at,acknowledgement:task.accepted_received_at!==null?{sent_at:task.accepted_sent_at!,received_at:task.accepted_received_at}:null,terminal_receipt:task.terminal_received_at!==null?{sent_at:task.terminal_sent_at!,received_at:task.terminal_received_at,outcome:task.outcome!}:null})),
    coverage:reports.filter(is_collection_report).map(report=>({ref:collection_ref(state.run_id,'coverage',report.ref.id+'.coverage'),report_ref:report.ref,delivery_ref:deliveries.find(delivery=>delivery.report_ref.id===report.ref.id)!.ref,quality:report.body.quality,outcome:report.body.outcome,observed_time:report.observed_time,method_ref:report.method_ref,limits:report.body.limits,...report.coverage})),facility_knowledge:structuredClone(state.knowledge.facility),assessments:structuredClone(state.knowledge.assessments),correction_records:structuredClone(state.knowledge.corrections)};
}
