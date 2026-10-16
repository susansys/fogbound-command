import {GameError} from '../contracts';
import type {IntelligenceSourceRequest} from '../intelligence-protocol';
import type {IntelligenceState} from './intelligence-state';
export function validate_source_request(state:IntelligenceState,request:IntelligenceSourceRequest){
  if(request.run_id!==state.run_id||request.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  for(const ref of request.intent.basis_delivery_refs){
    const delivery=state.deliveries.find(d=>d.id===ref.id&&d.version===ref.version&&d.run_id===state.run_id&&d.target==='HQ'&&d.received<=state.sim_time);
    const report=delivery&&state.reports.find(r=>r.id===delivery.report_ref.id&&r.version===delivery.report_ref.version&&r.run_id===state.run_id&&r.source_published<=delivery.received);
    if(!delivery||!report)throw new GameError('INVALID_REQUEST');
  }
}
