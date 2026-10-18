import type {OutcomePlayerView,OutcomeProgress} from '../outcome-contracts';

// This seam accepts the already projected HQ view. It cannot inspect local
// work, future deliveries, hidden lineage or a private execution clock.
export function outcome_progress(view:Omit<OutcomePlayerView,'progress'>):OutcomeProgress {
  const first=new Map<string,number>();
  const add=(id:string,at:number)=>first.set(id,Math.min(first.get(id)??Infinity,at));
  for(const {report,delivery} of view.received_reports)add('raw:'+report.id,delivery.received);
  for(const group of [view.abort_reports,view.field_reports,view.return_reports,view.reception_reports,view.verification_reports,view.verification_feedback])for(const {report,delivery} of group)add(report.ref.kind+':'+report.ref.id,delivery.received);
  for(const {assessment,delivery} of view.assessments)add('assessment:'+assessment.subject_ref.id+':'+JSON.stringify(assessment.conclusion),delivery.received);
  for(const {result,delivery} of view.preparation_results)add('preparation:'+result.ref.id,delivery.received);
  const last_progress_at=Math.max(0,...first.values()),warning_at=last_progress_at+120000;
  const latest=new Map<string,OutcomePlayerView['verification_feedback'][number]>();
  for(const item of view.verification_feedback){const prior=latest.get(item.report.batch_ref.id);if(!prior||item.delivery.received>=prior.delivery.received)latest.set(item.report.batch_ref.id,item);}
  const waits=[...latest.values()].filter(item=>!view.verification_reports.some(done=>done.report.batch_ref.id===item.report.batch_ref.id)&&item.report.expected_until!==null).map(item=>item.report.expected_until!);
  const waiting_until=waits.length?Math.max(...waits):null;
  const warning=!view.finished&&view.sim_time>=warning_at&&(waiting_until===null||view.sim_time>=waiting_until);
  return {last_progress_at,warning_at,waiting_until,warning,message:warning?'暂无新增总部反馈':null};
}
