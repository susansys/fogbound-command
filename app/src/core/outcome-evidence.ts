import type {OutcomeState} from './outcome-state';
import type {OutcomePlayerView,DebriefEvidenceRef,OutcomeDebriefAnswer} from '../outcome-contracts';
import type {KnownTime} from '../contracts';
import {hash} from './scenario';
import {record} from '../protocol';

// Capture the actor's actual observation at the execution commit, not when a
// debrief later asks about it. The original report remains a separate record.
export function capture_outcome_observations(state:OutcomeState){
  for(const report of state.prefix.field.reports){
    if(state.local_observations.some(o=>o.report_ref.id===report.ref.id))continue;
    state.local_observations.push({ref:{run_id:state.run_id,kind:'local_observation',id:'OBS-'+report.ref.id,version:1},actor:report.actor,at:report.observed.value,phase:report.phase,origin_event:report.provenance.origin_event,source_event_time:structuredClone(report.source_event_time),report_ref:structuredClone(report.ref),confirmation:structuredClone(report.confirmation)});
  }
}
type Entry=OutcomeDebriefAnswer['entries'][number];
async function entry(run_id:string,actor_scope:string,kind:DebriefEvidenceRef['kind'],id:string,version:number,record:Record<string,unknown>,recorded_at:KnownTime,received_at:KnownTime,layer:DebriefEvidenceRef['layer']='known_then'):Promise<Entry>{
  return {ref:{run_id,kind,id,version,layer,actor_scope,recorded_at:structuredClone(recorded_at),received_at:structuredClone(received_at),source_digest:await hash(record)},record:structuredClone(record)};
}
const known=(value:number,evidence:string):KnownTime=>({kind:'known',value,evidence});
export async function declared_outcome_evidence(state:OutcomeState,actor:string):Promise<Entry[]>{
  // Only an actual HQ declaration is available. Later events and other
  // actors' actions cannot supply a missing original psychological reason.
  if(actor!=='HQ')return [];
  const entries:Entry[]=[];
  for(const decision of state.decision_records){
    const at=known(decision.at,decision.ref.id);
    entries.push(await entry(state.run_id,'HQ','decision','DECLARED-'+decision.ref.id,decision.ref.version,{decision_ref:structuredClone(decision.ref),reason:structuredClone(decision.reason),at:decision.at,knowledge_revision:decision.knowledge_revision},at,at,'declared_reason'));
  }
  return entries;
}
export async function retrospective_outcome_evidence(notes:import('../outcome-contracts').OutcomeInferenceNote[]):Promise<Entry[]>{
 const entries:Entry[]=[];
 for(const note of notes)entries.push(await entry(note.run_id,'HQ','event',note.id,note.version,{...note},{kind:'unknown'},{kind:'unknown'},'retrospective_inference'));
 return entries;
}
export async function hq_outcome_evidence(view:OutcomePlayerView,receipts:Array<{operation_id:string;sim_time:number;[key:string]:unknown}>=[],rejections:import('../outcome-contracts').OutcomeRejectedDecision[]=[]):Promise<Entry[]>{
  const entries:Entry[]=[],arrivals:Array<{id:string;received:number;delivery_id:string}>=[];
  for(const {report,delivery} of view.received_reports){
    entries.push(await entry(view.run_id,'HQ','report',report.id,report.version,{...report},report.observed,known(delivery.received,delivery.id)));
    entries.push(await entry(view.run_id,'HQ','delivery',delivery.id,delivery.version,{...delivery},known(delivery.sent,delivery.id),known(delivery.received,delivery.id)));
  }
  for(const group of [view.field_reports,view.return_reports,view.reception_reports,view.verification_reports,view.verification_feedback,view.abort_reports])for(const {report,delivery} of group){
    const received=known(delivery.received,delivery.ref.id),raw={...report};
    entries.push(await entry(view.run_id,'HQ','report',report.ref.id,report.ref.version,raw,report.observed,received));
    entries.push(await entry(view.run_id,'HQ','delivery',delivery.ref.id,delivery.ref.version,{...delivery},known(delivery.sent,delivery.ref.id),received));
    if('confirmation' in raw&&record(raw.confirmation)&&record(raw.confirmation.resources))entries.push(await entry(view.run_id,'HQ','ledger','LEDGER-'+report.ref.id,report.ref.version,raw.confirmation.resources,report.observed,received));
    arrivals.push({id:report.ref.id,received:delivery.received,delivery_id:delivery.ref.id});
  }
  // These are INTEL products, not source Reports. Keep the raw product type
  // and its independent delivery; the view already enforces actual HQ receipt.
  for(const {product,delivery} of [...view.assessments.map(item=>({product:item.assessment,delivery:item.delivery})),...view.preparation_results.map(item=>({product:item.result,delivery:item.delivery}))]){
    const received=known(delivery.received,delivery.ref.id);
    entries.push(await entry(view.run_id,'HQ','event',product.ref.id,product.ref.version,{...product},known(product.completed_at,product.ref.id),received));
    entries.push(await entry(view.run_id,'HQ','delivery',delivery.ref.id,delivery.ref.version,{...delivery},known(delivery.sent,delivery.ref.id),received));
  }
  for(const rejection of rejections)if(rejection.source_revision<view.revision)entries.push(await entry(view.run_id,'HQ','decision',rejection.ref.id,rejection.ref.version,{...rejection},known(rejection.at,rejection.ref.id),known(rejection.at,rejection.ref.id)));
  for(const decision of view.decision_records)entries.push(await entry(view.run_id,'HQ','decision',decision.ref.id,decision.ref.version,{...decision},known(decision.at,decision.ref.id),known(decision.at,decision.ref.id)));
  if(view.outcome)entries.push(await entry(view.run_id,'HQ','event','OUTCOME',1,{...view.outcome},known(view.outcome.finished_at,'OUTCOME'),known(view.outcome.finished_at,'OUTCOME')));
  for(const continuation of view.continuation_records){
    const arrival=arrivals.find(item=>item.id===continuation.report_ref.id);
    if(arrival)entries.push(await entry(view.run_id,'HQ','event',continuation.ref.id,continuation.ref.version,{...continuation},known(continuation.at,continuation.ref.id),known(arrival.received,arrival.delivery_id)));
  }
  for(const receipt of receipts)entries.push(await entry(view.run_id,'HQ','receipt',receipt.operation_id,1,{...receipt},known(receipt.sim_time,receipt.operation_id),known(receipt.sim_time,receipt.operation_id)));
  const processingId='HQ-PROCESSING-node-'+view.revision;
  entries.push(await entry(view.run_id,'HQ','ledger',processingId,1,{...view.processing},known(view.processing.confirmed_at,processingId),{kind:'unknown'}));
  return entries;
}
export function outcome_topic(topic:string,entries:Entry[]):{entries:Entry[];notes:string[];missing:string[]}|null{
  let selected:Entry[],notes:string[]=[];const missing:string[]=[];
  switch(topic){
    case 'evidence':selected=entries;break;
    case 'when_known':selected=entries;notes=['记录时刻与收到时刻分别保留；未知时刻不会补成零或其他时间。'];break;
    case 'when_delivered':selected=entries.filter(e=>e.ref.kind==='delivery');notes=['送达只依据实际送达记录，签发或当地完成不代替总部收到。'];break;
    case 'why_wait':selected=entries.filter(e=>e.ref.kind!=='decision'&&(typeof e.record.reason==='string'||e.record.status==='queued'||e.record.phase==='queued'||e.record.phase==='hold'));notes=['以下只列已记录的等待条件；这些条件不证明角色当时的心理理由。'];break;
    case 'cost':selected=entries.filter(e=>e.ref.kind==='ledger');notes=['以下引用实际已收到的资源账，不用隐藏余额补写当时所知。'];break;
    case 'contradiction':{
      const reports=entries.filter(e=>e.ref.kind==='report'&&record(e.record.typed_payload)&&e.record.typed_payload.kind==='access');
      const values=new Set(reports.map(e=>(e.record.typed_payload as Record<string,unknown>).value));selected=values.size>1?reports:[];
      notes=['并列保留原报告、各自声明与收到时刻；不由终局事实重写原文，也不据署名推断独立性。'];break;
    }
    case 'handover_gap':selected=entries.filter(e=>e.ref.kind==='report'&&('batch_ref' in e.record||'reception_ref' in e.record||'personnel' in e.record));notes=['交接回报和核验回报分别列出，未收到的确认仍是缺口。'];break;
    case 'outcome_vs_evaluation':selected=entries.filter(e=>e.ref.kind==='decision'||e.ref.kind==='event'&&'scoring_cutoff' in e.record);notes=['任务结果与当时决定分开；后来的成败不能修复当时缺少的必要证据。'];notes.push('可展开该决定的评价详情，按原始依据逐维核对；必要材料缺失时保持不可评价。');break;
    default:return null;
  }
  if(selected.some(entry=>Array.isArray(entry.record.attachment_refs)&&entry.record.attachment_refs.length>0))missing.push('附件缺失，无法评价该内容。');
  if(['why_wait','contradiction','outcome_vs_evaluation'].includes(topic)&&selected.some(entry=>!Array.isArray(entry.record.cause_ids)||entry.record.cause_ids.length===0))missing.push('实际原因记录缺失，无法评价客观因果；已记录条件不代表当时心理理由。');
  if(selected.length===0)missing.push('该主体在所选提交节点没有这个主题的必要记录，无法据此补写事实、因果或理由。');
  return {entries:selected,notes,missing};
}
export async function local_outcome_evidence(state:OutcomeState,actor:string):Promise<Entry[]>{
  const entries:Entry[]=[],unknown:KnownTime={kind:'unknown'};
  const own=async(kind:DebriefEvidenceRef['kind'],id:string,version:number,value:Record<string,unknown>,at:KnownTime,received:KnownTime=unknown)=>entries.push(await entry(state.run_id,actor,kind,id,version,value,at,received));
  for(const observation of state.local_observations.filter(o=>o.actor===actor))entries.push(await entry(state.run_id,actor,'local_observation',observation.ref.id,observation.ref.version,{...observation},known(observation.at,observation.ref.id),{kind:'unknown'}));
  for(const report of [...state.prefix.field.reports,...state.return_reports].filter(r=>r.actor===actor)){
    await own('report',report.ref.id,report.ref.version,{...report},report.observed);
    await own('ledger','LEDGER-'+report.ref.id,report.ref.version,{...report.confirmation.resources},report.observed);
  }
  for(const report of state.abort_reports.filter(r=>r.actor===actor))await own('report',report.ref.id,report.ref.version,{...report},report.observed);
  for(const notification of state.notifications.filter(n=>n.target===actor&&n.received!==null))await own('delivery',notification.ref.id,notification.ref.version,{...notification},known(notification.sent,notification.ref.id),known(notification.received!,notification.ref.id));
  for(const notification of state.abort_notifications.filter(n=>n.target===actor&&n.received!==null))await own('delivery',notification.ref.id,notification.ref.version,{...notification},known(notification.sent,notification.ref.id),known(notification.received!,notification.ref.id));
  if(actor==='ArchiveSource'){
    const id='SOURCE-RESOURCES-'+state.revision;await own('ledger',id,1,{...state.prefix.source.resources},known(state.sim_time,id));
    const report=state.prefix.reports.find(r=>r.id===state.prefix.source.published_report_ref);if(report)await own('report',report.id,report.version,{...report},report.observed);
  }
  if(actor==='H'){
    for(const delivery of state.return_deliveries.filter(d=>d.target==='H'&&d.received<=state.sim_time)){
      const report=state.return_reports.find(r=>r.ref.id===delivery.report_ref.id)!;
      await own('report',report.ref.id,report.ref.version,{...report},report.observed,known(delivery.received,delivery.ref.id));await own('delivery',delivery.ref.id,delivery.ref.version,{...delivery},known(delivery.sent,delivery.ref.id),known(delivery.received,delivery.ref.id));
    }
    for(const report of state.reception_reports)await own('report',report.ref.id,report.ref.version,{...report},report.observed);
    for(const receipt of state.person_receipts)await own('receipt',receipt.ref.id,receipt.ref.version,{...receipt},known(receipt.received_at,receipt.ref.id));
    for(const event of state.custody_events)await own('event',event.ref.id,event.ref.version,{...event},known(event.at,event.ref.id));
    for(const batch of state.reception_batches)await own('event',batch.ref.id+'-node-'+state.revision,batch.ref.version,{...batch},known(state.sim_time,batch.ref.id));
  }
  if(actor==='INTEL'){
    for(const delivery of state.reception_deliveries.filter(d=>d.target==='INTEL'&&d.received<=state.sim_time)){
      const report=state.reception_reports.find(r=>r.ref.id===delivery.report_ref.id)!;await own('report',report.ref.id,report.ref.version,{...report},report.observed,known(delivery.received,delivery.ref.id));await own('delivery',delivery.ref.id,delivery.ref.version,{...delivery},known(delivery.sent,delivery.ref.id),known(delivery.received,delivery.ref.id));
    }
    for(const report of [...state.verification_reports,...state.verification_status_reports])await own('report',report.ref.id,report.ref.version,{...report},report.observed);
    for(const result of [...state.prefix.processing.assessments,...state.prefix.processing.preparations])await own('event',result.ref.id,result.ref.version,{...result},known(result.completed_at,result.ref.id));
    for(const item of state.prefix.processing.items)await own('event',item.ref.id+'-node-'+state.revision,item.ref.version,{...item},known(state.sim_time,item.ref.id));
    for(const reservation of state.prefix.processing.reservations)await own('ledger',reservation.ref.id+'-node-'+state.revision,reservation.ref.version,{...reservation},known(state.sim_time,reservation.ref.id));
    for(const batch of state.verification_batches)await own('ledger',batch.ref.id+'-node-'+state.revision,batch.ref.version,{...batch},known(state.sim_time,batch.ref.id));
  }
  return entries;
}
// Caller first validates the finished-session permission and actual exposure.
// These raw engine records never enter a known_then index or normal PlayerView.
export async function engine_outcome_evidence(state:OutcomeState,actor:string):Promise<Entry[]>{
  const entries:Entry[]=[],unknown:KnownTime={kind:'unknown'};
  async function add(kind:DebriefEvidenceRef['kind'],value:Record<string,unknown>,owners:string[],at:KnownTime){
    if(actor!=='HQ'&&!owners.includes(actor))return;
    const ref=record(value.ref)?value.ref:record(value)&&typeof value.id==='string'?{id:value.id,version:value.version}:null;
    if(!ref||typeof ref.id!=='string'||typeof ref.version!=='number')return;
    entries.push(await entry(state.run_id,actor,kind,ref.id,ref.version,value,at,unknown,'engine_event'));
  }
  if(actor==='HQ'||actor==='ArchiveSource')entries.push(await entry(state.run_id,actor,'ledger','SOURCE-RESOURCES-'+state.revision,1,{...state.prefix.source.resources},known(state.sim_time,'SOURCE-RESOURCES-'+state.revision),unknown,'engine_event'));
  for(const report of state.prefix.reports)await add('report',{...report},report.id===state.prefix.source.published_report_ref?['ArchiveSource']:[],report.observed);
  for(const report of state.prefix.field.reports)await add('report',{...report},[report.actor],report.observed);
  for(const report of state.return_reports)await add('report',{...report},[report.actor],report.observed);
  for(const report of state.reception_reports)await add('report',{...report},['H',report.subject_actor],report.observed);
  for(const report of state.verification_reports)await add('report',{...report},['INTEL',report.subject_actor],report.observed);
  for(const report of state.verification_status_reports)await add('report',{...report},['INTEL',report.subject_actor],report.observed);
  for(const report of state.abort_reports)await add('report',{...report},[report.actor],report.observed);
  for(const event of state.continuation_records)await add('event',{...event},[event.actor],known(event.at,event.ref.id));
  for(const event of state.handover_confirmations)await add('event',{...event},[event.actor],known(event.at,event.ref.id));
  for(const ledger of state.prefix.processing.reservations)await add('ledger',{...ledger},['INTEL'],known(ledger.from,ledger.ref.id));
  for(const ledger of state.verification_batches)await add('ledger',{...ledger},['INTEL'],known(ledger.queued_at,ledger.ref.id));
  for(const ledger of state.prefix.field.orders)await add('ledger',{...ledger},[ledger.payload.actor_ref.id],known(ledger.issued_at,ledger.ref.id));
  for(const receipt of state.person_receipts)await add('receipt',{...receipt},['H',receipt.person_id.split('-')[0]],known(receipt.received_at,receipt.ref.id));
  for(const event of state.custody_events)await add('event',{...event},[event.from,event.to],known(event.at,event.ref.id));
  for(const delivery of state.verification_deliveries)await add('delivery',{...delivery},['INTEL'],known(delivery.sent,delivery.ref.id));
  for(const observation of state.local_observations)await add('local_observation',{...observation},[observation.actor],known(observation.at,observation.ref.id));
  return entries;
}
