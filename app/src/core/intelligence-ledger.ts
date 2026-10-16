import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceDefinition} from './intelligence-definition';
import type {IntelligenceWorkItem,IntelligencePreparationResult} from '../intelligence-contracts';

export function complete_preparation(state:IntelligenceState,item:IntelligenceWorkItem,at:number,definition:IntelligenceDefinition){
  const plan=item.plan!;
  // These are headquarters commitments against its lawful initial confirmation,
  // not W-local reservations or a shipment of new supplies to W.
  const known=definition.catalogs.actors.find(a=>a.id==='W')!.repair_packs!,held=state.processing.supply_commitments.filter(r=>r.status==='held').reduce((n,r)=>n+r.quantity,0),approved=known-held>=plan.repair_packs;
  const ref:IntelligencePreparationResult['ref']={run_id:state.run_id,kind:approved?'preparation_approval':'preparation_result',id:(approved?'PA-':'PR-')+item.ref.id,version:1};
  const reservation={run_id:state.run_id,kind:'reservation' as const,id:'W-'+item.ref.id,version:1};
  const result:IntelligencePreparationResult={ref,status:approved?'approved':'not_approved',author:'INTEL',plan_ref:structuredClone(plan.ref),purpose:plan.purpose,work_ref:structuredClone(item.ref),completed_at:at,reservation_refs:approved?[reservation]:[],reason:approved?null:'known_supplies_unavailable'};
  if(approved)state.processing.supply_commitments.push({ref:reservation,owner:'HQ',resource_owner:'W',resource:'repair_pack',quantity:plan.repair_packs,plan_ref:structuredClone(plan.ref),approval_ref:{...ref,kind:'preparation_approval'},from:at,to:definition.profile.parameters.deadline,status:'held'});
  state.processing.preparations.push(result);
  state.processing.deliveries.push({ref:{run_id:state.run_id,kind:'product_delivery',id:'D-'+ref.id,version:1},product_ref:ref,sender:'INTEL',target:'HQ',sent:at,received:at+definition.profile.parameters.link_ms});
}
