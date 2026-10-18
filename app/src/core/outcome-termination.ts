import type {OutcomeState} from './outcome-state';
import type {OutcomeDefinition} from './outcome-definition';
import {intelligence_site} from './intelligence-execution';

// Delivery belongs to each recipient's legal local context. A moving W has
// neither a portable terminal nor access to a fixed facility merely because
// its last registered site still says B.
export function receive_outcome_abort(state:OutcomeState, at:number, definition:OutcomeDefinition):void {
  for (const message of state.abort_notifications) {
    if (message.received !== null || message.eligible_at > at) continue;
    const moving=state.return_plans.some(p=>p.actor===message.target&&p.status==='returning')||state.prefix.field.orders.some(o=>o.payload.actor_ref.id===message.target&&o.status==='running'&&definition.prefix_definition.catalogs.activities.some(a=>a.id===o.payload.activity_ref.id&&a.action==='move'));
    const actor=message.target==='R'||message.target==='W'?state.prefix.field.actors.find(a=>a.actor===message.target)!:null;
    const fixed = actor!==null && !moving && actor.facility_authorized &&
        JSON.stringify(actor.position.point) === JSON.stringify(intelligence_site(definition.prefix_definition, actor.position.site)) &&
        (actor.position.site === 'H' || definition.prefix_definition.catalogs.fixed_facilities.some(f => f.location === actor.position.site && f.actors.includes(actor.actor)));
    let canReceive = message.target === 'H' || message.target === 'INTEL';
    if (actor) {
      canReceive = fixed || actor.actor === 'R' && actor.equipment.includes('LINK') && actor.resources.link_durability > 0;
    }
    if (canReceive) {
      message.received = at;
      const cancelled_primary_refs:import('../intelligence-contracts').IntelligenceRef<'work_item'>[]=[];
      const original=message.original_decision_ref,reportRef={run_id:state.run_id,kind:'abort_report' as const,id:message.ref.id+'-accepted',version:1};
      let channel:'R-portable'|'H-fixed'|'B-fixed'|null='H-fixed';
      if(actor){
        if(fixed)channel=actor.position.site==='H'?'H-fixed':'B-fixed';
        else if(actor.actor==='R'&&actor.equipment.includes('LINK')&&actor.resources.link_energy>=definition.profile.parameters.send_energy_cost&&actor.resources.link_durability>=definition.profile.parameters.send_wear_cost){channel='R-portable';actor.resources.link_energy-=definition.profile.parameters.send_energy_cost;actor.resources.link_durability-=definition.profile.parameters.send_wear_cost;}
        else channel=null;
      }
      if(channel)state.abort_deliveries.push({ref:{run_id:state.run_id,kind:'abort_delivery',id:'D-'+reportRef.id,version:1},report_ref:reportRef,target:'HQ',sent:at,received:at+definition.profile.parameters.link_ms,channel});
      if (message.target === 'INTEL') {
        for (const batch of state.verification_batches.filter(b => b.purpose === 'primary' && b.status === 'queued')) {
          batch.status = 'cutoff'; batch.completed_at = at; batch.settled = true;
          state.prefix.processing.energy_reserved -= batch.reserved_energy;
          const cost = definition.profile.outcome.verification_energy;
          const reserved = state.prefix.processing.energy-state.prefix.processing.energy_reserved >= cost ? cost : 0;
          state.prefix.processing.energy_reserved += reserved;
          state.verification_batches.push({...structuredClone(batch),ref:{...batch.ref,id:'VC-'+batch.reception_ref.id},purpose:'personnel_cleanup',queued_at:at,status:'queued',started_at:null,completed_at:null,reserved_energy:reserved,settled:false});
        }
        for (const work of state.prefix.processing.items.filter(w => w.status === 'queued')) {
          const reservation = state.prefix.processing.reservations.find(r => r.ref.id === work.reservation_ref.id)!;
          work.status = 'cutoff'; work.completed_at = at;
          state.prefix.processing.energy_reserved -= reservation.quantity;
          reservation.status = 'released'; reservation.to = at;
          cancelled_primary_refs.push(structuredClone(work.ref));
        }
      }
      state.abort_reports.push({cancelled_primary_refs,ref:reportRef,notification_ref:structuredClone(message.ref),original_decision_ref:structuredClone(original),actor:message.target,observed:{kind:'known',value:at,evidence:reportRef.id},source_event_time:{kind:'unknown'},source_published:at,cleanup_deadline:state.termination!.cleanup_deadline});
    }
  }
}
