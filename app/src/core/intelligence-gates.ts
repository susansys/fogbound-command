import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceActivityRequest} from '../intelligence-contracts';

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
export function carried_record_conditions(state:IntelligenceState,input:IntelligenceActivityRequest['intent'],issued:number,site:string):boolean{
  const product=input.basis_delivery_refs.filter(r=>r.kind==='product_delivery').map(ref=>state.processing.deliveries.find(d=>d.ref.id===ref.id&&d.ref.version===ref.version&&d.received<=issued)).find(d=>d?.product_ref.kind==='assessment');
  const assessment=product&&state.processing.assessments.find(a=>a.ref.id===product.product_ref.id);
  const repair=input.basis_delivery_refs.filter(r=>r.kind==='field_delivery').map(ref=>state.field.deliveries.find(d=>d.ref.id===ref.id&&d.ref.version===ref.version&&d.received<=issued)).map(d=>state.field.reports.find(r=>r.ref.id===d?.report_ref.id)).find(r=>r?.repair_condition==='repaired'&&r.confirmation.position.site===site);
  return !!assessment&&!!repair;
}
