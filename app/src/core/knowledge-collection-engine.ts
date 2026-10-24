import {GameError} from '../contracts';
import type {KnowledgeCollectionPlayerView,KnowledgeCollectionEnvelope} from '../knowledge-collection-contracts';
import type {KnowledgeCollectionState} from './knowledge-collection-state';
import {advance_collection_work,request_collection,cancel_collection,collection_ref} from './knowledge-collection-work';
export async function apply_knowledge_collection_control(state:KnowledgeCollectionState,envelope:KnowledgeCollectionEnvelope,clock_to?:number):Promise<KnowledgeCollectionState>{
  if(envelope.run_id!==state.run_id)throw new GameError('INVALID_INPUT');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  if(clock_to!==undefined)throw new GameError('INVALID_INPUT');
  const next=structuredClone(state),at=state.sim_time;
  if(envelope.intent.kind==='advance'){
    if(state.mode!=='research')throw new GameError('MODE_LOCKED');
    if(envelope.intent.to<state.sim_time)throw new GameError('INVALID_INPUT');
    await advance_collection_work(next,envelope.intent.to);
  }else if(envelope.intent.kind==='request_collection')request_collection(next,envelope.intent);
  else cancel_collection(next,envelope.intent);
  next.revision++;delete next.integrity;
  next.inputs.push({envelope:structuredClone(envelope),at,revision:next.revision});
  return next;
}
export function project_knowledge_collection_view(state:KnowledgeCollectionState):KnowledgeCollectionPlayerView{
  const deliveries=structuredClone(state.deliveries);
  const reports=state.reports.filter(report=>deliveries.some(delivery=>delivery.report_ref.id===report.ref.id)).map(report=>structuredClone(report));
  return {scenario_kind:'play_knowledge_collection',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:state.finished,source_run:state.source_run,status:state.status,can_issue:true,next_action:'安排有限采集或设施核实',gap:'总部尚未收到本局采集报告',
    actors:(['R','W'] as const).map(id=>({id,position:{point:[state.definition.geometry.points.B[0],state.definition.geometry.points.B[1]],observed_at:0,received_at:0,evidence:'KA-BRIEF-INITIAL-'+id}})),public_rules:structuredClone(state.definition.public_rules),geometry:structuredClone(state.definition.geometry),replay_nodes:[{revision:1,at:0,meaningful:true,label:'初始简报'}],
    collection_requests:state.requests.map(task=>({ref:structuredClone(task.ref),actor:task.intent.actor,issued_at:task.issued_at,status:state.requirements.find(ir=>ir.request_id===task.ref.id)!.status==='open'?'tasking':state.requirements.find(ir=>ir.request_id===task.ref.id)!.status as Exclude<import('./knowledge-collection-state').CollectionRequirementState['status'],'open'>,local_receipt:task.cancel?.origin==='local_queue'&&task.cancel.result==='cancelled'?{kind:'cancelled_before_send',at:task.cancel.issued_at,remote_task_created:false}:null,acknowledgement:task.accepted_received_at!==null&&task.accepted_stage!==null&&task.accepted_sent_at!==null?{stage:task.accepted_stage,sent_at:task.accepted_sent_at,received_at:task.accepted_received_at,planned_start_at:task.planned_start_at}:null})),reports,deliveries,
    coverage:reports.map(report=>({ref:collection_ref(state.run_id,'coverage',report.ref.id+'.coverage'),report_ref:report.ref,delivery_ref:deliveries.find(delivery=>delivery.report_ref.id===report.ref.id)!.ref,quality:report.body.quality,outcome:report.body.outcome,observed_time:report.observed_time,method_ref:report.method_ref,limits:report.body.limits,...report.coverage})),facility_knowledge:null};
}
