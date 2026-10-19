import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceActivityRequest} from '../intelligence-contracts';
import {is_conflicting_field_hash} from './conflicting-action-definition';
import type {ConflictingFacilityState} from './conflicting-action-state';

// A local reader receives exactly these immutable, already-delivered products
// with its order. It cannot satisfy a gate from another actor's private state.
export function carried_preparation(state:IntelligenceState,input:IntelligenceActivityRequest['intent'],issued:number){
  const delivery=input.basis_delivery_refs.filter(r=>r.kind==='product_delivery').map(ref=>state.processing.deliveries.find(d=>d.ref.id===ref.id&&d.ref.version===ref.version&&d.received<=issued)).find(d=>d?.product_ref.kind==='preparation_approval');
  const approval=delivery&&state.processing.preparations.find(a=>a.ref.id===delivery.product_ref.id&&a.status==='approved');
  return approval??null;
}
export function current_preparation(state:IntelligenceState,input:IntelligenceActivityRequest['intent'],issued:number){
  const approval=carried_preparation(state,input,issued);
  return approval&&approval.plan_ref.id===state.plan?.ref.id&&approval.plan_ref.version===state.plan.ref.version?approval:null;
}
export function carried_record_conditions(state:IntelligenceState,input:IntelligenceActivityRequest['intent'],issued:number,site:string,facility?:ConflictingFacilityState):boolean{
  const product=input.basis_delivery_refs.filter(r=>r.kind==='product_delivery').map(ref=>state.processing.deliveries.find(d=>d.ref.id===ref.id&&d.ref.version===ref.version&&d.received<=issued)).find(d=>d?.product_ref.kind==='assessment');
  const assessment=product&&state.processing.assessments.find(a=>a.ref.id===product.product_ref.id);
  const repair=input.basis_delivery_refs.filter(r=>r.kind==='field_delivery').map(ref=>state.field.deliveries.find(d=>d.ref.id===ref.id&&d.ref.version===ref.version&&d.received<=issued)).map(d=>state.field.reports.find(r=>r.ref.id===d?.report_ref.id)).find(r=>r?.repair_condition==='repaired'&&r.confirmation.position.site===site);
  if(!is_conflicting_field_hash(state.definition_hash))return !!assessment&&!!repair;
  const known=state.field.deliveries.filter(delivery=>delivery.target==='HQ'&&delivery.received<=issued).map(delivery=>state.field.reports.find(report=>report.ref.id===delivery.report_ref.id&&report.ref.version===delivery.report_ref.version)).filter(report=>report?.facility_confirmation?.target===site);
  const version=Math.max(1,...known.map(report=>report!.facility_confirmation!.version));
  const carried=input.basis_delivery_refs.filter(ref=>ref.kind==='field_delivery').map(ref=>state.field.deliveries.find(delivery=>delivery.ref.id===ref.id&&delivery.ref.version===ref.version&&delivery.received<=issued)).map(delivery=>known.find(report=>report?.ref.id===delivery?.report_ref.id&&report?.ref.version===delivery?.report_ref.version));
  const usable=carried.some(report=>report?.phase==='completed'&&report.confirmation.position.site===site&&report.facility_confirmation?.target===site&&report.facility_confirmation.condition==='operable'&&report.facility_confirmation.version===version);
  // Headquarters admission uses only delivered evidence. The local reader
  // additionally verifies its own current facility when it accepts the order.
  return !!assessment&&usable&&(!facility||facility.current==='operable'&&facility.version===version);
}
