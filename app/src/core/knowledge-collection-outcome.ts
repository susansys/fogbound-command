import type {KnowledgeCollectionState} from './knowledge-collection-state';
import type {CollectionRef} from '../knowledge-collection-contracts';

/** Goal evidence belongs to HQ: private completion alone cannot settle a run. */
export function settle_collection_outcome(state:KnowledgeCollectionState,cap=false){
  if(!state.result){
    const evidence:CollectionRef<string>[]=[];
    const records:CollectionRef<'record'>[]=[],qualified:('R'|'W')[]=[];
    for(const actor of ['R','W'] as const){
      const handover=state.process_reports.find(report=>report.method==='H-record-handover'&&report.body.actor===actor&&report.body.people===3&&report.body.outcome==='transferred'&&report.body.completed_at<=state.definition.public_rules.deadline&&state.process_deliveries.some(delivery=>delivery.report_ref.id===report.ref.id&&delivery.received_at<=state.definition.public_rules.deadline+state.definition.public_rules.receipt_grace));
      const verification=state.process_reports.find(report=>report.method==='INTEL-record-verification'&&report.body.actor===actor&&report.body.verification.result===(actor==='R'?'authentic_limited':'authentic_qualified')&&report.body.verification.completed_at<=state.definition.public_rules.deadline&&state.process_deliveries.some(delivery=>delivery.report_ref.id===report.ref.id&&delivery.received_at<=state.definition.public_rules.deadline+state.definition.public_rules.receipt_grace));
      if(!handover||handover.method!=='H-record-handover'||!verification||verification.method!=='INTEL-record-verification'||!handover.body.record_refs.some(ref=>ref.id===verification.body.verification.record_ref.id))continue;
      evidence.push(handover.ref,verification.ref,...state.process_deliveries.filter(delivery=>delivery.report_ref.id===handover.ref.id||delivery.report_ref.id===verification.ref.id).map(delivery=>delivery.ref));
      records.push(verification.body.verification.record_ref);qualified.push(actor);
    }
    const safe=(['R','W'] as const).filter(actor=>state.process_reports.some(report=>report.method==='H-record-handover'&&report.body.actor===actor&&report.body.people===3&&state.process_deliveries.some(delivery=>delivery.report_ref.id===report.ref.id))||state.termination?.cleanup_reports.some(report=>report.source_actor===actor&&state.termination!.cleanup_deliveries.some(delivery=>delivery.report_ref.id===report.ref.id)));
    const cleanup_complete=state.termination&&safe.length===2&&state.termination.tasks.every(task=>task.completed_at!==null)&&!state.source_messages.some(message=>message.status==='queued'||message.status==='sending')&&!state.intel.jobs.some(job=>job.status==='processing')&&!state.handovers.some(task=>task.status==='receiving');
    if(records.length!==2&&!cleanup_complete&&!cap)return;
    if(records.length===2&&safe.length!==2&&!cap)return;
    const outcome=records.length===2&&safe.length===2?'success':records.length===1&&safe.length===2?'partial':state.termination?.trigger==='player'?'aborted':'failure';
    if(state.termination){
      state.termination.recovery_unconfirmed=(['R','W'] as const).filter(actor=>!safe.includes(actor));
      evidence.push(...state.termination.cleanup_deliveries.flatMap(delivery=>[delivery.report_ref,delivery.ref]));
    }
    state.result={ref:{run_id:state.run_id,kind:'outcome',id:'knowledge-collection-outcome',version:1},outcome,known_at:state.sim_time,safe_people:safe.length*3,missing_records:(['R','W'] as const).filter(actor=>!qualified.includes(actor)),reason_codes:[...(outcome==='success'?[]:outcome==='partial'?['incomplete_record_goal']:outcome==='aborted'?['task_terminated']:['entity_deadline']),...(cap&&safe.length!==2?['recovery_unconfirmed']:[])],limits:['R的有限记录不确认设施状况','W的核验仅适用于登记范围与版本'],verified_records:structuredClone(records),evidence_refs:structuredClone(evidence)};
    state.status='terminating';
  }
  // Non-preemptible work and already transmitted messages keep their real costs.
  const active=!!state.termination&&state.termination.tasks.some(task=>task.completed_at===null||!state.termination!.cleanup_deliveries.some(delivery=>delivery.report_ref.id===task.report_ref?.id))||state.intel.jobs.some(job=>job.status==='processing'||job.status==='queued')||state.handovers.some(task=>task.status==='receiving'||task.status==='queued')||state.requests.some(task=>['tasking','waiting','collecting','registering'].includes(task.status))||state.archive_requests.some(task=>['tasking','reading','registering'].includes(task.status))||state.position_requests.some(task=>task.outcome===null&&task.cancelled_at===undefined)||state.commands.some(command=>command.status==='queued'||command.status==='sending')||state.source_messages.some(message=>message.status==='queued'||message.status==='sending');
  if(cap||!active){state.finished=true;state.ended=true;state.paused=true;state.status='finished';if(!cap){state.actors.R.off=true;state.actors.W.off=true;}}
}
